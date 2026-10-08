/**
 * A small d20 ruleset, compatible with how fifth edition plays at a table but
 * written from scratch. No rulebook text is reproduced here: these are the
 * arithmetic rules of the game (modifiers, proficiency, advantage), which is
 * all the bot needs to adjudicate a check.
 *
 * Everything here is pure. The dice come from features/dice.js, so a roll can
 * be made deterministic in a test by passing a fake random source.
 */

export const ABILITIES = Object.freeze(['str', 'dex', 'con', 'intl', 'wis', 'cha']);

export const ABILITY_NAMES = Object.freeze({
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  intl: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
});

/** The usual table: 10-11 is +0, every two points either way is one step. */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/** +2 at levels 1-4, then +1 every four levels. */
export function proficiencyBonus(level) {
  return 2 + Math.floor((clampLevel(level) - 1) / 4);
}

export const MAX_LEVEL = 20;

export function clampLevel(level) {
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(level || 1)));
}

/**
 * Experience needed to reach each level. The curve is the familiar one, so a
 * party that has played elsewhere will recognise the pace.
 */
export const XP_THRESHOLDS = Object.freeze([
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000,
  140000, 165000, 195000, 225000, 265000, 305000, 355000,
]);

export function levelForXp(xp) {
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

export function xpToNextLevel(xp) {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return null;
  return XP_THRESHOLDS[level] - xp;
}

export const CLASSES = Object.freeze({
  fighter: {
    label: 'Fighter',
    hitDie: 10,
    primary: 'str',
    saves: ['str', 'con'],
    blurb: 'Stands at the front and stays there.',
  },
  rogue: {
    label: 'Rogue',
    hitDie: 8,
    primary: 'dex',
    saves: ['dex', 'intl'],
    blurb: 'Finds the way in that nobody else noticed.',
  },
  wizard: {
    label: 'Wizard',
    hitDie: 6,
    primary: 'intl',
    saves: ['intl', 'wis'],
    blurb: 'Fragile, and worth protecting.',
  },
  cleric: {
    label: 'Cleric',
    hitDie: 8,
    primary: 'wis',
    saves: ['wis', 'cha'],
    blurb: 'Keeps the others upright.',
  },
  ranger: {
    label: 'Ranger',
    hitDie: 10,
    primary: 'dex',
    saves: ['str', 'dex'],
    blurb: 'At home outdoors, and good at a distance.',
  },
  bard: {
    label: 'Bard',
    hitDie: 8,
    primary: 'cha',
    saves: ['dex', 'cha'],
    blurb: 'Talks the party out of what it talked itself into.',
  },
});

export const CLASS_KEYS = Object.freeze(Object.keys(CLASSES));

export const ANCESTRIES = Object.freeze([
  'Human',
  'Elf',
  'Dwarf',
  'Halfling',
  'Half-Orc',
  'Tiefling',
  'Gnome',
  'Dragonborn',
]);

/**
 * The standard array, assigned so the class's primary ability gets the best
 * score. New players should not have to understand point buy to start.
 */
export const STANDARD_ARRAY = Object.freeze([15, 14, 13, 12, 10, 8]);

export function suggestedAbilities(classKey) {
  const definition = CLASSES[classKey];
  if (!definition) throw new Error(`unknown class: ${classKey}`);

  const order = [
    definition.primary,
    'con',
    ...ABILITIES.filter((a) => a !== definition.primary && a !== 'con'),
  ];

  const scores = {};
  order.forEach((ability, index) => {
    scores[ability] = STANDARD_ARRAY[index];
  });
  return scores;
}

/** Hit points at level 1: the full hit die plus the Constitution modifier. */
export function startingHp(classKey, conScore) {
  const definition = CLASSES[classKey];
  if (!definition) throw new Error(`unknown class: ${classKey}`);
  return Math.max(1, definition.hitDie + abilityModifier(conScore));
}

/** Hit points gained on level up: the average of the die, rounded up, plus Con. */
export function hpGainOnLevel(classKey, conScore) {
  const definition = CLASSES[classKey];
  const average = Math.floor(definition.hitDie / 2) + 1;
  return Math.max(1, average + abilityModifier(conScore));
}

export function startingAc(dexScore) {
  // Leather and a shield, near enough, without an equipment system.
  return 11 + abilityModifier(dexScore);
}

export const DIFFICULTY = Object.freeze({
  trivial: 5,
  easy: 10,
  medium: 15,
  hard: 20,
  formidable: 25,
  legendary: 30,
});

/**
 * Resolve a d20 check. `roll20` is injected rather than rolled here so the
 * caller owns the randomness and tests stay deterministic.
 *
 * Returns the dice, the total, and whether it beat the DC. A natural 20 is
 * always a critical success and a natural 1 always a critical failure, which
 * is what everyone expects at a table even where the rules are quieter.
 */
export function resolveCheck({
  roll20,
  modifier = 0,
  proficient = false,
  proficiency = 0,
  dc = null,
  advantage = 'none',
}) {
  const dice = advantage === 'none' ? [roll20()] : [roll20(), roll20()];
  const natural =
    advantage === 'advantage'
      ? Math.max(...dice)
      : advantage === 'disadvantage'
        ? Math.min(...dice)
        : dice[0];

  const bonus = modifier + (proficient ? proficiency : 0);
  const total = natural + bonus;

  const criticalSuccess = natural === 20;
  const criticalFailure = natural === 1;

  let success = null;
  if (dc !== null) {
    success = criticalSuccess ? true : criticalFailure ? false : total >= dc;
  }

  return { dice, natural, bonus, total, dc, success, criticalSuccess, criticalFailure };
}

export function describeCheck(result, label) {
  const sign = result.bonus >= 0 ? `+${result.bonus}` : `${result.bonus}`;
  const dice =
    result.dice.length > 1 ? `[${result.dice.join(', ')}]` : `${result.natural}`;
  const head = `${label}: **${result.total}** (d20 ${dice} ${sign})`;

  if (result.criticalSuccess) return `${head} - critical success`;
  if (result.criticalFailure) return `${head} - critical failure`;
  if (result.dc === null) return head;
  return `${head} vs DC ${result.dc} - ${result.success ? 'success' : 'failure'}`;
}

/**
 * Apply damage. Temporary hit points go first. Dropping to 0 does not kill
 * outright: the character falls unconscious and starts making death saves,
 * which is the rule that keeps a bad roll from ending someone's evening.
 */
export function applyDamage({ hpCurrent, hpMax, tempHp = 0 }, amount) {
  const damage = Math.max(0, Math.floor(amount));

  const absorbed = Math.min(tempHp, damage);
  const remaining = damage - absorbed;
  const newTemp = tempHp - absorbed;
  const newHp = Math.max(0, hpCurrent - remaining);

  return {
    hpCurrent: newHp,
    tempHp: newTemp,
    damageTaken: damage,
    // Damage at least equal to the maximum, dealt while already down, is lethal.
    instantDeath: remaining - hpCurrent >= hpMax,
    downed: newHp === 0,
  };
}

export function applyHealing({ hpCurrent, hpMax }, amount) {
  const healed = Math.max(0, Math.floor(amount));
  const newHp = Math.min(hpMax, hpCurrent + healed);
  return {
    hpCurrent: newHp,
    healedBy: newHp - hpCurrent,
    revived: hpCurrent === 0 && newHp > 0,
  };
}

/** Three passes and you are stable; three failures and you are not. */
export function recordDeathSave({ passed, failed }, result) {
  const next = {
    passed: passed + (result.criticalSuccess ? 2 : result.success ? 1 : 0),
    failed: failed + (result.criticalFailure ? 2 : result.success ? 0 : 1),
  };

  return {
    passed: Math.min(3, next.passed),
    failed: Math.min(3, next.failed),
    stable: next.passed >= 3,
    dead: next.failed >= 3,
    revived: Boolean(result.criticalSuccess),
  };
}

export function longRest(character) {
  return {
    hpCurrent: character.hp_max,
    tempHp: 0,
    death_saves_passed: 0,
    death_saves_failed: 0,
  };
}

/** A short rest returns about a quarter of the character's health. */
export function shortRest(character) {
  const back = Math.max(1, Math.floor(character.hp_max / 4));
  return {
    hpCurrent: Math.min(character.hp_max, character.hp_current + back),
    healedBy: Math.min(character.hp_max - character.hp_current, back),
  };
}
