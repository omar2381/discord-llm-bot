import {
  ABILITIES,
  CLASSES,
  abilityModifier,
  applyDamage,
  applyHealing,
  clampLevel,
  hpGainOnLevel,
  levelForXp,
  longRest,
  proficiencyBonus,
  recordDeathSave,
  shortRest,
  startingAc,
  startingHp,
  suggestedAbilities,
} from './rules.js';

export function createCharacter(db, { campaignId, userId, name, ancestry, classKey }) {
  const definition = CLASSES[classKey];
  if (!definition) return { error: 'I do not know that class.' };

  const existing = db
    .prepare('SELECT id FROM characters WHERE campaign_id = ? AND user_id = ?')
    .get(campaignId, userId);
  if (existing) return { error: 'You already have a character in this campaign.' };

  const abilities = suggestedAbilities(classKey);
  const hp = startingHp(classKey, abilities.con);

  const id = db
    .prepare(
      `INSERT INTO characters
       (campaign_id, user_id, name, ancestry, class, level, xp, hp_current, hp_max,
        ac, str, dex, con, intl, wis, cha, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      campaignId,
      userId,
      name,
      ancestry,
      classKey,
      hp,
      hp,
      startingAc(abilities.dex),
      abilities.str,
      abilities.dex,
      abilities.con,
      abilities.intl,
      abilities.wis,
      abilities.cha,
      Date.now(),
    ).lastInsertRowid;

  return { character: getCharacter(db, id) };
}

export function getCharacter(db, id) {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(id) ?? null;
}

export function getCharacterFor(db, campaignId, userId) {
  return (
    db
      .prepare('SELECT * FROM characters WHERE campaign_id = ? AND user_id = ?')
      .get(campaignId, userId) ?? null
  );
}

export function partyFor(db, campaignId) {
  return db
    .prepare('SELECT * FROM characters WHERE campaign_id = ? ORDER BY name')
    .all(campaignId);
}

/** Find a party member by name, case-insensitively, for the DM's tool calls. */
export function findByName(db, campaignId, name) {
  const wanted = String(name ?? '')
    .trim()
    .toLowerCase();
  if (!wanted) return null;

  const party = partyFor(db, campaignId);
  return (
    party.find((character) => character.name.toLowerCase() === wanted) ??
    party.find((character) => character.name.toLowerCase().startsWith(wanted)) ??
    null
  );
}

export function damageCharacter(db, character, amount) {
  const result = applyDamage(
    {
      hpCurrent: character.hp_current,
      hpMax: character.hp_max,
      tempHp: character.temp_hp,
    },
    amount,
  );

  db.prepare('UPDATE characters SET hp_current = ?, temp_hp = ? WHERE id = ?').run(
    result.hpCurrent,
    result.tempHp,
    character.id,
  );

  return result;
}

export function healCharacter(db, character, amount) {
  const result = applyHealing(
    { hpCurrent: character.hp_current, hpMax: character.hp_max },
    amount,
  );

  // Coming back up clears any death saves in progress.
  db.prepare(
    `UPDATE characters SET hp_current = ?,
     death_saves_passed = CASE WHEN ? > 0 THEN 0 ELSE death_saves_passed END,
     death_saves_failed = CASE WHEN ? > 0 THEN 0 ELSE death_saves_failed END
     WHERE id = ?`,
  ).run(result.hpCurrent, result.hpCurrent, result.hpCurrent, character.id);

  return result;
}

export function deathSave(db, character, checkResult) {
  const result = recordDeathSave(
    { passed: character.death_saves_passed, failed: character.death_saves_failed },
    checkResult,
  );

  db.prepare(
    'UPDATE characters SET death_saves_passed = ?, death_saves_failed = ?, hp_current = ? WHERE id = ?',
  ).run(
    result.dead || result.stable ? 0 : result.passed,
    result.dead || result.stable ? 0 : result.failed,
    result.revived ? 1 : character.hp_current,
    character.id,
  );

  return result;
}

export function rest(db, character, kind) {
  if (kind === 'long') {
    const after = longRest(character);
    db.prepare(
      `UPDATE characters SET hp_current = ?, temp_hp = 0,
       death_saves_passed = 0, death_saves_failed = 0, conditions = '' WHERE id = ?`,
    ).run(after.hpCurrent, character.id);
    return {
      hpCurrent: after.hpCurrent,
      healedBy: after.hpCurrent - character.hp_current,
    };
  }

  const after = shortRest(character);
  db.prepare('UPDATE characters SET hp_current = ? WHERE id = ?').run(
    after.hpCurrent,
    character.id,
  );
  return after;
}

/** Award experience, and level up as many times as the total now allows. */
export function awardXp(db, character, amount) {
  const xp = Math.max(0, character.xp + Math.floor(amount));
  const newLevel = clampLevel(levelForXp(xp));

  let hpMax = character.hp_max;
  let hpCurrent = character.hp_current;

  for (let level = character.level; level < newLevel; level++) {
    const gain = hpGainOnLevel(character.class, character.con);
    hpMax += gain;
    hpCurrent += gain;
  }

  db.prepare(
    'UPDATE characters SET xp = ?, level = ?, hp_max = ?, hp_current = ? WHERE id = ?',
  ).run(xp, newLevel, hpMax, hpCurrent, character.id);

  return {
    xp,
    level: newLevel,
    levelledUp: newLevel > character.level,
    levelsGained: newLevel - character.level,
    hpMax,
  };
}

export function addItem(db, characterId, { name, quantity = 1, note = null }) {
  const existing = db
    .prepare(
      'SELECT * FROM character_items WHERE character_id = ? AND lower(name) = lower(?)',
    )
    .get(characterId, name);

  if (existing) {
    db.prepare('UPDATE character_items SET quantity = quantity + ? WHERE id = ?').run(
      quantity,
      existing.id,
    );
    return { ...existing, quantity: existing.quantity + quantity };
  }

  const id = db
    .prepare(
      'INSERT INTO character_items (character_id, name, quantity, note, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(characterId, name, quantity, note, Date.now()).lastInsertRowid;

  return db.prepare('SELECT * FROM character_items WHERE id = ?').get(id);
}

export function removeItem(db, characterId, name, quantity = 1) {
  const existing = db
    .prepare(
      'SELECT * FROM character_items WHERE character_id = ? AND lower(name) = lower(?)',
    )
    .get(characterId, name);
  if (!existing) return { error: 'They do not have that.' };

  if (existing.quantity <= quantity) {
    db.prepare('DELETE FROM character_items WHERE id = ?').run(existing.id);
    return { removed: existing.quantity, gone: true };
  }

  db.prepare('UPDATE character_items SET quantity = quantity - ? WHERE id = ?').run(
    quantity,
    existing.id,
  );
  return { removed: quantity, gone: false };
}

export function inventory(db, characterId) {
  return db
    .prepare('SELECT * FROM character_items WHERE character_id = ? ORDER BY name')
    .all(characterId);
}

export function setConditions(db, characterId, conditions) {
  db.prepare('UPDATE characters SET conditions = ? WHERE id = ?').run(
    conditions.join(','),
    characterId,
  );
}

export function modifiersFor(character) {
  const out = {};
  for (const ability of ABILITIES) out[ability] = abilityModifier(character[ability]);
  return out;
}

export function isProficientIn(character, ability) {
  return (CLASSES[character.class]?.saves ?? []).includes(ability);
}

/** One compact line per character, for the DM prompt. Tokens are scarce. */
export function characterLine(character, items = []) {
  const definition = CLASSES[character.class];
  const state =
    character.hp_current === 0
      ? 'DOWN'
      : character.hp_current <= character.hp_max / 4
        ? 'badly hurt'
        : character.hp_current < character.hp_max
          ? 'hurt'
          : 'unhurt';

  const carried = items.length
    ? ` carrying ${items.map((item) => (item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name)).join(', ')}`
    : '';

  const conditions = character.conditions ? ` [${character.conditions}]` : '';

  return `${character.name}, level ${character.level} ${definition?.label ?? character.class} (${character.ancestry}), ${character.hp_current}/${character.hp_max} hp, ${state}, AC ${character.ac}${conditions}${carried}`;
}

export function proficiencyFor(character) {
  return proficiencyBonus(character.level);
}
