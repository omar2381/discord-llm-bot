import { MessageFlags } from 'discord.js';
import { executeConfirmed } from '../ai/agent.js';
import { logAction } from '../features/modlog.js';
import { modlogActionFor } from '../ai/tools.js';

const DISCORD_LIMIT = 2000;

/**
 * The message after one of its pending actions was answered: that action's
 * buttons go, the others stay (one answer used to wipe every row, so a second
 * suggested action could no longer be confirmed or cancelled), and a status
 * line is added under the text. Pure, so it can be tested without Discord.
 */
export function afterAnswer(message, id, status) {
  const rows = (message?.components ?? [])
    .filter(
      (row) =>
        !(row.components ?? []).some((c) =>
          String(c.customId ?? c.custom_id ?? '').endsWith(`:${id}`),
        ),
    )
    .map((row) => (typeof row.toJSON === 'function' ? row.toJSON() : row));
  const base = String(message?.content ?? '').trim();
  const joined = base ? `${base}\n\n${status}` : status;
  return { content: joined.length <= DISCORD_LIMIT ? joined : status, components: rows };
}

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
    return interaction.update({
      ...afterAnswer(interaction.message, id, `Cancelled: ${claim.action.description}.`),
      allowedMentions: { parse: [] },
    });
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
      ...afterAnswer(interaction.message, id, `Not done: ${result.error}`),
      allowedMentions: { parse: [] },
    });
  }

  await interaction.editReply({
    ...afterAnswer(interaction.message, id, `Done: ${claim.action.description}.`),
    allowedMentions: { parse: [] },
  });

  await logAction(ctx, interaction.guild, {
    action: modlogActionFor(claim.action.toolName),
    actor: interaction.user,
    reason: 'Confirmed from an AI suggestion',
    detail: claim.action.description,
  });
}
