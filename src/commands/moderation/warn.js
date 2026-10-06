import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { canModerate } from '../../features/permissions.js';
import { logAction } from '../../features/modlog.js';
import { addWarning, listWarnings } from '../../features/warnings.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Record a warning against a member')
  .addUserOption((option) =>
    option.setName('user').setDescription('Who').setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('What they did')
      .setRequired(true)
      .setMaxLength(400),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
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

  addWarning(ctx.db, {
    guildId: interaction.guildId,
    userId: user.id,
    moderatorId: interaction.user.id,
    reason,
  });
  const total = listWarnings(ctx.db, interaction.guildId, user.id).length;

  await interaction.reply({
    content: `Warned <@${user.id}>. That is ${total} warning${total === 1 ? '' : 's'}.`,
    allowedMentions: { parse: [] },
  });

  await target
    .send(`You were warned in **${interaction.guild.name}**: ${reason}`)
    .catch(() => {
      // Their DMs are closed. The warning is recorded either way.
    });

  await logAction(ctx, interaction.guild, {
    action: 'warn',
    actor: interaction.user,
    target: user,
    reason,
    detail: `${total} total`,
  });
}
