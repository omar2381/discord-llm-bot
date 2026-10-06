import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { CHOICES, DESCRIPTIONS } from '../../features/rps.js';

export const data = new SlashCommandBuilder()
  .setName('rps')
  .setDescription('Challenge someone to rock-paper-scissors (with four extras)')
  .addStringOption((option) =>
    option
      .setName('choice')
      .setDescription('What you play - kept secret until someone accepts')
      .setRequired(true)
      .addChoices(
        ...CHOICES.map((choice) => ({
          name: `${choice} - ${DESCRIPTIONS[choice]}`.slice(0, 100),
          value: choice,
        })),
      ),
  )
  .addUserOption((option) =>
    option
      .setName('opponent')
      .setDescription('Only this person may accept; leave empty for anyone'),
  );

export const cooldownSeconds = 5;

export async function execute(interaction, ctx) {
  const choice = interaction.options.getString('choice');
  const opponent = interaction.options.getUser('opponent');

  if (opponent?.bot) {
    return interaction.reply({
      content: 'Bots do not play.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (opponent?.id === interaction.user.id) {
    return interaction.reply({
      content: 'You cannot challenge yourself.',
      flags: MessageFlags.Ephemeral,
    });
  }

  ctx.db
    .prepare(
      `INSERT INTO rps_games (id, challenger_id, choice, opponent_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(interaction.id, interaction.user.id, choice, opponent?.id ?? null, Date.now());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rps:accept:${interaction.id}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: opponent
      ? `<@${interaction.user.id}> challenges <@${opponent.id}> to rock-paper-scissors.`
      : `<@${interaction.user.id}> has thrown down a rock-paper-scissors challenge. Anyone?`,
    components: [row],
    allowedMentions: { users: opponent ? [opponent.id] : [] },
  });
}
