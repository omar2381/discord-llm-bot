import { EmbedBuilder, SlashCommandBuilder, time } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('About a member')
  .addUserOption((option) =>
    option.setName('user').setDescription('Who to look up; defaults to you'),
  )
  .setContexts(0);

export const cooldownSeconds = 5;

export async function execute(interaction) {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  const roles = member
    ? member.roles.cache
        .filter((role) => role.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => `<@&${role.id}>`)
    : [];

  const embed = new EmbedBuilder()
    .setTitle(user.tag)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Account created', value: time(user.createdAt, 'D'), inline: true },
      {
        name: 'Joined server',
        value: member?.joinedAt ? time(member.joinedAt, 'D') : 'not a member',
        inline: true,
      },
      {
        name: `Roles (${roles.length})`,
        value: roles.length ? roles.slice(0, 20).join(' ') : 'none',
      },
    )
    .setFooter({ text: `ID ${user.id}` });

  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}
