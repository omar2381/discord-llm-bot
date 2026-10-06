import { REST, Routes } from 'discord.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../src/config.js';
import { logger } from '../src/logger.js';
import { loadModules } from '../src/util/loadModules.js';

const global = process.argv.includes('--global');
const config = getConfig();

if (!global && !config.devGuildId) {
  logger.error('DEV_GUILD_ID is not set. Set it, or pass --global.');
  process.exit(1);
}

const commandsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/commands');
const body = [];
for (const { path, module } of await loadModules(commandsDir)) {
  if (!module.data) {
    logger.warn({ path }, 'skipping file without exported data');
    continue;
  }
  body.push(module.data.toJSON());
}

const rest = new REST().setToken(config.token);
const route = global
  ? Routes.applicationCommands(config.clientId)
  : Routes.applicationGuildCommands(config.clientId, config.devGuildId);

// PUT replaces the whole set, so commands deleted from the source disappear too.
const result = await rest.put(route, { body });
logger.info(
  { count: result.length, scope: global ? 'global' : config.devGuildId },
  'commands registered',
);
if (global)
  logger.info('Global commands can take up to an hour to appear the first time.');
