import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Open (creating if needed) the SQLite database and apply pending migrations.
 * @param {string} path File path, or ':memory:' for tests.
 */
export function openDatabase(path, { migrationsDir = MIGRATIONS_DIR } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  return db;
}

/**
 * Apply every `*.sql` file in `dir` that hasn't been applied yet, in filename order,
 * each in its own transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {string} dir
 * @returns {string[]} names of the migrations applied by this call
 */
export function runMigrations(db, dir) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name),
  );
  const pending = readdirSync(dir)
    .filter((file) => file.endsWith('.sql') && !applied.has(file))
    .sort();

  const record = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  for (const file of pending) {
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, Date.now());
    })();
  }
  return pending;
}
