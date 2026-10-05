import { Events } from 'discord.js';
import { replyEphemeral } from '../util/replies.js';

export const name = Events.InteractionCreate;

export const GONE_MESSAGE = 'This is no longer available.';
export const ERROR_MESSAGE = 'Something went wrong.';

/** Route every interaction to its handler. Every interaction gets a response. */
export async function execute(interaction, ctx) {
  const { logger } = ctx;

  if (interaction.isAutocomplete()) {
    const command = ctx.commands.get(interaction.commandName);
    try {
      if (command?.autocomplete) await command.autocomplete(interaction, ctx);
      else await interaction.respond([]);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, 'Autocomplete failed');
    }
    return;
  }

  let handler;
  let label;
  if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
    label = `/${interaction.commandName}`;
    handler = ctx.commands.get(interaction.commandName);
  } else if (
    interaction.isButton() ||
    interaction.isAnySelectMenu() ||
    interaction.isModalSubmit()
  ) {
    const prefix = interaction.customId.split(':')[0];
    label = `component ${prefix}`;
    handler = ctx.components.get(prefix);
  } else {
    return;
  }

  if (!handler) {
    logger.warn(`No handler for ${label}`);
    await replyEphemeral(interaction, GONE_MESSAGE, logger);
    return;
  }

  const waitMs = ctx.cooldowns.hit(label, interaction.user.id, handler.cooldownSeconds);
  if (waitMs > 0) {
    await replyEphemeral(
      interaction,
      `Slow down! Try again in ${Math.ceil(waitMs / 1000)}s.`,
      logger,
    );
    return;
  }

  try {
    await handler.execute(interaction, ctx);
  } catch (err) {
    logger.error({ err, handler: label, user: interaction.user.id }, 'Interaction handler failed');
    await replyEphemeral(interaction, ERROR_MESSAGE, logger);
  }
}
