import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { answer } from '../../ai/index.js';

export const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask the AI assistant something')
  .addStringOption((option) =>
    option
      .setName('prompt')
      .setDescription('Your question')
      .setRequired(true)
      .setMaxLength(1500),
  )
  .addBooleanOption((option) =>
    option.setName('private').setDescription('Only you see the answer'),
  )
  .setContexts(0);

export async function execute(interaction, ctx) {
  const isPrivate = interaction.options.getBoolean('private') ?? false;
  await interaction.deferReply(isPrivate ? { flags: MessageFlags.Ephemeral } : {});

  const result = await answer({
    ctx,
    prompt: interaction.options.getString('prompt'),
    member: interaction.member,
    channel: interaction.channel,
    guild: interaction.guild,
  });

  if (result.refused) return interaction.editReply(result.refused);

  const [first, ...rest] = result.chunks;
  await interaction.editReply({
    content: first,
    components: result.rows,
    allowedMentions: { parse: [] },
  });

  for (const chunk of rest) {
    await interaction.followUp({
      content: chunk,
      flags: isPrivate ? MessageFlags.Ephemeral : undefined,
      allowedMentions: { parse: [] },
    });
  }
}
