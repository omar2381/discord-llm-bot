import { MessageFlags, SlashCommandBuilder, time } from 'discord.js';
import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  formatDuration,
  parseDuration,
} from '../../util/duration.js';
import {
  MAX_PER_USER,
  cancelReminder,
  createReminder,
  formatReminderLine,
  listReminders,
} from '../../features/reminders.js';

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Have the bot nudge you later')
  .addSubcommand((sub) =>
    sub
      .setName('me')
      .setDescription('Set a reminder')
      .addStringOption((option) =>
        option
          .setName('in')
          .setDescription('How long from now, e.g. 10m, 2h30m, 1d')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('What to remind you about')
          .setRequired(true)
          .setMaxLength(500),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Your pending reminders'))
  .addSubcommand((sub) =>
    sub
      .setName('cancel')
      .setDescription('Cancel one of your reminders')
      .addIntegerOption((option) =>
        option
          .setName('id')
          .setDescription('The id shown by /remind list')
          .setRequired(true),
      ),
  );

export const cooldownSeconds = 3;

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'me') {
    const ms = parseDuration(interaction.options.getString('in'));
    if (ms === null) {
      return interaction.reply({
        content: 'I could not read that duration. Try `10m`, `2h30m` or `1d`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (ms < MIN_DURATION_MS) {
      return interaction.reply({
        content: 'The shortest reminder is one minute.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (ms > MAX_DURATION_MS) {
      return interaction.reply({
        content: 'The longest reminder is a year.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const dueAt = Date.now() + ms;
    const id = createReminder(ctx.db, {
      userId: interaction.user.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      message: interaction.options.getString('message'),
      dueAt,
    });

    if (id === null) {
      return interaction.reply({
        content: `You already have ${MAX_PER_USER} reminders pending. Cancel one first.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: `Reminder \`${id}\` set for ${time(Math.floor(dueAt / 1000), 'R')} (${formatDuration(ms)}).`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'list') {
    const reminders = listReminders(ctx.db, interaction.user.id);
    return interaction.reply({
      content: reminders.length
        ? reminders.map((reminder) => formatReminderLine(reminder)).join('\n')
        : 'You have no reminders pending.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'cancel') {
    const id = interaction.options.getInteger('id');
    const removed = cancelReminder(ctx.db, interaction.user.id, id);
    return interaction.reply({
      content: removed
        ? `Cancelled reminder \`${id}\`.`
        : `No reminder \`${id}\` of yours. Check \`/remind list\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
