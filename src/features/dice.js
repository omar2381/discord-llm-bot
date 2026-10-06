const PATTERN = /^(\d{1,3})?d(\d{1,4})([+-]\d{1,4})?$/i;

export const MAX_DICE = 100;
export const MAX_SIDES = 1000;

/**
 * Parse "2d6+1" style notation. Returns null for anything that does not parse
 * or that exceeds the caps, so callers only have to check for null.
 */
export function parseDice(input) {
  const match = PATTERN.exec(String(input).trim().replace(/\s+/g, ''));
  if (!match) return null;

  const count = match[1] === undefined ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;

  if (count < 1 || count > MAX_DICE) return null;
  if (sides < 2 || sides > MAX_SIDES) return null;

  return { count, sides, modifier };
}

/** Roll a parsed spec. Returns each die and the total including the modifier. */
export function roll({ count, sides, modifier }, random = Math.random) {
  const rolls = Array.from({ length: count }, () => Math.floor(random() * sides) + 1);
  const total = rolls.reduce((sum, n) => sum + n, 0) + modifier;
  return { rolls, modifier, total };
}

export function formatRoll(spec, { rolls, modifier, total }) {
  const sign = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
  const notation = `${spec.count}d${spec.sides}${sign}`;
  if (rolls.length === 1 && !modifier) return `**${total}** (${notation})`;
  return `**${total}** (${notation}: ${rolls.join(', ')}${sign ? ` ${sign}` : ''})`;
}
