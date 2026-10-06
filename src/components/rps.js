import { ActionRowBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { choiceOptions, formatResult, getResult } from '../features/rps.js';

export const prefix = 'rps';

const EXPIRED = 'This challenge has expired.';

export async function execute(interaction, ctx) {
  const [, action, gameId] = interaction.customId.split(':');
  const game = ctx.db.prepare('SELECT * FROM rps_games WHERE id = ?').get(gameId);

  if (!game) {
    return interaction.reply({ content: EXPIRED, flags: MessageFlags.Ephemeral });
  }

  if (action === 'accept') {
    if (interaction.user.id === game.challenger_id) {
      return interaction.reply({
        content: 'You cannot accept your own challenge.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (game.opponent_id && game.opponent_id !== interaction.user.id) {
      return interaction.reply({
        content: 'This challenge is for someone else.',
        flags: MessageFlags.Ephemeral,
      });
    }

    ctx.db
      .prepare('UPDATE rps_games SET opponent_id = ? WHERE id = ?')
      .run(interaction.user.id, gameId);

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rps:choose:${gameId}`)
        .setPlaceholder('Pick yours')
        .addOptions(choiceOptions()),
    );

    return interaction.reply({
      content: 'Your move. Only you can see this.',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'choose') {
    if (interaction.user.id !== game.opponent_id) {
      return interaction.reply({ content: EXPIRED, flags: MessageFlags.Ephemeral });
    }

    const theirChoice = interaction.values[0];
    const result = getResult(game.choice, theirChoice);
    const message = formatResult(
      result,
      { id: game.challenger_id, choice: game.choice },
      { id: interaction.user.id, choice: theirChoice },
    );

    ctx.db.prepare('DELETE FROM rps_games WHERE id = ?').run(gameId);

    await interaction.update({ content: 'Done.', components: [] });
    await interaction.channel?.send({
      content: message,
      allowedMentions: { parse: [] },
    });

    // Drop the Accept button so the challenge cannot be taken twice.
    try {
      await interaction.message.edit({ components: [] });
    } catch {
      // The original challenge may have been deleted; nothing to tidy up.
    }
  }
}

/**
 * Challenges nobody accepted pile up, so clear out anything older than a day.
 * Called at startup and hourly from index.js once Phase 6 adds the scheduler;
 * exported now so it can be tested and wired up without changing this file.
 */
export function purgeOldGames(db, maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now()) {
  return db.prepare('DELETE FROM rps_games WHERE created_at < ?').run(now - maxAgeMs)
    .changes;
}
