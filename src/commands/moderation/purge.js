import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { logAction } from '../../features/modlog.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Delete recent messages in this channel')
  .addIntegerOption((option) =>
    option
      .setName('count')
      .setDescription('How many to look at (1-100)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100),
  )
  .addUserOption((option) =>
    option.setName('user').setDescription('Only delete messages from this member'),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const count = interaction.options.getInteger('count');
  const user = interaction.options.getUser('user');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const fetched = await interaction.channel.messages.fetch({ limit: count });
  const candidates = user ? fetched.filter((m) => m.author.id === user.id) : fetched;

  // true = skip anything older than 14 days, which Discord refuses to bulk delete.
  const deleted = await interaction.channel.bulkDelete(candidates, true);

  const skipped = candidates.size - deleted.size;
  await interaction.editReply(
    skipped > 0
      ? `Deleted ${deleted.size}. ${skipped} were older than 14 days, which Discord will not bulk delete.`
      : `Deleted ${deleted.size}.`,
  );

  if (deleted.size > 0) {
    await logAction(ctx, interaction.guild, {
      action: 'purge',
      actor: interaction.user,
      target: user,
      detail: `${deleted.size} message(s) in <#${interaction.channelId}>`,
    });
  }
}
