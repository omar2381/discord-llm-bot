import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/index.js';
import { loadModules } from './util/loadModules.js';
import { startReminderLoop } from './features/reminders.js';
import { purgeOldGames } from './components/rps.js';
import { createAi } from './ai/index.js';

const here = dirname(fileURLToPath(import.meta.url));

// Problems no restart can fix (no token, a revoked token, an intent switched
// off in the Developer Portal) exit 0, so the LaunchAgent, which restarts only
// on failure, does not retry every ten seconds forever. Everything else, such
// as Discord or the network being down, exits non-zero and is retried.
const UNRECOVERABLE = new Set(['TokenInvalid', 'DisallowedIntents']);
function stopForGood(message, error) {
  logger.fatal({ err: error }, `${message} Not restarting until this is fixed.`);
  logger.flush?.();
  setTimeout(() => process.exit(0), 200);
}

let config;
try {
  config = getConfig();
} catch (error) {
  stopForGood('The configuration in .env is incomplete.', error);
  await new Promise(() => {});
}
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
const ai = createAi(config);
const ctx = { db, config, logger, client, commands, components, ai };

for (const { path, module } of await loadModules(join(here, 'commands'))) {
  if (!module.data || typeof module.execute !== 'function') {
    logger.warn({ path }, 'skipping command without data/execute');
    continue;
  }
  commands.set(module.data.name, { ...module, sourcePath: path });
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

// Deliver reminders, including any that came due while the bot was offline.
// Only once logged in: before that every channel and user fetch throws
// ("Expected token to be set"), and the catch-up pass deleted each reminder
// that came due while the bot was down as undeliverable.
let stopReminders = () => {};
client.once(Events.ClientReady, () => {
  stopReminders = startReminderLoop({
    db,
    logger,
    async send(reminder) {
      const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
      const content = `<@${reminder.user_id}> reminder: ${reminder.message}`;
      if (channel?.isTextBased()) {
        await channel.send({
          content,
          allowedMentions: { users: [reminder.user_id] },
        });
        return;
      }
      // The channel is gone or unreadable; fall back to a direct message.
      const user = await client.users.fetch(reminder.user_id);
      await user.send(`Reminder: ${reminder.message}`);
    },
  });
});

// Abandoned rock-paper-scissors challenges would otherwise accumulate forever.
purgeOldGames(db);
const purgeTimer = setInterval(() => purgeOldGames(db), 60 * 60 * 1000);
purgeTimer.unref?.();

client.on(Events.Error, (error) => logger.error({ err: error }, 'client error'));
process.on('unhandledRejection', (reason) =>
  logger.error({ err: reason }, 'unhandled rejection'),
);

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  stopReminders();
  clearInterval(purgeTimer);
  client.destroy();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const TOKEN_HINT =
  'Discord rejected DISCORD_TOKEN; reset it under Bot in the Developer Portal and update .env.';
const INTENTS_HINT =
  'Discord refused the privileged intents; turn on Server Members Intent and Message Content Intent under Bot in the Developer Portal.';

// discord.js gives up on its own after these gateway close codes and then sits
// idle, connected to nothing. Leave rather than look alive.
client.on(Events.ShardDisconnect, (event) => {
  if (event.code === 4004) stopForGood(TOKEN_HINT, { code: event.code });
  else if (event.code === 4013 || event.code === 4014)
    stopForGood(INTENTS_HINT, { code: event.code });
  else {
    logger.fatal(
      { code: event.code },
      'gateway gave up; exiting so the service restarts',
    );
    process.exit(1);
  }
});

try {
  await client.login(config.token);
} catch (error) {
  if (UNRECOVERABLE.has(error.code)) {
    stopForGood(error.code === 'TokenInvalid' ? TOKEN_HINT : INTENTS_HINT, error);
  } else {
    logger.fatal({ err: error }, 'login failed; exiting so the service restarts');
    db.close();
    process.exit(1);
  }
}
