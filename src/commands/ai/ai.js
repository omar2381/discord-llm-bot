import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getSettings, setSettings } from '../../features/guildSettings.js';
import { AI_DISABLED_MESSAGE } from '../../ai/prompts.js';

export const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('Whether the AI answers in this server')
  .addSubcommand((sub) => sub.setName('enable').setDescription('Let the AI answer'))
  .addSubcommand((sub) => sub.setName('disable').setDescription('Stop the AI answering'))
  .addSubcommand((sub) => sub.setName('status').setDescription('Show the setting'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();
  const ephemeral = { flags: MessageFlags.Ephemeral };

  if (!ctx.config.ai.enabled) {
    return interaction.reply({
      content: `${AI_DISABLED_MESSAGE} Set OLLAMA_URL to turn it on.`,
      ...ephemeral,
    });
  }

  if (sub === 'status') {
    const settings = getSettings(ctx.db, interaction.guildId);
    const health = await ctx.ai.ollama.health();
    return interaction.reply({
      content: [
        `In this server: ${settings.ai_enabled ? 'on' : 'off'}`,
        `Model: \`${ctx.config.ai.model}\``,
        `Ollama: ${health.ok ? 'reachable' : `unreachable (${health.reason})`}`,
        health.ok && !health.hasModel ? 'The model is not pulled yet.' : null,
      ]
        .filter(Boolean)
        .join('\n'),
      ...ephemeral,
    });
  }

  setSettings(ctx.db, interaction.guildId, { ai_enabled: sub === 'enable' ? 1 : 0 });
  return interaction.reply({
    content: `The AI is ${sub === 'enable' ? 'on' : 'off'} in this server.`,
    ...ephemeral,
  });
}
