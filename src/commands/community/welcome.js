import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getSettings, setSettings } from '../../features/guildSettings.js';
import { DEFAULT_WELCOME, renderWelcome } from '../../features/welcome.js';

export const data = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Greet people when they join')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Pick the channel and the message')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Where to post')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('Supports {user} {username} {server} {memberCount}')
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('test').setDescription('Show what it will look like, only to you'),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Stop greeting people'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();
  const ephemeral = { flags: MessageFlags.Ephemeral };

  if (sub === 'set') {
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message') ?? DEFAULT_WELCOME;

    if (
      !channel
        .permissionsFor(interaction.guild.members.me)
        ?.has(PermissionFlagsBits.SendMessages)
    ) {
      return interaction.reply({
        content: `I cannot send messages in <#${channel.id}>.`,
        ...ephemeral,
      });
    }

    setSettings(ctx.db, interaction.guildId, {
      welcome_channel_id: channel.id,
      welcome_message: message,
    });

    return interaction.reply({
      content: `New members will be greeted in <#${channel.id}>. Try \`/welcome test\`.`,
      ...ephemeral,
    });
  }

  if (sub === 'disable') {
    setSettings(ctx.db, interaction.guildId, { welcome_channel_id: null });
    return interaction.reply({ content: 'Welcome messages are off.', ...ephemeral });
  }

  const settings = getSettings(ctx.db, interaction.guildId);
  if (!settings.welcome_channel_id) {
    return interaction.reply({
      content: 'No welcome message is set. Use `/welcome set`.',
      ...ephemeral,
    });
  }

  const preview = renderWelcome(settings.welcome_message, {
    userId: interaction.user.id,
    username: interaction.user.username,
    serverName: interaction.guild.name,
    memberCount: interaction.guild.memberCount,
  });

  return interaction.reply({
    content: `Posted to <#${settings.welcome_channel_id}>:\n\n${preview}`,
    allowedMentions: { parse: [] },
    ...ephemeral,
  });
}
