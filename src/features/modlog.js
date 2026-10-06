import { EmbedBuilder } from 'discord.js';
import { getSettings } from './guildSettings.js';

const COLOURS = {
  kick: 0xe67e22,
  ban: 0xe74c3c,
  timeout: 0xf1c40f,
  untimeout: 0x2ecc71,
  warn: 0xf39c12,
  purge: 0x95a5a6,
  automod: 0x9b59b6,
};

/**
 * Post a moderation action to the configured channel. Never throws: a missing
 * or unwritable mod-log channel must not fail the action it is recording.
 */
export async function logAction(ctx, guild, { action, actor, target, reason, detail }) {
  const settings = getSettings(ctx.db, guild.id);
  if (!settings.modlog_channel_id) return false;

  try {
    const channel = await guild.channels.fetch(settings.modlog_channel_id);
    if (!channel?.isTextBased()) return false;

    const embed = new EmbedBuilder()
      .setColor(COLOURS[action] ?? 0x5865f2)
      .setTitle(action[0].toUpperCase() + action.slice(1))
      .setTimestamp(new Date());

    if (target) {
      embed.addFields({
        name: 'Member',
        value: `<@${target.id}> (${target.tag ?? target.id})`,
      });
    }
    embed.addFields({
      name: 'Moderator',
      value: actor ? `<@${actor.id}>` : 'the bot',
    });
    if (reason) embed.addFields({ name: 'Reason', value: String(reason).slice(0, 1000) });
    if (detail) embed.addFields({ name: 'Detail', value: String(detail).slice(0, 1000) });

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    ctx.logger?.warn({ err: error, guild: guild.id }, 'could not write to the mod log');
    return false;
  }
}
