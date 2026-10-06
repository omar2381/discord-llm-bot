import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getSettings, setSettings } from '../../features/guildSettings.js';

export const data = new SlashCommandBuilder()
  .setName('modlog')
  .setDescription('Where moderation actions are recorded')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Send the log to a channel')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('The channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Stop logging'))
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('Show the current channel'),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const channel = interaction.options.getChannel('channel');
    const me = interaction.guild.members.me;
    if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        content: `I cannot send messages in <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    setSettings(ctx.db, interaction.guildId, { modlog_channel_id: channel.id });
    return interaction.reply({
      content: `Moderation actions will be logged to <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'disable') {
    setSettings(ctx.db, interaction.guildId, { modlog_channel_id: null });
    return interaction.reply({
      content: 'Mod logging is off.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const settings = getSettings(ctx.db, interaction.guildId);
  return interaction.reply({
    content: settings.modlog_channel_id
      ? `Logging to <#${settings.modlog_channel_id}>.`
      : 'Mod logging is off.',
    flags: MessageFlags.Ephemeral,
  });
}
