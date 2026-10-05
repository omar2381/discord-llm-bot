import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCommands, loadComponents, loadEvents } from '../../src/util/loadModules.js';
import { COMMANDS_DIR, EVENTS_DIR } from '../../src/paths.js';

function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'modules-'));
  for (const [name, source] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, source);
  }
  return dir;
}

const command = (name) =>
  `export const data = { name: '${name}', toJSON: () => ({ name: '${name}' }) };
   export async function execute() {}`;

test('loads commands from nested folders, keyed by name', async () => {
  const dir = fixtureDir({ 'fun/a.js': command('a'), 'utility/b.js': command('b') });
  const commands = await loadCommands(dir);
  assert.deepEqual([...commands.keys()].sort(), ['a', 'b']);
});

test('rejects malformed and duplicate commands', async () => {
  await assert.rejects(
    loadCommands(fixtureDir({ 'x.js': 'export const data = {};' })),
    /must export `data`/,
  );
  await assert.rejects(
    loadCommands(fixtureDir({ 'x.js': "export const data = { name: 'x', toJSON() {} };" })),
    /must export an `execute`/,
  );
  await assert.rejects(
    loadCommands(fixtureDir({ 'a.js': command('same'), 'b.js': command('same') })),
    /duplicate command name "same"/,
  );
});

test('a missing folder loads nothing', async () => {
  assert.equal((await loadComponents(join(tmpdir(), 'does-not-exist-xyz'))).size, 0);
});

test('validates component prefixes', async () => {
  const ok = fixtureDir({ 'rps.js': "export const prefix = 'rps'; export function execute() {}" });
  assert.ok((await loadComponents(ok)).has('rps'));
  await assert.rejects(
    loadComponents(
      fixtureDir({ 'x.js': "export const prefix = 'a:b'; export function execute() {}" }),
    ),
    /must not contain ":"/,
  );
});

test("the bot's real commands and events all load", async () => {
  const commands = await loadCommands(COMMANDS_DIR);
  assert.ok(commands.has('ping'));
  for (const c of commands.values()) c.data.toJSON(); // throws if a builder is invalid
  const events = await loadEvents(EVENTS_DIR);
  assert.ok(events.length >= 2);
});
