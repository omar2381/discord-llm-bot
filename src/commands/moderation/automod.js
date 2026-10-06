import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  addBannedWord,
  getBannedWords,
  getSettings,
  removeBannedWord,
  setSettings,
} from '../../features/guildSettings.js';

export const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Automatic moderation')
  .addSubcommand((sub) => sub.setName('status').setDescription('What is switched on'))
  .addSubcommand((sub) =>
    sub.setName('enable').setDescription('Turn on banned-word filtering'),
  )
  .addSubcommand((sub) =>
    sub.setName('disable').setDescription('Turn off banned-word filtering'),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('words')
      .setDescription('The banned word list')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Ban a word')
          .addStringOption((option) =>
            option
              .setName('word')
              .setDescription('The word')
              .setRequired(true)
              .setMaxLength(50),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Unban a word')
          .addStringOption((option) =>
            option.setName('word').setDescription('The word').setRequired(true),
          ),
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('Show the list')),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('spam')
      .setDescription('Spam detection')
      .addSubcommand((sub) => sub.setName('enable').setDescription('Turn it on'))
      .addSubcommand((sub) => sub.setName('disable').setDescription('Turn it off')),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(0);

export async function execute(interaction, ctx) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const ephemeral = { flags: MessageFlags.Ephemeral };

  if (group === 'words') {
    const word = interaction.options.getString('word');

    if (sub === 'add') {
      const added = addBannedWord(ctx.db, guildId, word);
      return interaction.reply({
        content: added ? `Added \`${word}\`.` : `\`${word}\` was already on the list.`,
        ...ephemeral,
      });
    }
    if (sub === 'remove') {
      const removed = removeBannedWord(ctx.db, guildId, word);
      return interaction.reply({
        content: removed ? `Removed \`${word}\`.` : `\`${word}\` was not on the list.`,
        ...ephemeral,
      });
    }

    const words = getBannedWords(ctx.db, guildId);
    return interaction.reply({
      content: words.length
        ? `${words.length} banned: ${words.map((w) => `\`${w}\``).join(', ')}`
        : 'The banned word list is empty.',
      ...ephemeral,
    });
  }

  if (group === 'spam') {
    setSettings(ctx.db, guildId, { spam_enabled: sub === 'enable' ? 1 : 0 });
    return interaction.reply({
      content: `Spam detection is ${sub === 'enable' ? 'on' : 'off'}.`,
      ...ephemeral,
    });
  }

  if (sub === 'enable' || sub === 'disable') {
    setSettings(ctx.db, guildId, { automod_enabled: sub === 'enable' ? 1 : 0 });
    return interaction.reply({
      content: `Banned-word filtering is ${sub === 'enable' ? 'on' : 'off'}.`,
      ...ephemeral,
    });
  }

  const settings = getSettings(ctx.db, guildId);
  const words = getBannedWords(ctx.db, guildId);
  return interaction.reply({
    content: [
      `Banned words: ${settings.automod_enabled ? 'on' : 'off'} (${words.length} on the list)`,
      `Spam detection: ${settings.spam_enabled ? 'on' : 'off'}`,
      `Mod log: ${settings.modlog_channel_id ? `<#${settings.modlog_channel_id}>` : 'off'}`,
    ].join('\n'),
    ...ephemeral,
  });
}
