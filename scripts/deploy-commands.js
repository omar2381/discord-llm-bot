// Register slash commands with Discord.
//   npm run deploy:commands          -> DEV_GUILD_ID only (updates instantly)
//   npm run deploy:commands:global   -> every server (first rollout can take up to an hour)
// A PUT replaces the full set, so renamed or deleted commands disappear too.
import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { ConfigError, loadConfig } from '../src/config.js';
import { COMMANDS_DIR } from '../src/paths.js';
import { loadCommands } from '../src/util/loadModules.js';

dotenv.config({ quiet: true });

const global = process.argv.includes('--global');

let config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(err.message);
  process.exit(1);
}

const { token, clientId, devGuildId } = config.discord;
if (!global && !devGuildId) {
  console.error(
    'DEV_GUILD_ID is not set. Set it in .env, or use `npm run deploy:commands:global`.',
  );
  process.exit(1);
}

const commands = [...(await loadCommands(COMMANDS_DIR)).values()].map((c) => c.data.toJSON());
const route = global
  ? Routes.applicationCommands(clientId)
  : Routes.applicationGuildCommands(clientId, devGuildId);

const rest = new REST().setToken(token);
const result = await rest.put(route, { body: commands });

console.log(
  `Registered ${result.length} command(s) ${global ? 'globally' : `in server ${devGuildId}`}: ` +
    result.map((c) => `/${c.name}`).join(', '),
);
