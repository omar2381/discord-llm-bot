import { Events, PermissionFlagsBits } from 'discord.js';
import { SpamTracker, findBannedWord } from '../features/automod.js';
import { getBannedWords, getSettings } from '../features/guildSettings.js';
import { logAction } from '../features/modlog.js';
import { answer, canSendIn } from '../ai/index.js';

export const name = Events.MessageCreate;

const spam = new SpamTracker();
setInterval(() => spam.sweep(), 5 * 60 * 1000).unref?.();

const SPAM_TIMEOUT_MS = 60 * 1000;

export async function execute(message, ctx) {
  if (message.author.bot || !message.guild) return;

  const settings = getSettings(ctx.db, message.guild.id);

  // Anyone who can delete messages is trusted not to need automod.
  const exempt = message.member?.permissions.has(PermissionFlagsBits.ManageMessages);

  if (!exempt && settings.automod_enabled) {
    const words = getBannedWords(ctx.db, message.guild.id);
    const hit = findBannedWord(message.content, words);
    if (hit) {
      await handleBannedWord(message, ctx, hit);
      return;
    }
  }

  if (!exempt && settings.spam_enabled) {
    const verdict = spam.check(
      `${message.guild.id}:${message.author.id}`,
      message.content,
    );
    if (verdict) {
      await handleSpam(message, ctx, verdict);
      return;
    }
  }

  await maybeAnswer(message, ctx);
}

/**
 * Reply when the bot is mentioned, or when someone replies to one of its own
 * messages. Moderation has already had its say by this point.
 */
async function maybeAnswer(message, ctx) {
  if (!ctx.ai.enabled) return;

  const mentioned = message.mentions.users.has(ctx.client.user.id);
  const repliedToBot =
    message.reference?.messageId &&
    (await message.channel.messages
      .fetch(message.reference.messageId)
      .then((replied) => replied.author.id === ctx.client.user.id)
      .catch(() => false));

  if (!mentioned && !repliedToBot) return;
  if (!canSendIn(message.channel, message.guild.members.me)) return;

  const prompt = message.content
    .replace(new RegExp(`<@!?${ctx.client.user.id}>`, 'g'), '')
    .trim();
  if (!prompt) return;

  await message.channel.sendTyping().catch(() => {});

  const result = await answer({
    ctx,
    message,
    prompt,
    member: message.member,
    channel: message.channel,
    guild: message.guild,
  });

  if (result.refused) {
    await message.reply({
      content: result.refused,
      allowedMentions: { repliedUser: true },
    });
    return;
  }

  const [first, ...rest] = result.chunks;
  await message.reply({
    content: first,
    components: result.rows,
    allowedMentions: { repliedUser: true, parse: [] },
  });
  for (const chunk of rest) {
    await message.channel.send({ content: chunk, allowedMentions: { parse: [] } });
  }
}

async function handleBannedWord(message, ctx, word) {
  await message.delete().catch(() => {});

  const notice = await message.channel
    .send({
      content: `<@${message.author.id}>, that word is not allowed here.`,
      allowedMentions: { users: [message.author.id] },
    })
    .catch(() => null);

  if (notice) setTimeout(() => notice.delete().catch(() => {}), 5000);

  await logAction(ctx, message.guild, {
    action: 'automod',
    actor: null,
    target: message.author,
    reason: 'Banned word',
    detail: `\`${word}\` in <#${message.channelId}>`,
  });
}

async function handleSpam(message, ctx, verdict) {
  const reason =
    verdict === 'burst' ? 'Sending messages too quickly' : 'Repeating the same message';

  const member = message.member;
  const me = message.guild.members.me;
  const canTimeout =
    me.permissions.has(PermissionFlagsBits.ModerateMembers) &&
    member &&
    me.roles.highest.position > member.roles.highest.position &&
    member.id !== message.guild.ownerId;

  if (canTimeout) await member.timeout(SPAM_TIMEOUT_MS, reason).catch(() => {});

  await logAction(ctx, message.guild, {
    action: 'automod',
    actor: null,
    target: message.author,
    reason,
    detail: canTimeout ? 'Timed out for 60s' : 'Could not time them out',
  });
}
