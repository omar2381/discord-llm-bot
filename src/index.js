import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/index.js';
import { loadModules } from './util/loadModules.js';

const here = dirname(fileURLToPath(import.meta.url));

const config = getConfig();
const db = openDatabase(config.databasePath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = new Collection();
const components = new Collection();
const ctx = { db, config, logger, client, commands, components };

for (const { path, module } of await loadModules(join(here, 'commands'))) {
  if (!module.data || typeof module.execute !== 'function') {
    logger.warn({ path }, 'skipping command without data/execute');
    continue;
  }
  commands.set(module.data.name, module);
}

for (const { path, module } of await loadModules(join(here, 'components'))) {
  if (!module.prefix || typeof module.execute !== 'function') {
    logger.warn({ path }, 'skipping component without prefix/execute');
    continue;
  }
  components.set(module.prefix, module);
}

for (const { path, module } of await loadModules(join(here, 'events'))) {
  if (!module.name || typeof module.execute !== 'function') {
    logger.warn({ path }, 'skipping event without name/execute');
    continue;
  }
  const handler = (...args) => module.execute(...args, ctx);
  if (module.once) client.once(module.name, handler);
  else client.on(module.name, handler);
}

logger.info({ commands: commands.size, components: components.size }, 'modules loaded');

client.on(Events.Error, (error) => logger.error({ err: error }, 'client error'));
process.on('unhandledRejection', (reason) =>
  logger.error({ err: reason }, 'unhandled rejection'),
);

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  client.destroy();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await client.login(config.token);
