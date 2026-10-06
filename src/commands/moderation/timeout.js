import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { canModerate } from '../../features/permissions.js';
import { logAction } from '../../features/modlog.js';
import { formatDuration, parseDuration } from '../../util/duration.js';

export const MAX_TIMEOUT_MS = 28 * 86400000;

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Stop a member talking for a while')
  .addUserOption((option) =>
    option.setName('user').setDescription('Who').setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('duration')
      .setDescription('How long, e.g. 10m, 2h, 1d (max 28d)')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('reason').setDescription('Why').setMaxLength(400),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') ?? 'No reason given';
  const ms = parseDuration(interaction.options.getString('duration'));

  if (ms === null) {
    return interaction.reply({
      content: 'I could not read that duration. Try `10m`, `2h` or `1d`.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (ms > MAX_TIMEOUT_MS) {
    return interaction.reply({
      content: 'Discord caps timeouts at 28 days.',
      flags: MessageFlags.Ephemeral,
    });
  }

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

  await target.timeout(ms, `${interaction.user.tag}: ${reason}`);
  await interaction.reply({
    content: `Timed out <@${user.id}> for ${formatDuration(ms)}.`,
    allowedMentions: { parse: [] },
  });
  await logAction(ctx, interaction.guild, {
    action: 'timeout',
    actor: interaction.user,
    target: user,
    reason,
    detail: formatDuration(ms),
  });
}
