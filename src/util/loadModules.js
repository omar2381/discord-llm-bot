import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Recursively list `.js` files under `dir`, sorted for a stable load order. */
function listJsFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

async function importAll(dir) {
  const files = listJsFiles(dir);
  return Promise.all(
    files.map(async (file) => ({ file, module: await import(pathToFileURL(file).href) })),
  );
}

/**
 * Load slash commands. Each module must export `data` (a SlashCommandBuilder or
 * anything with `name` and `toJSON()`) and `execute(interaction, ctx)`.
 * @returns {Promise<Map<string, object>>} keyed by command name
 */
export async function loadCommands(dir) {
  const commands = new Map();
  for (const { file, module } of await importAll(dir)) {
    if (!module.data?.name || typeof module.data.toJSON !== 'function') {
      throw new Error(`${file}: command must export \`data\` (a SlashCommandBuilder)`);
    }
    if (typeof module.execute !== 'function') {
      throw new Error(`${file}: command must export an \`execute\` function`);
    }
    if (commands.has(module.data.name)) {
      throw new Error(`${file}: duplicate command name "${module.data.name}"`);
    }
    commands.set(module.data.name, module);
  }
  return commands;
}

/**
 * Load event handlers. Each module must export `name`, `execute(...args, ctx)`
 * and optionally `once`.
 */
export async function loadEvents(dir) {
  return (await importAll(dir)).map(({ file, module }) => {
    if (!module.name || typeof module.execute !== 'function') {
      throw new Error(`${file}: event must export \`name\` and an \`execute\` function`);
    }
    return module;
  });
}

/**
 * Load button/select/modal handlers. Each module must export `prefix` and
 * `execute(interaction, ctx)`; custom IDs look like `prefix:arg1:arg2`.
 * @returns {Promise<Map<string, object>>} keyed by prefix
 */
export async function loadComponents(dir) {
  const components = new Map();
  for (const { file, module } of await importAll(dir)) {
    if (!module.prefix || typeof module.execute !== 'function') {
      throw new Error(`${file}: component must export \`prefix\` and an \`execute\` function`);
    }
    if (module.prefix.includes(':')) {
      throw new Error(`${file}: component prefix must not contain ":"`);
    }
    if (components.has(module.prefix)) {
      throw new Error(`${file}: duplicate component prefix "${module.prefix}"`);
    }
    components.set(module.prefix, module);
  }
  return components;
}
