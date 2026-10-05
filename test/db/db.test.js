import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '../../src/db/index.js';

test('openDatabase applies the initial schema', () => {
  const db = openDatabase(':memory:');
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
  for (const table of [
    'schema_migrations',
    'guild_settings',
    'banned_words',
    'warnings',
    'reminders',
    'role_menus',
    'role_menu_roles',
    'rps_games',
    'user_memories',
    'ai_opt_out',
  ]) {
    assert.ok(tables.includes(table), `missing table ${table}`);
  }
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  db.close();
});

test('runMigrations applies in order, only once, and rolls back failures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  writeFileSync(join(dir, '002_more.sql'), 'ALTER TABLE t ADD COLUMN b TEXT;');
  writeFileSync(join(dir, '001_first.sql'), 'CREATE TABLE t (a TEXT);');
  writeFileSync(join(dir, 'notes.txt'), 'ignored');

  const db = new Database(':memory:');
  assert.deepEqual(runMigrations(db, dir), ['001_first.sql', '002_more.sql']);
  assert.deepEqual(runMigrations(db, dir), []);

  writeFileSync(join(dir, '003_broken.sql'), 'CREATE TABLE u (x TEXT); NOT VALID SQL;');
  assert.throws(() => runMigrations(db, dir));
  const hasU = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'u'").get();
  assert.equal(hasU, undefined, 'failed migration must not leave partial changes');
  const names = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all();
  assert.deepEqual(
    names.map((row) => row.name),
    ['001_first.sql', '002_more.sql'],
  );
  db.close();
});
