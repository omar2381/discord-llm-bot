import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { openDatabase } from './db/index.js';
import { loadCommands, loadComponents, loadEvents } from './util/loadModules.js';
import { Cooldowns } from './util/cooldown.js';
import { COMMANDS_DIR, COMPONENTS_DIR, EVENTS_DIR } from './paths.js';

dotenv.config({ quiet: true });

let config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(err.message);
  process.exit(1);
}

const logger = createLogger(config.logLevel);

process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception, shutting down');
  process.exit(1);
});

const db = openDatabase(config.databasePath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: enable "Server Members Intent"
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: enable "Message Content Intent"
  ],
});

const ctx = {
  client,
  config,
  db,
  logger,
  commands: await loadCommands(COMMANDS_DIR),
  components: await loadComponents(COMPONENTS_DIR),
  cooldowns: new Cooldowns(),
};

for (const event of await loadEvents(EVENTS_DIR)) {
  const listener = async (...args) => {
    try {
      await event.execute(...args, ctx);
    } catch (err) {
      logger.error({ err, event: event.name }, 'Event handler failed');
    }
  };
  if (event.once) client.once(event.name, listener);
  else client.on(event.name, listener);
}

logger.info(
  `Loaded ${ctx.commands.size} command(s), ${ctx.components.size} component handler(s). AI is ${config.ai.enabled ? `on (${config.ai.model})` : 'off'}.`,
);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  try {
    await client.destroy();
  } finally {
    db.close();
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await client.login(config.discord.token);
} catch (err) {
  const hint =
    err.code === 'TokenInvalid'
      ? 'DISCORD_TOKEN is wrong. Reset it in the Developer Portal (Bot tab) and update .env.'
      : err.code === 'DisallowedIntents'
        ? 'Enable "Server Members Intent" and "Message Content Intent" in the Developer Portal (Bot tab).'
        : 'Could not connect to Discord.';
  logger.fatal({ err }, `Login failed. ${hint}`);
  db.close();
  process.exit(1);
}
