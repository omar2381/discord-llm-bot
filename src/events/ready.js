import { Events } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client, { logger }) {
  logger.info(`Ready as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
}
