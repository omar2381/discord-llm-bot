import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { MAX_DICE, MAX_SIDES, formatRoll, parseDice, roll } from '../../features/dice.js';

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Roll dice, e.g. 2d6+1')
  .addStringOption((option) =>
    option.setName('dice').setDescription('Notation like d20, 2d6 or 4d8-2'),
  );

export const cooldownSeconds = 2;

export async function execute(interaction) {
  const input = interaction.options.getString('dice') ?? '1d6';
  const spec = parseDice(input);

  if (!spec) {
    return interaction.reply({
      content: `I cannot roll \`${input}\`. Try \`d20\`, \`2d6\` or \`4d8-2\` (up to ${MAX_DICE} dice, ${MAX_SIDES} sides).`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply(formatRoll(spec, roll(spec)));
}
