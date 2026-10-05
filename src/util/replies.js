import { MessageFlags } from 'discord.js';

/**
 * Send an ephemeral message whether or not the interaction was already answered.
 * Never throws: a failed error reply is logged, not re-raised.
 */
export async function replyEphemeral(interaction, content, logger) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (err) {
    logger?.warn({ err }, 'Could not send ephemeral reply');
  }
}
