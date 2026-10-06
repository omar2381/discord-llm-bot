import { Events, MessageFlags } from 'discord.js';
import { Cooldown } from '../util/cooldown.js';

export const name = Events.InteractionCreate;

const cooldowns = new Map();

/** Reply with an ephemeral message whatever state the interaction is in. */
async function replyQuietly(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // The interaction token can expire while we are handling an error. Nothing
    // useful is left to do, and throwing here would mask the original failure.
  }
}

export async function execute(interaction, ctx) {
  if (interaction.isChatInputCommand()) {
    const command = ctx.commands.get(interaction.commandName);
    if (!command) return replyQuietly(interaction, 'This is no longer available.');

    if (command.cooldownSeconds) {
      let limiter = cooldowns.get(command.data.name);
      if (!limiter) {
        limiter = new Cooldown(command.cooldownSeconds);
        cooldowns.set(command.data.name, limiter);
      }
      const wait = limiter.check(interaction.user.id);
      if (wait > 0) {
        return replyQuietly(interaction, `Slow down - try again in ${wait}s.`);
      }
    }

    try {
      await command.execute(interaction, ctx);
    } catch (error) {
      ctx.logger.error(
        { err: error, command: interaction.commandName },
        'command failed',
      );
      await replyQuietly(interaction, 'Something went wrong.');
    }
    return;
  }

  if (
    interaction.isButton() ||
    interaction.isAnySelectMenu() ||
    interaction.isModalSubmit()
  ) {
    const prefix = interaction.customId.split(':')[0];
    const handler = ctx.components.get(prefix);
    if (!handler) return replyQuietly(interaction, 'This is no longer available.');

    try {
      await handler.execute(interaction, ctx);
    } catch (error) {
      ctx.logger.error(
        { err: error, customId: interaction.customId },
        'component failed',
      );
      await replyQuietly(interaction, 'Something went wrong.');
    }
  }
}
