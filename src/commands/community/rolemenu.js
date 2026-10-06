import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { botCanManageRole, isDangerousRole } from '../../features/permissions.js';
import { MAX_MENU_ROLES, chunkButtons } from '../../features/welcome.js';

export const data = new SlashCommandBuilder()
  .setName('rolemenu')
  .setDescription('A message people click to give themselves roles')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Post a role menu here')
      .addStringOption((option) =>
        option
          .setName('title')
          .setDescription('Shown above the buttons')
          .setRequired(true)
          .setMaxLength(200),
      )
      .addStringOption((option) =>
        option
          .setName('roles')
          .setDescription('Mention the roles, separated by spaces')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Forget a role menu')
      .addStringOption((option) =>
        option
          .setName('message_id')
          .setDescription('The id of the menu message')
          .setRequired(true),
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const ephemeral = { flags: MessageFlags.Ephemeral };

  if (interaction.options.getSubcommand() === 'delete') {
    const messageId = interaction.options.getString('message_id');
    const removed = ctx.db
      .prepare('DELETE FROM role_menus WHERE message_id = ? AND guild_id = ?')
      .run(messageId, interaction.guildId).changes;

    return interaction.reply({
      content: removed
        ? 'Forgotten. The message itself is still there; delete it yourself if you want it gone.'
        : 'I have no role menu with that id.',
      ...ephemeral,
    });
  }

  const title = interaction.options.getString('title');
  const ids = [...interaction.options.getString('roles').matchAll(/<@&(\d+)>/g)].map(
    (match) => match[1],
  );

  if (!ids.length) {
    return interaction.reply({
      content: 'Mention at least one role, like `@Red @Blue`.',
      ...ephemeral,
    });
  }
  if (ids.length > MAX_MENU_ROLES) {
    return interaction.reply({
      content: `At most ${MAX_MENU_ROLES} roles per menu.`,
      ...ephemeral,
    });
  }

  const me = interaction.guild.members.me;
  const roles = [];
  for (const id of new Set(ids)) {
    const role = interaction.guild.roles.cache.get(id);
    if (!role) continue;
    if (isDangerousRole(role)) {
      return interaction.reply({
        content: `<@&${role.id}> carries permissions I will not hand out from a menu.`,
        allowedMentions: { parse: [] },
        ...ephemeral,
      });
    }
    const check = botCanManageRole({ me, role });
    if (!check.ok) {
      return interaction.reply({
        content: `<@&${role.id}>: ${check.reason}`,
        allowedMentions: { parse: [] },
        ...ephemeral,
      });
    }
    roles.push(role);
  }

  if (!roles.length) {
    return interaction.reply({
      content: 'None of those roles exist here.',
      ...ephemeral,
    });
  }

  const rows = chunkButtons(roles).map((group) =>
    new ActionRowBuilder().addComponents(
      group.map((role) =>
        new ButtonBuilder()
          .setCustomId(`rolemenu:${role.id}`)
          .setLabel(role.name.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      ),
    ),
  );

  const message = await interaction.channel.send({
    content: `**${title}**\nClick to give yourself a role, click again to remove it.`,
    components: rows,
    allowedMentions: { parse: [] },
  });

  const insertMenu = ctx.db.prepare(
    'INSERT INTO role_menus (message_id, guild_id, channel_id, title) VALUES (?, ?, ?, ?)',
  );
  const insertRole = ctx.db.prepare(
    'INSERT INTO role_menu_roles (message_id, role_id, label) VALUES (?, ?, ?)',
  );
  ctx.db.transaction(() => {
    insertMenu.run(message.id, interaction.guildId, interaction.channelId, title);
    for (const role of roles) insertRole.run(message.id, role.id, role.name);
  })();

  await interaction.reply({
    content: `Posted with ${roles.length} role${roles.length === 1 ? '' : 's'}.`,
    ...ephemeral,
  });
}
