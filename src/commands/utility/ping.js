import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check that the bot is alive and how fast it responds');

export const cooldownSeconds = 3;

export async function execute(interaction, { client }) {
  await interaction.reply('Pinging…');
  const roundTrip = Date.now() - interaction.createdTimestamp;
  const gateway = client.ws.ping;
  await interaction.editReply(
    `🏓 Pong! Round trip: **${roundTrip} ms** · Gateway: **${gateway >= 0 ? `${gateway} ms` : 'n/a'}**`,
  );
}
