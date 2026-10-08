import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { campaignForChannel } from '../../features/dnd/campaigns.js';
import { footerFor, takeTurn } from '../../features/dnd/play.js';

export const data = new SlashCommandBuilder()
  .setName('begin')
  .setDescription('Open the scene, once the party has characters')
  .setContexts(0);

export const cooldownSeconds = 10;

export async function execute(interaction, ctx) {
  const campaign = campaignForChannel(ctx.db, interaction.channelId);
  if (!campaign) {
    return interaction.reply({
      content: 'Run this inside a campaign thread.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  const result = await takeTurn({ ctx, campaign, action: null, actor: null });
  if (result.refused) return interaction.editReply(result.refused);

  const [first, ...rest] = result.chunks;
  await interaction.editReply({ content: first, allowedMentions: { parse: [] } });

  for (const chunk of rest) {
    await interaction.followUp({ content: chunk, allowedMentions: { parse: [] } });
  }

  const footer = footerFor(result);
  if (footer)
    await interaction.followUp({ content: footer, allowedMentions: { parse: [] } });
}
