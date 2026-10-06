import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/index.js';
import {
  MAX_PER_USER,
  cancelReminder,
  createReminder,
  dueReminders,
  listReminders,
  startReminderLoop,
} from '../../src/features/reminders.js';

function db() {
  const database = new Database(':memory:');
  migrate(database);
  return database;
}

const base = { channelId: 'c1', guildId: 'g1', message: 'stretch' };

test('a reminder is stored and listed back', () => {
  const d = db();
  const id = createReminder(d, { ...base, userId: 'u1', dueAt: 1000 });
  assert.ok(id);

  const [row] = listReminders(d, 'u1');
  assert.equal(row.message, 'stretch');
  assert.equal(row.due_at, 1000);
  assert.deepEqual(listReminders(d, 'someone-else'), []);
  d.close();
});

test('only reminders already due are returned, including missed ones', () => {
  const d = db();
  createReminder(d, { ...base, userId: 'u1', dueAt: 500, message: 'past' });
  createReminder(d, { ...base, userId: 'u1', dueAt: 5000, message: 'future' });

  const due = dueReminders(d, 1000);
  assert.equal(due.length, 1);
  assert.equal(due[0].message, 'past');

  // A reminder missed while offline is still due much later, not skipped.
  assert.equal(dueReminders(d, 10_000).length, 2);
  d.close();
});

test('you can only cancel your own', () => {
  const d = db();
  const id = createReminder(d, { ...base, userId: 'u1', dueAt: 1000 });
  assert.equal(cancelReminder(d, 'u2', id), false);
  assert.equal(listReminders(d, 'u1').length, 1);
  assert.equal(cancelReminder(d, 'u1', id), true);
  assert.equal(listReminders(d, 'u1').length, 0);
  d.close();
});

test('the per-user cap is enforced', () => {
  const d = db();
  for (let i = 0; i < MAX_PER_USER; i++) {
    assert.ok(createReminder(d, { ...base, userId: 'u1', dueAt: 1000 + i }));
  }
  assert.equal(createReminder(d, { ...base, userId: 'u1', dueAt: 9999 }), null);
  assert.ok(
    createReminder(d, { ...base, userId: 'u2', dueAt: 1000 }),
    'other users unaffected',
  );
  d.close();
});

test('the loop delivers due reminders once and deletes them', async () => {
  const d = db();
  createReminder(d, { ...base, userId: 'u1', dueAt: Date.now() - 1000 });
  createReminder(d, { ...base, userId: 'u1', dueAt: Date.now() + 600_000 });

  const sent = [];
  const stop = startReminderLoop({
    db: d,
    send: async (reminder) => sent.push(reminder.id),
    intervalMs: 1_000_000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.equal(sent.length, 1);
  assert.equal(listReminders(d, 'u1').length, 1, 'the future one survives');
  d.close();
});

test('a reminder that fails to send is still removed, so it cannot loop forever', async () => {
  const d = db();
  createReminder(d, { ...base, userId: 'u1', dueAt: Date.now() - 1000 });

  const warnings = [];
  const stop = startReminderLoop({
    db: d,
    logger: { warn: (...args) => warnings.push(args), error: () => {} },
    send: async () => {
      throw new Error('channel gone');
    },
    intervalMs: 1_000_000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.equal(listReminders(d, 'u1').length, 0);
  assert.equal(warnings.length, 1);
  d.close();
});
