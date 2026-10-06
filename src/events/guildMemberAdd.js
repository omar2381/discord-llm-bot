import { EmbedBuilder, Events } from 'discord.js';
import { getSettings } from '../features/guildSettings.js';
import { renderWelcome } from '../features/welcome.js';
import { botCanManageRole } from '../features/permissions.js';

export const name = Events.GuildMemberAdd;

export async function execute(member, ctx) {
  const settings = getSettings(ctx.db, member.guild.id);

  if (settings.welcome_channel_id) {
    try {
      const channel = await member.guild.channels.fetch(settings.welcome_channel_id);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setDescription(
            renderWelcome(settings.welcome_message, {
              userId: member.id,
              username: member.user.username,
              serverName: member.guild.name,
              memberCount: member.guild.memberCount,
            }),
          )
          .setThumbnail(member.user.displayAvatarURL({ size: 128 }));

        await channel.send({
          content: `<@${member.id}>`,
          embeds: [embed],
          allowedMentions: { users: [member.id] },
        });
      }
    } catch (error) {
      ctx.logger.warn({ err: error, guild: member.guild.id }, 'welcome message failed');
    }
  }

  if (settings.autorole_id) {
    try {
      const role = await member.guild.roles.fetch(settings.autorole_id);
      if (role && botCanManageRole({ me: member.guild.members.me, role }).ok) {
        await member.roles.add(role, 'auto-role');
      }
    } catch (error) {
      ctx.logger.warn({ err: error, guild: member.guild.id }, 'auto-role failed');
    }
  }
}
