import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { openDatabase } from './db/index.js';
import { loadModules } from './util/loadModules.js';
import { startReminderLoop } from './features/reminders.js';
import { purgeOldGames } from './components/rps.js';

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
const stopReminders = startReminderLoop({
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

await client.login(config.token);
