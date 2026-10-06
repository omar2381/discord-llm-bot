import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { canModerate } from '../../features/permissions.js';
import { logAction } from '../../features/modlog.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Remove a member from the server')
  .addUserOption((option) =>
    option.setName('user').setDescription('Who to kick').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('reason').setDescription('Why').setMaxLength(400),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') ?? 'No reason given';
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);

  const check = canModerate({
    actor: interaction.member,
    target,
    me: interaction.guild.members.me,
    permission: PermissionFlagsBits.KickMembers,
    guildOwnerId: interaction.guild.ownerId,
  });
  if (!check.ok) {
    return interaction.reply({ content: check.reason, flags: MessageFlags.Ephemeral });
  }
  if (!target.kickable) {
    return interaction.reply({
      content: 'Discord will not let me kick that member.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await target.kick(`${interaction.user.tag}: ${reason}`);
  await interaction.reply({
    content: `Kicked <@${user.id}>.`,
    allowedMentions: { parse: [] },
  });
  await logAction(ctx, interaction.guild, {
    action: 'kick',
    actor: interaction.user,
    target: user,
    reason,
  });
}
