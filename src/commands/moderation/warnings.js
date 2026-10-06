import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
} from 'discord.js';
import { clearWarnings, listWarnings } from '../../features/warnings.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('See or clear a member’s warnings')
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Show warnings')
      .addUserOption((option) =>
        option.setName('user').setDescription('Who').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('clear')
      .setDescription('Delete all of a member’s warnings')
      .addUserOption((option) =>
        option.setName('user').setDescription('Who').setRequired(true),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const user = interaction.options.getUser('user');

  if (interaction.options.getSubcommand() === 'clear') {
    const removed = clearWarnings(ctx.db, interaction.guildId, user.id);
    return interaction.reply({
      content: `Cleared ${removed} warning${removed === 1 ? '' : 's'} for <@${user.id}>.`,
      allowedMentions: { parse: [] },
    });
  }

  const warnings = listWarnings(ctx.db, interaction.guildId, user.id);
  if (!warnings.length) {
    return interaction.reply({
      content: `<@${user.id}> has no warnings.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Warnings for ${user.tag}`)
    .setDescription(
      warnings
        .slice(0, 15)
        .map(
          (warning) =>
            `\`${warning.id}\` ${time(Math.floor(warning.created_at / 1000), 'd')} by <@${warning.moderator_id}>\n${warning.reason ?? 'no reason given'}`,
        )
        .join('\n\n'),
    )
    .setFooter({ text: `${warnings.length} total` });

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}
