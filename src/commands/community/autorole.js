import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSettings, setSettings } from '../../features/guildSettings.js';
import { botCanManageRole, isDangerousRole } from '../../features/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('autorole')
  .setDescription('Give everyone who joins a role')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Pick the role')
      .addRoleOption((option) =>
        option.setName('role').setDescription('The role').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Stop assigning a role'))
  .addSubcommand((sub) => sub.setName('status').setDescription('Show the current role'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();
  const ephemeral = { flags: MessageFlags.Ephemeral };

  if (sub === 'set') {
    const role = interaction.options.getRole('role');

    if (isDangerousRole(role)) {
      return interaction.reply({
        content: 'That role carries permissions I will not hand out automatically.',
        ...ephemeral,
      });
    }
    const check = botCanManageRole({ me: interaction.guild.members.me, role });
    if (!check.ok) return interaction.reply({ content: check.reason, ...ephemeral });

    setSettings(ctx.db, interaction.guildId, { autorole_id: role.id });
    return interaction.reply({
      content: `New members will get <@&${role.id}>.`,
      allowedMentions: { parse: [] },
      ...ephemeral,
    });
  }

  if (sub === 'disable') {
    setSettings(ctx.db, interaction.guildId, { autorole_id: null });
    return interaction.reply({ content: 'Auto-role is off.', ...ephemeral });
  }

  const settings = getSettings(ctx.db, interaction.guildId);
  return interaction.reply({
    content: settings.autorole_id
      ? `New members get <@&${settings.autorole_id}>.`
      : 'Auto-role is off.',
    allowedMentions: { parse: [] },
    ...ephemeral,
  });
}
