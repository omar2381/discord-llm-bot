import { z } from 'zod';
import {
  ABILITIES,
  ABILITY_NAMES,
  describeCheck,
  resolveCheck,
} from '../../features/dnd/rules.js';
import {
  addItem,
  awardXp,
  damageCharacter,
  findByName,
  healCharacter,
  modifiersFor,
  proficiencyFor,
  removeItem,
  setConditions,
} from '../../features/dnd/characters.js';
import { addLog, setScene } from '../../features/dnd/campaigns.js';

/**
 * The dungeon master's tools.
 *
 * The model never produces a number that matters. It says "this needs a
 * Dexterity check against DC 15" and the bot rolls it; it says "the goblin hits
 * for 6" and the bot subtracts it. Everything that changes the world goes
 * through here and lands in the database, so the next turn's prompt is correct
 * even though the model has forgotten everything.
 */

const abilityEnum = z.enum(ABILITIES);

function schema(name, description, properties, required = []) {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  };
}

function resolveTarget(ctx, name) {
  const character = findByName(ctx.db, ctx.campaign.id, name);
  if (!character) {
    const party = ctx.party.map((member) => member.name).join(', ');
    return {
      error: `There is nobody called "${name}". The party is: ${party || 'empty'}.`,
    };
  }
  return { character };
}

export const DM_TOOLS = [
  {
    name: 'roll_check',
    description:
      'Roll an ability check or saving throw for a character. Use this whenever an action could fail. You must call this instead of inventing a result.',
    schema: z.object({
      character: z.string().min(1),
      ability: abilityEnum,
      dc: z.number().int().min(1).max(30),
      reason: z.string().max(100).optional(),
      advantage: z.enum(['none', 'advantage', 'disadvantage']).optional(),
    }),
    jsonSchema: schema(
      'roll_check',
      'Roll an ability check for a character against a difficulty.',
      {
        character: { type: 'string', description: 'The character name' },
        ability: { type: 'string', enum: [...ABILITIES] },
        dc: { type: 'integer', description: '5 trivial, 10 easy, 15 medium, 20 hard' },
        reason: { type: 'string', description: 'What they are attempting' },
        advantage: { type: 'string', enum: ['none', 'advantage', 'disadvantage'] },
      },
      ['character', 'ability', 'dc'],
    ),
    execute(args, ctx) {
      const found = resolveTarget(ctx, args.character);
      if (found.error) return found;

      const character = found.character;
      const result = resolveCheck({
        roll20: ctx.roll20,
        modifier: modifiersFor(character)[args.ability],
        proficient: false,
        proficiency: proficiencyFor(character),
        dc: args.dc,
        advantage: args.advantage ?? 'none',
      });

      const label = `${character.name} ${ABILITY_NAMES[args.ability]}${args.reason ? ` (${args.reason})` : ''}`;
      const line = describeCheck(result, label);

      addLog(ctx.db, ctx.campaign.id, { kind: 'roll', content: line });
      ctx.rolls.push(line);

      return {
        character: character.name,
        total: result.total,
        natural: result.natural,
        dc: args.dc,
        success: result.success,
        critical: result.criticalSuccess
          ? 'success'
          : result.criticalFailure
            ? 'failure'
            : null,
      };
    },
  },

  {
    name: 'damage',
    description: 'Deal damage to a character. Only after a roll has justified it.',
    schema: z.object({
      character: z.string().min(1),
      amount: z.number().int().min(1).max(200),
      source: z.string().max(100).optional(),
    }),
    jsonSchema: schema(
      'damage',
      'Deal damage to a character.',
      {
        character: { type: 'string' },
        amount: { type: 'integer' },
        source: { type: 'string', description: 'What hurt them' },
      },
      ['character', 'amount'],
    ),
    execute(args, ctx) {
      const found = resolveTarget(ctx, args.character);
      if (found.error) return found;

      const result = damageCharacter(ctx.db, found.character, args.amount);
      const name = found.character.name;
      const line = result.instantDeath
        ? `${name} takes ${result.damageTaken} and is killed outright.`
        : result.downed
          ? `${name} takes ${result.damageTaken} and falls unconscious.`
          : `${name} takes ${result.damageTaken}${args.source ? ` from ${args.source}` : ''}.`;

      addLog(ctx.db, ctx.campaign.id, { kind: 'system', content: line });
      ctx.events.push(line);

      return {
        character: name,
        damage: result.damageTaken,
        hp: result.hpCurrent,
        downed: result.downed,
        dead: result.instantDeath,
      };
    },
  },

  {
    name: 'heal',
    description: 'Restore hit points to a character.',
    schema: z.object({
      character: z.string().min(1),
      amount: z.number().int().min(1).max(200),
    }),
    jsonSchema: schema(
      'heal',
      'Restore hit points.',
      { character: { type: 'string' }, amount: { type: 'integer' } },
      ['character', 'amount'],
    ),
    execute(args, ctx) {
      const found = resolveTarget(ctx, args.character);
      if (found.error) return found;

      const result = healCharacter(ctx.db, found.character, args.amount);
      const line = result.revived
        ? `${found.character.name} is back on their feet with ${result.hpCurrent} hp.`
        : `${found.character.name} recovers ${result.healedBy} hp.`;

      addLog(ctx.db, ctx.campaign.id, { kind: 'system', content: line });
      ctx.events.push(line);

      return {
        character: found.character.name,
        hp: result.hpCurrent,
        healed: result.healedBy,
      };
    },
  },

  {
    name: 'give_item',
    description: 'Give a character an item they have found or been handed.',
    schema: z.object({
      character: z.string().min(1),
      item: z.string().min(1).max(60),
      quantity: z.number().int().min(1).max(99).optional(),
    }),
    jsonSchema: schema(
      'give_item',
      'Give a character an item.',
      {
        character: { type: 'string' },
        item: { type: 'string' },
        quantity: { type: 'integer' },
      },
      ['character', 'item'],
    ),
    execute(args, ctx) {
      const found = resolveTarget(ctx, args.character);
      if (found.error) return found;

      addItem(ctx.db, found.character.id, {
        name: args.item,
        quantity: args.quantity ?? 1,
      });

      const line = `${found.character.name} takes ${args.quantity && args.quantity > 1 ? `${args.quantity} ` : ''}${args.item}.`;
      addLog(ctx.db, ctx.campaign.id, { kind: 'system', content: line });
      ctx.events.push(line);

      return { status: 'given', character: found.character.name, item: args.item };
    },
  },

  {
    name: 'take_item',
    description: 'Remove an item from a character, when it is used up, stolen or broken.',
    schema: z.object({
      character: z.string().min(1),
      item: z.string().min(1).max(60),
      quantity: z.number().int().min(1).max(99).optional(),
    }),
    jsonSchema: schema(
      'take_item',
      'Remove an item from a character.',
      {
        character: { type: 'string' },
        item: { type: 'string' },
        quantity: { type: 'integer' },
      },
      ['character', 'item'],
    ),
    execute(args, ctx) {
      const found = resolveTarget(ctx, args.character);
      if (found.error) return found;

      const result = removeItem(
        ctx.db,
        found.character.id,
        args.item,
        args.quantity ?? 1,
      );
      if (result.error) return result;

      const line = `${found.character.name} loses ${args.item}.`;
      addLog(ctx.db, ctx.campaign.id, { kind: 'system', content: line });
      ctx.events.push(line);

      return { status: 'taken', character: found.character.name, item: args.item };
    },
  },

  {
    name: 'award_xp',
    description: 'Give the whole party experience, after something significant.',
    schema: z.object({
      amount: z.number().int().min(1).max(10000),
      reason: z.string().max(100).optional(),
    }),
    jsonSchema: schema(
      'award_xp',
      'Give every character experience.',
      { amount: { type: 'integer' }, reason: { type: 'string' } },
      ['amount'],
    ),
    execute(args, ctx) {
      const results = ctx.party.map((character) => ({
        name: character.name,
        ...awardXp(ctx.db, character, args.amount),
      }));

      const levelled = results.filter((result) => result.levelledUp);
      const line = `The party gains ${args.amount} xp${args.reason ? ` for ${args.reason}` : ''}.${
        levelled.length
          ? ` ${levelled.map((r) => `${r.name} reaches level ${r.level}`).join('. ')}.`
          : ''
      }`;

      addLog(ctx.db, ctx.campaign.id, { kind: 'system', content: line });
      ctx.events.push(line);

      return { awarded: args.amount, levelled: levelled.map((r) => r.name) };
    },
  },

  {
    name: 'set_scene',
    description:
      'Record where the party is and what is going on, in one or two sentences. Call this whenever they move somewhere new.',
    schema: z.object({ scene: z.string().min(1).max(400) }),
    jsonSchema: schema(
      'set_scene',
      'Record the current location and situation.',
      { scene: { type: 'string' } },
      ['scene'],
    ),
    execute(args, ctx) {
      setScene(ctx.db, ctx.campaign.id, args.scene);
      return { status: 'scene_set' };
    },
  },

  {
    name: 'set_condition',
    description:
      'Mark a character as poisoned, prone, frightened and so on, or clear it with an empty list.',
    schema: z.object({
      character: z.string().min(1),
      conditions: z.array(z.string().max(30)).max(6),
    }),
    jsonSchema: schema(
      'set_condition',
      'Set or clear conditions on a character.',
      {
        character: { type: 'string' },
        conditions: { type: 'array', items: { type: 'string' } },
      },
      ['character', 'conditions'],
    ),
    execute(args, ctx) {
      const found = resolveTarget(ctx, args.character);
      if (found.error) return found;

      setConditions(ctx.db, found.character.id, args.conditions);
      return { status: 'conditions_set', conditions: args.conditions };
    },
  },
];

export const DM_TOOLS_BY_NAME = new Map(DM_TOOLS.map((tool) => [tool.name, tool]));

export function dmToolSchemas() {
  return DM_TOOLS.map((tool) => tool.jsonSchema);
}
