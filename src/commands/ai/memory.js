import { EmbedBuilder, MessageFlags, SlashCommandBuilder, time } from 'discord.js';
import {
  clearFacts,
  forgetById,
  hasOptedOut,
  optIn,
  optOut,
  recallFacts,
} from '../../ai/memory.js';

export const data = new SlashCommandBuilder()
  .setName('memory')
  .setDescription('What the AI remembers about you')
  .addSubcommand((sub) => sub.setName('view').setDescription('See what it remembers'))
  .addSubcommand((sub) =>
    sub
      .setName('forget')
      .setDescription('Forget one thing')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('The number shown by /memory view')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('clear').setDescription('Forget everything'))
  .addSubcommand((sub) =>
    sub
      .setName('optout')
      .setDescription('Stop the AI remembering you, and delete what it has'),
  )
  .addSubcommand((sub) => sub.setName('optin').setDescription('Allow it again'))
  .setContexts(0);

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();
  const scope = { guildId: interaction.guildId, userId: interaction.user.id };
  const ephemeral = { flags: MessageFlags.Ephemeral };

  if (sub === 'optout') {
    optOut(ctx.db, interaction.user.id);
    return interaction.reply({
      content: 'Done. I have deleted what I knew and will not remember anything new.',
      ...ephemeral,
    });
  }

  if (sub === 'optin') {
    optIn(ctx.db, interaction.user.id);
    return interaction.reply({ content: 'I can remember things again.', ...ephemeral });
  }

  if (sub === 'clear') {
    const removed = clearFacts(ctx.db, scope);
    return interaction.reply({
      content: `Forgot ${removed} thing${removed === 1 ? '' : 's'}.`,
      ...ephemeral,
    });
  }

  if (sub === 'forget') {
    const id = interaction.options.getInteger('id');
    const removed = forgetById(ctx.db, { ...scope, id });
    return interaction.reply({
      content: removed
        ? `Forgot \`${id}\`.`
        : 'I have nothing with that number about you.',
      ...ephemeral,
    });
  }

  if (hasOptedOut(ctx.db, interaction.user.id)) {
    return interaction.reply({
      content: 'You have opted out, so I remember nothing about you.',
      ...ephemeral,
    });
  }

  const facts = recallFacts(ctx.db, { ...scope, limit: 50 });
  if (!facts.length) {
    return interaction.reply({
      content: 'I do not remember anything about you here.',
      ...ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('What I remember about you')
    .setDescription(
      facts
        .map(
          (fact) =>
            `\`${fact.id}\` ${fact.fact} _(${time(Math.floor(fact.created_at / 1000), 'R')})_`,
        )
        .join('\n'),
    )
    .setFooter({
      text: 'Use /memory forget id:<number>, or /memory optout to stop entirely.',
    });

  return interaction.reply({ embeds: [embed], ...ephemeral });
}
