import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/index.js';
import {
  addBannedWord,
  getBannedWords,
  getSettings,
  removeBannedWord,
  setSettings,
} from '../../src/features/guildSettings.js';
import { addWarning, clearWarnings, listWarnings } from '../../src/features/warnings.js';

function db() {
  const d = new Database(':memory:');
  migrate(d);
  return d;
}

test('a guild with no row still gets sensible defaults', () => {
  const d = db();
  const settings = getSettings(d, 'g1');
  assert.equal(settings.modlog_channel_id, null);
  assert.equal(settings.automod_enabled, 0);
  assert.equal(settings.ai_enabled, 1, 'AI is on by guild default');
  d.close();
});

test('settings are written then read back, and updates do not clear siblings', () => {
  const d = db();
  setSettings(d, 'g1', { modlog_channel_id: 'c1' });
  setSettings(d, 'g1', { automod_enabled: 1 });

  const settings = getSettings(d, 'g1');
  assert.equal(settings.modlog_channel_id, 'c1', 'the earlier value survives');
  assert.equal(settings.automod_enabled, 1);
  d.close();
});

test('an unknown column is refused rather than built into SQL', () => {
  const d = db();
  assert.throws(() => setSettings(d, 'g1', { drop_table: 1 }), /unknown setting/);
  d.close();
});

test('banned words are stored once, lower-cased, and per guild', () => {
  const d = db();
  assert.equal(addBannedWord(d, 'g1', ' SPAM '), true);
  assert.equal(addBannedWord(d, 'g1', 'spam'), false, 'already there');
  assert.deepEqual(getBannedWords(d, 'g1'), ['spam']);
  assert.deepEqual(getBannedWords(d, 'g2'), [], 'other guilds are separate');

  assert.equal(removeBannedWord(d, 'g1', 'SPAM'), true);
  assert.deepEqual(getBannedWords(d, 'g1'), []);
  d.close();
});

test('warnings accumulate per member and clear together', () => {
  const d = db();
  addWarning(d, { guildId: 'g1', userId: 'u1', moderatorId: 'm1', reason: 'first' });
  addWarning(d, { guildId: 'g1', userId: 'u1', moderatorId: 'm1', reason: 'second' });
  addWarning(d, { guildId: 'g1', userId: 'u2', moderatorId: 'm1', reason: 'other' });

  assert.equal(listWarnings(d, 'g1', 'u1').length, 2);
  assert.equal(listWarnings(d, 'g1', 'u1')[0].reason, 'second', 'newest first');
  assert.equal(listWarnings(d, 'g2', 'u1').length, 0, 'scoped to the guild');

  assert.equal(clearWarnings(d, 'g1', 'u1'), 2);
  assert.equal(listWarnings(d, 'g1', 'u1').length, 0);
  assert.equal(listWarnings(d, 'g1', 'u2').length, 1, 'other members untouched');
  d.close();
});
