import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { canModerate } from '../../features/permissions.js';
import { logAction } from '../../features/modlog.js';

export const data = new SlashCommandBuilder()
  .setName('untimeout')
  .setDescription('Let a timed-out member talk again')
  .addUserOption((option) =>
    option.setName('user').setDescription('Who').setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const user = interaction.options.getUser('user');
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);

  const check = canModerate({
    actor: interaction.member,
    target,
    me: interaction.guild.members.me,
    permission: PermissionFlagsBits.ModerateMembers,
    guildOwnerId: interaction.guild.ownerId,
  });
  if (!check.ok) {
    return interaction.reply({ content: check.reason, flags: MessageFlags.Ephemeral });
  }
  if (!target.isCommunicationDisabled()) {
    return interaction.reply({
      content: 'That member is not timed out.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await target.timeout(null, `${interaction.user.tag}: lifted`);
  await interaction.reply({
    content: `Lifted the timeout on <@${user.id}>.`,
    allowedMentions: { parse: [] },
  });
  await logAction(ctx, interaction.guild, {
    action: 'untimeout',
    actor: interaction.user,
    target: user,
  });
}
