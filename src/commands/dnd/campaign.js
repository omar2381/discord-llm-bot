import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  time,
} from 'discord.js';
import {
  campaignForChannel,
  campaignsInGuild,
  createCampaign,
  deleteCampaign,
  getCampaign,
  setStatus,
} from '../../features/dnd/campaigns.js';
import { partyFor } from '../../features/dnd/characters.js';
import { characterLine } from '../../features/dnd/characters.js';
import { AI_DISABLED_MESSAGE } from '../../ai/prompts.js';

export const data = new SlashCommandBuilder()
  .setName('campaign')
  .setDescription('Run a Dungeons and Dragons game')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Begin a campaign in a new thread')
      .addStringOption((option) =>
        option
          .setName('name')
          .setDescription('What the campaign is called')
          .setRequired(true)
          .setMaxLength(90),
      )
      .addStringOption((option) =>
        option
          .setName('tone')
          .setDescription('How it should feel, e.g. "grim and wet" or "silly"')
          .setMaxLength(100),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('Who is in the party and where they are'),
  )
  .addSubcommand((sub) => sub.setName('recap').setDescription('The story so far'))
  .addSubcommand((sub) => sub.setName('pause').setDescription('Stop the DM responding'))
  .addSubcommand((sub) => sub.setName('resume').setDescription('Carry on'))
  .addSubcommand((sub) =>
    sub.setName('end').setDescription('Finish the campaign, keeping the record'),
  )
  .addSubcommand((sub) =>
    sub.setName('delete').setDescription('Delete the campaign and every character in it'),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Campaigns in this server'))
  .setContexts(0);

export const cooldownSeconds = 3;

export async function execute(interaction, ctx) {
  const sub = interaction.options.getSubcommand();
  const ephemeral = { flags: MessageFlags.Ephemeral };

  if (sub === 'start') return start(interaction, ctx, ephemeral);
  if (sub === 'list') return list(interaction, ctx, ephemeral);

  const campaign = campaignForChannel(ctx.db, interaction.channelId);
  if (!campaign) {
    return interaction.reply({
      content: 'Run this inside a campaign thread. `/campaign start` makes one.',
      ...ephemeral,
    });
  }

  if (sub === 'status') {
    const party = partyFor(ctx.db, campaign.id);
    const embed = new EmbedBuilder()
      .setTitle(campaign.name)
      .setDescription(campaign.scene || 'The adventure has not started yet.')
      .addFields({
        name: `Party (${party.length})`,
        value: party.length
          ? party.map((character) => characterLine(character)).join('\n')
          : 'Nobody yet. Try `/character create`.',
      })
      .setFooter({
        text: `${campaign.status} · ${campaign.turn_count} turns · started ${new Date(campaign.created_at).toISOString().slice(0, 10)}`,
      });

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'recap') {
    return interaction.reply({
      content: campaign.summary
        ? `**The story so far**\n${campaign.summary}`
        : 'Not enough has happened yet for a recap.',
      allowedMentions: { parse: [] },
    });
  }

  if (sub === 'pause' || sub === 'resume') {
    setStatus(ctx.db, campaign.id, sub === 'pause' ? 'paused' : 'active');
    return interaction.reply(
      sub === 'pause'
        ? 'Paused. The dungeon master will sit quietly until `/campaign resume`.'
        : 'Back in. Say what you do.',
    );
  }

  if (sub === 'end') {
    if (!canManage(interaction, campaign)) {
      return interaction.reply({
        content: 'Only whoever started the campaign, or a moderator, can end it.',
        ...ephemeral,
      });
    }
    setStatus(ctx.db, campaign.id, 'ended');
    return interaction.reply(
      `**${campaign.name}** ends here. The characters and the record are kept; \`/campaign delete\` removes them.`,
    );
  }

  if (sub === 'delete') {
    if (!canManage(interaction, campaign)) {
      return interaction.reply({
        content: 'Only whoever started the campaign, or a moderator, can delete it.',
        ...ephemeral,
      });
    }
    deleteCampaign(ctx.db, campaign.id);
    return interaction.reply(`**${campaign.name}** and its characters are gone.`);
  }
}

function canManage(interaction, campaign) {
  return (
    interaction.user.id === campaign.created_by ||
    interaction.memberPermissions?.has('ManageThreads')
  );
}

async function start(interaction, ctx, ephemeral) {
  if (!ctx.ai.enabled) {
    return interaction.reply({
      content: `${AI_DISABLED_MESSAGE} The dungeon master needs it; everything else works without.`,
      ...ephemeral,
    });
  }

  if (interaction.channel.isThread()) {
    return interaction.reply({
      content: 'Start a campaign from a normal channel; I will make the thread.',
      ...ephemeral,
    });
  }
  if (interaction.channel.type !== ChannelType.GuildText) {
    return interaction.reply({
      content: 'This only works in a normal text channel.',
      ...ephemeral,
    });
  }

  const name = interaction.options.getString('name');
  const tone = interaction.options.getString('tone');

  await interaction.deferReply();

  const thread = await interaction.channel.threads.create({
    name: name.slice(0, 90),
    autoArchiveDuration: 10080,
    reason: `D&D campaign started by ${interaction.user.tag}`,
  });

  const campaign = createCampaign(ctx.db, {
    guildId: interaction.guildId,
    channelId: thread.id,
    name,
    tone,
    createdBy: interaction.user.id,
  });

  await interaction.editReply(`**${name}** begins in <#${thread.id}>.`);

  await thread.send(
    [
      `**${name}**`,
      tone ? `_${tone}_` : null,
      '',
      'Everyone who is playing: `/character create` to roll one up.',
      'When the party is ready, `/begin` opens the scene.',
      '',
      'After that, just say what you do in this thread. No command needed.',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return campaign;
}

async function list(interaction, ctx, ephemeral) {
  const campaigns = campaignsInGuild(ctx.db, interaction.guildId);
  if (!campaigns.length) {
    return interaction.reply({ content: 'No campaigns here yet.', ...ephemeral });
  }

  const lines = campaigns.slice(0, 20).map((campaign) => {
    const party = partyFor(ctx.db, campaign.id).length;
    const when = campaign.last_played_at
      ? time(Math.floor(campaign.last_played_at / 1000), 'R')
      : 'never';
    return `<#${campaign.channel_id}> - ${campaign.name}, ${party} player${party === 1 ? '' : 's'}, ${campaign.status}, last played ${when}`;
  });

  return interaction.reply({
    content: lines.join('\n'),
    allowedMentions: { parse: [] },
    ...ephemeral,
  });
}

export { getCampaign };
