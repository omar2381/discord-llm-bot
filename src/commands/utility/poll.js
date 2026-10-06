import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  MAX_HOURS,
  MIN_HOURS,
  buildPoll,
  parsePollOptions,
} from '../../features/polls.js';

export const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Start a poll')
  .addStringOption((option) =>
    option
      .setName('question')
      .setDescription('What you are asking')
      .setRequired(true)
      .setMaxLength(300),
  )
  .addStringOption((option) =>
    option
      .setName('options')
      .setDescription('Answers separated by | , e.g. "yes | no | maybe"')
      .setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName('hours')
      .setDescription(`How long it runs (${MIN_HOURS}-${MAX_HOURS})`)
      .setMinValue(MIN_HOURS)
      .setMaxValue(MAX_HOURS),
  )
  .addBooleanOption((option) =>
    option.setName('multi').setDescription('Allow picking more than one answer'),
  );

export const cooldownSeconds = 10;

export async function execute(interaction) {
  const question = interaction.options.getString('question');
  const { options, error } = parsePollOptions(interaction.options.getString('options'));

  if (error) {
    return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
  }

  await interaction.reply({
    poll: buildPoll({
      question,
      options,
      hours: interaction.options.getInteger('hours') ?? 24,
      multi: interaction.options.getBoolean('multi') ?? false,
    }),
  });
}
