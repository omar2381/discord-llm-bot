import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { canModerate } from '../../features/permissions.js';
import { logAction } from '../../features/modlog.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member')
  .addUserOption((option) =>
    option.setName('user').setDescription('Who to ban').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('reason').setDescription('Why').setMaxLength(400),
  )
  .addIntegerOption((option) =>
    option
      .setName('delete_days')
      .setDescription('Also delete their messages from the last N days')
      .setMinValue(0)
      .setMaxValue(7),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') ?? 'No reason given';
  const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);

  // A member who already left can still be banned, so only run the hierarchy
  // checks when they are actually in the server.
  if (target) {
    const check = canModerate({
      actor: interaction.member,
      target,
      me: interaction.guild.members.me,
      permission: PermissionFlagsBits.BanMembers,
      guildOwnerId: interaction.guild.ownerId,
    });
    if (!check.ok) {
      return interaction.reply({ content: check.reason, flags: MessageFlags.Ephemeral });
    }
  } else if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    return interaction.reply({
      content: 'You do not have permission to do that.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.guild.members.ban(user.id, {
    reason: `${interaction.user.tag}: ${reason}`,
    deleteMessageSeconds: deleteDays * 86400,
  });

  await interaction.reply({
    content: `Banned <@${user.id}>.`,
    allowedMentions: { parse: [] },
  });
  await logAction(ctx, interaction.guild, {
    action: 'ban',
    actor: interaction.user,
    target: user,
    reason,
    detail: deleteDays ? `Deleted ${deleteDays} day(s) of messages` : null,
  });
}
