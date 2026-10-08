import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { campaignForChannel } from '../../features/dnd/campaigns.js';
import {
  createCharacter,
  getCharacterFor,
  inventory,
  modifiersFor,
  partyFor,
  proficiencyFor,
  rest,
} from '../../features/dnd/characters.js';
import {
  ABILITY_NAMES,
  ANCESTRIES,
  CLASSES,
  CLASS_KEYS,
  xpToNextLevel,
} from '../../features/dnd/rules.js';

export const data = new SlashCommandBuilder()
  .setName('character')
  .setDescription('Your adventurer')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Roll up a character for this campaign')
      .addStringOption((option) =>
        option
          .setName('name')
          .setDescription('Their name')
          .setRequired(true)
          .setMaxLength(40),
      )
      .addStringOption((option) =>
        option
          .setName('class')
          .setDescription('What they do')
          .setRequired(true)
          .addChoices(
            ...CLASS_KEYS.map((key) => ({
              name: `${CLASSES[key].label} - ${CLASSES[key].blurb}`.slice(0, 100),
              value: key,
            })),
          ),
      )
      .addStringOption((option) =>
        option
          .setName('ancestry')
          .setDescription('What they are')
          .setRequired(true)
          .addChoices(...ANCESTRIES.map((name) => ({ name, value: name }))),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('sheet')
      .setDescription('Show a character sheet')
      .addUserOption((option) =>
        option.setName('player').setDescription('Whose; defaults to yours'),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('rest')
      .setDescription('Take a rest')
      .addStringOption((option) =>
        option
          .setName('kind')
          .setDescription('Short gets a little back, long gets everything')
          .setRequired(true)
          .addChoices(
            { name: 'Short rest', value: 'short' },
            { name: 'Long rest', value: 'long' },
          ),
      ),
  )
  .setContexts(0);

export const cooldownSeconds = 3;

export async function execute(interaction, ctx) {
  const campaign = campaignForChannel(ctx.db, interaction.channelId);
  if (!campaign) {
    return interaction.reply({
      content: 'Run this inside a campaign thread.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const result = createCharacter(ctx.db, {
      campaignId: campaign.id,
      userId: interaction.user.id,
      name: interaction.options.getString('name'),
      ancestry: interaction.options.getString('ancestry'),
      classKey: interaction.options.getString('class'),
    });

    if (result.error) {
      return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({
      content: `<@${interaction.user.id}> joins the party.`,
      embeds: [sheetEmbed(ctx.db, result.character)],
      allowedMentions: { parse: [] },
    });
  }

  if (sub === 'sheet') {
    const user = interaction.options.getUser('player') ?? interaction.user;
    const character = getCharacterFor(ctx.db, campaign.id, user.id);

    if (!character) {
      return interaction.reply({
        content:
          user.id === interaction.user.id
            ? 'You have no character here. `/character create` makes one.'
            : 'They have no character in this campaign.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({ embeds: [sheetEmbed(ctx.db, character)] });
  }

  if (sub === 'rest') {
    const character = getCharacterFor(ctx.db, campaign.id, interaction.user.id);
    if (!character) {
      return interaction.reply({
        content: 'You have no character here.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const kind = interaction.options.getString('kind');
    const result = rest(ctx.db, character, kind);

    return interaction.reply(
      kind === 'long'
        ? `${character.name} sleeps, and wakes at ${result.hpCurrent}/${character.hp_max} hit points.`
        : `${character.name} catches their breath and recovers ${result.healedBy} hit points.`,
    );
  }
}

export function sheetEmbed(db, character) {
  const definition = CLASSES[character.class];
  const mods = modifiersFor(character);
  const items = inventory(db, character.id);
  const toNext = xpToNextLevel(character.xp);

  const abilityLine = Object.entries(ABILITY_NAMES)
    .map(([key, label]) => {
      const mod = mods[key];
      return `${label.slice(0, 3)} ${character[key]} (${mod >= 0 ? '+' : ''}${mod})`;
    })
    .join(' · ');

  const embed = new EmbedBuilder()
    .setTitle(character.name)
    .setDescription(
      `Level ${character.level} ${character.ancestry} ${definition?.label ?? character.class}`,
    )
    .addFields(
      {
        name: 'Hit points',
        value:
          character.hp_current === 0
            ? `**0**/${character.hp_max} - unconscious`
            : `**${character.hp_current}**/${character.hp_max}${character.temp_hp ? ` (+${character.temp_hp} temp)` : ''}`,
        inline: true,
      },
      { name: 'Armour class', value: String(character.ac), inline: true },
      {
        name: 'Proficiency',
        value: `+${proficiencyFor(character)}`,
        inline: true,
      },
      { name: 'Abilities', value: abilityLine },
    );

  if (character.conditions) {
    embed.addFields({ name: 'Conditions', value: character.conditions });
  }

  if (character.hp_current === 0) {
    embed.addFields({
      name: 'Death saves',
      value: `${'●'.repeat(character.death_saves_passed)}${'○'.repeat(3 - character.death_saves_passed)} passed · ${'●'.repeat(character.death_saves_failed)}${'○'.repeat(3 - character.death_saves_failed)} failed`,
    });
  }

  embed.addFields({
    name: 'Carrying',
    value: items.length
      ? items
          .map((item) =>
            item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
          )
          .join(', ')
      : 'nothing worth listing',
  });

  embed.setFooter({
    text:
      toNext === null
        ? `${character.xp} xp · maximum level`
        : `${character.xp} xp · ${toNext} to level ${character.level + 1}`,
  });

  return embed;
}

export { partyFor };
