import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { basename, dirname } from 'node:path';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List everything this bot can do');

export const cooldownSeconds = 5;

/** Group loaded commands by the folder they came from. */
export function groupCommands(entries) {
  const groups = new Map();
  for (const { path, name, description } of entries) {
    const group = basename(dirname(path));
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ name, description });
  }
  for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)));
}

export async function execute(interaction, ctx) {
  const entries = [...ctx.commands.values()].map((command) => ({
    path: command.sourcePath ?? 'misc/unknown.js',
    name: command.data.name,
    description: command.data.description,
  }));

  const embed = new EmbedBuilder().setTitle('Commands');
  for (const [group, commands] of groupCommands(entries)) {
    embed.addFields({
      name: group[0].toUpperCase() + group.slice(1),
      value: commands.map((c) => `\`/${c.name}\` ${c.description}`).join('\n'),
    });
  }

  if (!ctx.config.ai.enabled) {
    embed.setFooter({ text: 'The AI assistant is not configured on this bot.' });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
