import { SlashCommandBuilder } from 'discord.js';

const ANSWERS = [
  'It is certain.',
  'It is decidedly so.',
  'Without a doubt.',
  'Yes, definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Yes.',
  'Signs point to yes.',
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  'Do not count on it.',
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
];

export const data = new SlashCommandBuilder()
  .setName('8ball')
  .setDescription('Ask the magic 8-ball')
  .addStringOption((option) =>
    option
      .setName('question')
      .setDescription('What you want to know')
      .setRequired(true)
      .setMaxLength(200),
  );

export const cooldownSeconds = 2;

export async function execute(interaction) {
  const question = interaction.options.getString('question');
  const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

  await interaction.reply({
    content: `> ${question}\n${answer}`,
    allowedMentions: { parse: [] },
  });
}
