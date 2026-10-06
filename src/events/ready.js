import { Events } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client, ctx) {
  ctx.logger.info(
    { guilds: client.guilds.cache.size, ai: ctx.config.ai.enabled },
    `Ready as ${client.user.tag}`,
  );
}
