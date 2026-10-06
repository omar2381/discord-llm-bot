import { EmbedBuilder, SlashCommandBuilder, time } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('About this server')
  .setContexts(0);

export const cooldownSeconds = 5;

export async function execute(interaction) {
  const guild = interaction.guild;
  const owner = await guild.fetchOwner().catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      { name: 'Members', value: String(guild.memberCount), inline: true },
      { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
      { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
      {
        name: 'Owner',
        value: owner ? `<@${owner.id}>` : 'unknown',
        inline: true,
      },
      {
        name: 'Boosts',
        value: `${guild.premiumSubscriptionCount ?? 0} (tier ${guild.premiumTier})`,
        inline: true,
      },
      { name: 'Created', value: time(guild.createdAt, 'D'), inline: true },
    )
    .setFooter({ text: `ID ${guild.id}` });

  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}
