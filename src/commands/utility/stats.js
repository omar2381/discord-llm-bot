import { EmbedBuilder, MessageFlags, SlashCommandBuilder, version } from 'discord.js';
import { formatDuration } from '../../util/duration.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('How the bot itself is doing');

export async function execute(interaction, ctx) {
  if (ctx.config.ownerId && interaction.user.id !== ctx.config.ownerId) {
    return interaction.reply({
      content: 'That one is just for the owner.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const memory = process.memoryUsage();
  const health = ctx.ai.enabled ? await ctx.ai.ollama.health() : null;

  const embed = new EmbedBuilder()
    .setTitle('Bot status')
    .addFields(
      { name: 'Uptime', value: formatDuration(process.uptime() * 1000), inline: true },
      {
        name: 'Memory',
        value: `${Math.round(memory.rss / 1024 / 1024)} MB`,
        inline: true,
      },
      { name: 'Servers', value: String(ctx.client.guilds.cache.size), inline: true },
      { name: 'Commands', value: String(ctx.commands.size), inline: true },
      {
        name: 'Node / discord.js',
        value: `${process.version} / ${version}`,
        inline: true,
      },
      {
        name: 'AI',
        value: ctx.ai.enabled
          ? [
              `\`${ctx.config.ai.model}\``,
              health.ok ? 'reachable' : `unreachable (${health.reason})`,
              health.ok && !health.hasModel ? 'model not pulled' : null,
              `${ctx.ai.ollama.queued} in the queue`,
            ]
              .filter(Boolean)
              .join('\n')
          : 'off',
      },
    )
    .setFooter({ text: `Reminders pending: ${pendingReminders(ctx.db)}` });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

function pendingReminders(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM reminders').get().n;
}
