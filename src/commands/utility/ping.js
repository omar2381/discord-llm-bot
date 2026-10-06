import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check that the bot is awake and how slow it is');

export const cooldownSeconds = 3;

export async function execute(interaction) {
  const sent = await interaction.reply({
    content: 'Pinging...',
    withResponse: true,
  });
  const roundTrip = sent.resource.message.createdTimestamp - interaction.createdTimestamp;

  await interaction.editReply(
    `Pong. Round trip ${roundTrip}ms, websocket ${interaction.client.ws.ping}ms.`,
  );
}
