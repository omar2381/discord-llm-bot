import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Import every .js file under `dir`, recursively, and return the modules with
 * the path they came from. Used to pick up commands, events and components
 * without a central registry that always drifts out of date.
 */
export async function loadModules(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return out;
    throw error;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await loadModules(full)));
    } else if (entry.name.endsWith('.js')) {
      out.push({ path: full, module: await import(pathToFileURL(full).href) });
    }
  }
  return out;
}
