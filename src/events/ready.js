import { Events } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client, ctx) {
  ctx.logger.info(
    { guilds: client.guilds.cache.size, ai: ctx.config.ai.enabled },
    `Ready as ${client.user.tag}`,
  );

  // Say at startup whether the AI will work, so a down Ollama or an unpulled
  // model shows in the log now rather than on the first /ask. Never fatal: the
  // rest of the bot runs without it, and each AI request checks again.
  if (!ctx.ai.enabled) return;
  const health = await ctx.ai.ollama.health();
  if (!health.ok) {
    ctx.logger.warn(
      { url: ctx.config.ai.url, reason: health.reason },
      'Ollama is not reachable; AI replies will say it is offline until it is back',
    );
  } else if (!health.hasModel) {
    ctx.logger.warn(
      { model: ctx.config.ai.model, installed: health.models },
      `OLLAMA_MODEL is not pulled; run: ollama pull ${ctx.config.ai.model}`,
    );
  } else {
    ctx.logger.info(
      { model: ctx.config.ai.model },
      'Ollama is up and the model is pulled',
    );
  }
}
