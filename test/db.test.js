import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../src/db/index.js';

function fresh() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

test('migrations create the schema and are recorded', () => {
  const db = fresh();
  const applied = migrate(db);
  assert.ok(applied.includes('001_init.sql'));

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);

  for (const expected of [
    'guild_settings',
    'banned_words',
    'warnings',
    'reminders',
    'role_menus',
    'role_menu_roles',
    'rps_games',
    'user_memories',
    'ai_opt_out',
    'schema_migrations',
  ]) {
    assert.ok(tables.includes(expected), `missing table ${expected}`);
  }
  db.close();
});

test('running migrations twice applies nothing the second time', () => {
  const db = fresh();
  migrate(db);
  assert.deepEqual(migrate(db), [], 'second run should be a no-op');
  db.close();
});

test('role menu roles are removed with their menu', () => {
  const db = fresh();
  migrate(db);

  db.prepare(
    'INSERT INTO role_menus (message_id, guild_id, channel_id, title) VALUES (?, ?, ?, ?)',
  ).run('m1', 'g1', 'c1', 'Pick a colour');
  db.prepare(
    'INSERT INTO role_menu_roles (message_id, role_id, label) VALUES (?, ?, ?)',
  ).run('m1', 'r1', 'Red');

  db.prepare('DELETE FROM role_menus WHERE message_id = ?').run('m1');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM role_menu_roles').get().n, 0);
  db.close();
});
