import { MessageFlags } from 'discord.js';
import { botCanManageRole, isDangerousRole } from '../features/permissions.js';

export const prefix = 'rolemenu';

export async function execute(interaction, ctx) {
  const roleId = interaction.customId.split(':')[1];

  const known = ctx.db
    .prepare('SELECT 1 FROM role_menu_roles WHERE message_id = ? AND role_id = ?')
    .get(interaction.message.id, roleId);

  if (!known) {
    return interaction.reply({
      content: 'This menu is no longer active.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.reply({
      content: 'That role has been deleted.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Re-check at click time: a role's permissions can be changed after the menu
  // was posted, which would otherwise turn an old menu into an escalation.
  if (isDangerousRole(role)) {
    return interaction.reply({
      content: 'That role now carries permissions I will not hand out.',
      flags: MessageFlags.Ephemeral,
    });
  }
  const check = botCanManageRole({ me: interaction.guild.members.me, role });
  if (!check.ok) {
    return interaction.reply({ content: check.reason, flags: MessageFlags.Ephemeral });
  }

  const member = interaction.member;
  const had = member.roles.cache.has(roleId);

  if (had) await member.roles.remove(roleId, 'role menu');
  else await member.roles.add(roleId, 'role menu');

  await interaction.reply({
    content: `${had ? 'Removed' : 'Added'} **${role.name}**.`,
    flags: MessageFlags.Ephemeral,
  });
}
