import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { createOllama, OllamaBusyError } from './ollama.js';
import { PendingActions } from './pending.js';
import { runAgent } from './agent.js';
import { AI_DISABLED_MESSAGE } from './prompts.js';
import { getSettings } from '../features/guildSettings.js';
import { Cooldown } from '../util/cooldown.js';
import { splitMessage } from '../util/splitMessage.js';

export { AI_DISABLED_MESSAGE };

/**
 * Everything the AI needs, built once and hung off ctx. When AI is off this is
 * still created, with `enabled: false`, so callers can ask rather than guard on
 * the config in a dozen places.
 */
export function createAi(config) {
  if (!config.ai.enabled) {
    return { enabled: false };
  }

  const ollama = createOllama({
    url: config.ai.url,
    model: config.ai.model,
    timeoutMs: config.ai.timeoutMs,
    numCtx: config.ai.numCtx,
  });
  const pending = new PendingActions();
  setInterval(() => pending.sweep(), 60_000).unref?.();

  // One generation per minute per user by default; the owner is exempt.
  const limiter = new Cooldown(Math.ceil(60 / config.ai.rateLimitPerMin));

  return { enabled: true, ollama, pending, limiter };
}

/** Is the AI allowed to answer here, and by this person? */
export function aiAllowed({ ctx, guildId, channelId, userId }) {
  if (!ctx.ai.enabled) return { ok: false, reason: AI_DISABLED_MESSAGE };

  const settings = getSettings(ctx.db, guildId);
  if (!settings.ai_enabled) {
    return { ok: false, reason: 'The AI is switched off in this server.' };
  }

  const allowed = ctx.config.ai.allowedChannelIds;
  if (allowed.length && !allowed.includes(channelId)) {
    return { ok: false, reason: 'The AI is not enabled in this channel.' };
  }

  if (userId !== ctx.config.ownerId) {
    const wait = ctx.ai.limiter.check(userId);
    if (wait > 0) return { ok: false, reason: `Give me ${wait}s.` };
  }

  return { ok: true };
}

/** Read recent channel messages as conversation turns for the model. */
export async function recentHistory(channel, { limit, botId, excludeId }) {
  if (limit <= 0) return [];
  const fetched = await channel.messages.fetch({ limit: Math.min(limit, 50) });

  return [...fetched.values()]
    .filter((message) => message.id !== excludeId && message.content)
    .reverse()
    .map((message) => ({
      fromBot: message.author.id === botId,
      authorName: message.member?.displayName ?? message.author.username,
      content: message.content,
    }));
}

export function confirmationRow(pending) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aiconfirm:yes:${pending.id}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`aiconfirm:no:${pending.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Ask the model and deliver the answer. Shared by /ask and by mentions, so both
 * behave identically: same rate limit, same splitting, same confirmations, and
 * never a ping from model output.
 */
export async function answer({ ctx, message, prompt, member, channel, guild }) {
  const check = aiAllowed({
    ctx,
    guildId: guild.id,
    channelId: channel.id,
    userId: member.id,
  });
  if (!check.ok) return { refused: check.reason };

  const history = await recentHistory(channel, {
    limit: ctx.config.ai.maxHistory,
    botId: ctx.client.user.id,
    excludeId: message?.id,
  }).catch(() => []);

  let result;
  try {
    result = await runAgent({
      ollama: ctx.ai.ollama,
      db: ctx.db,
      config: ctx.config,
      pending: ctx.ai.pending,
      guild,
      channel,
      member,
      prompt,
      history,
      botName: ctx.client.user.username,
    });
  } catch (error) {
    if (error instanceof OllamaBusyError) {
      return { refused: 'I am busy, try again in a moment.' };
    }
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return { refused: 'That took too long. Try something shorter.' };
    }
    ctx.logger.error({ err: error }, 'AI failed');
    return { refused: 'The AI is not answering right now.' };
  }

  const chunks = splitMessage(result.content);
  const rows = result.pending.map((item) => confirmationRow(item));

  return {
    chunks: chunks.length ? chunks : ['...'],
    confirmations: result.pending,
    rows,
  };
}

export function canSendIn(channel, me) {
  return Boolean(channel?.permissionsFor?.(me)?.has(PermissionFlagsBits.SendMessages));
}
