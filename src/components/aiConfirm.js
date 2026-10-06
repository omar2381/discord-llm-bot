import { MessageFlags } from 'discord.js';
import { executeConfirmed } from '../ai/agent.js';
import { logAction } from '../features/modlog.js';

export const prefix = 'aiconfirm';

export async function execute(interaction, ctx) {
  const [, decision, id] = interaction.customId.split(':');

  if (!ctx.ai.enabled) {
    return interaction.reply({
      content: 'The AI is not configured.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const claim =
    decision === 'yes'
      ? ctx.ai.pending.claim(id, interaction.user.id)
      : ctx.ai.pending.cancel(id, interaction.user.id);

  if (claim.error === 'not_yours') {
    return interaction.reply({
      content: 'Only the person who asked can answer this.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (claim.error) {
    return interaction.reply({
      content: 'That has expired. Ask again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (decision !== 'yes') {
    return interaction.update({ content: 'Cancelled.', components: [] });
  }

  await interaction.deferUpdate();

  const result = await executeConfirmed({
    action: claim.action,
    toolCtx: {
      db: ctx.db,
      guild: interaction.guild,
      channel: interaction.channel,
      member: interaction.member,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    },
    member: interaction.member,
    channel: interaction.channel,
  });

  if (result.error) {
    return interaction.editReply({
      content: `Not done: ${result.error}`,
      components: [],
    });
  }

  await interaction.editReply({
    content: `Done: ${claim.action.description}.`,
    components: [],
    allowedMentions: { parse: [] },
  });

  await logAction(ctx, interaction.guild, {
    action: claim.action.toolName.includes('timeout') ? 'timeout' : 'automod',
    actor: interaction.user,
    reason: 'Confirmed from an AI suggestion',
    detail: claim.action.description,
  });
}
