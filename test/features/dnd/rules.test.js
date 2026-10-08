import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITIES,
  CLASSES,
  CLASS_KEYS,
  MAX_LEVEL,
  STANDARD_ARRAY,
  abilityModifier,
  applyDamage,
  applyHealing,
  describeCheck,
  levelForXp,
  proficiencyBonus,
  recordDeathSave,
  resolveCheck,
  shortRest,
  startingHp,
  suggestedAbilities,
  xpToNextLevel,
} from '../../../src/features/dnd/rules.js';

const d20 = (value) => () => value;

test('ability modifiers follow the table', () => {
  assert.equal(abilityModifier(1), -5);
  assert.equal(abilityModifier(8), -1);
  assert.equal(abilityModifier(10), 0);
  assert.equal(abilityModifier(11), 0);
  assert.equal(abilityModifier(14), 2);
  assert.equal(abilityModifier(20), 5);
});

test('proficiency steps at the right levels', () => {
  assert.equal(proficiencyBonus(1), 2);
  assert.equal(proficiencyBonus(4), 2);
  assert.equal(proficiencyBonus(5), 3);
  assert.equal(proficiencyBonus(20), 6);
  assert.equal(proficiencyBonus(0), 2, 'nonsense levels are clamped');
});

test('every class gives the standard array and puts its best score first', () => {
  for (const key of CLASS_KEYS) {
    const abilities = suggestedAbilities(key);
    assert.deepEqual(
      Object.values(abilities).sort((a, b) => b - a),
      [...STANDARD_ARRAY],
      `${key} should use the standard array`,
    );
    assert.equal(abilities[CLASSES[key].primary], 15, `${key} primary should be highest`);
    assert.equal(Object.keys(abilities).length, ABILITIES.length);
  }
});

test('an unknown class is refused rather than producing a broken character', () => {
  assert.throws(() => suggestedAbilities('bard-but-spelled-wrong'), /unknown class/);
  assert.throws(() => startingHp('nope', 10), /unknown class/);
});

test('starting hit points are the hit die plus Constitution, never below 1', () => {
  assert.equal(startingHp('fighter', 14), 12);
  assert.equal(startingHp('wizard', 10), 6);
  assert.equal(startingHp('wizard', 1), 1, 'a terrible Constitution still leaves 1');
});

test('experience maps to the expected levels', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
  assert.equal(levelForXp(900), 3);
  assert.equal(levelForXp(999999), MAX_LEVEL);
  assert.equal(xpToNextLevel(0), 300);
  assert.equal(xpToNextLevel(999999), null, 'nothing left at maximum level');
});

test('a check adds the modifier and compares with the difficulty', () => {
  const pass = resolveCheck({ roll20: d20(12), modifier: 3, dc: 15 });
  assert.equal(pass.total, 15);
  assert.equal(pass.success, true, '15 meets DC 15');

  const fail = resolveCheck({ roll20: d20(11), modifier: 3, dc: 15 });
  assert.equal(fail.success, false);
});

test('proficiency is added only when it applies', () => {
  const without = resolveCheck({ roll20: d20(10), modifier: 1, proficiency: 3, dc: 10 });
  const with_ = resolveCheck({
    roll20: d20(10),
    modifier: 1,
    proficient: true,
    proficiency: 3,
    dc: 10,
  });
  assert.equal(without.total, 11);
  assert.equal(with_.total, 14);
});

test('a natural 20 always succeeds and a natural 1 always fails', () => {
  const impossible = resolveCheck({ roll20: d20(20), modifier: -5, dc: 30 });
  assert.equal(impossible.success, true);
  assert.equal(impossible.criticalSuccess, true);

  const trivial = resolveCheck({ roll20: d20(1), modifier: 20, dc: 2 });
  assert.equal(trivial.success, false);
  assert.equal(trivial.criticalFailure, true);
});

test('advantage takes the better die and disadvantage the worse', () => {
  const rolls = [5, 18];
  let i = 0;
  const next = () => rolls[i++];

  i = 0;
  assert.equal(resolveCheck({ roll20: next, advantage: 'advantage' }).natural, 18);
  i = 0;
  assert.equal(resolveCheck({ roll20: next, advantage: 'disadvantage' }).natural, 5);
  i = 0;
  const plain = resolveCheck({ roll20: next, advantage: 'none' });
  assert.equal(plain.dice.length, 1, 'only one die without advantage');
});

test('a check with no difficulty reports a total and no verdict', () => {
  const result = resolveCheck({ roll20: d20(10), modifier: 2 });
  assert.equal(result.success, null);
  assert.match(describeCheck(result, 'Thorn Strength'), /Thorn Strength: \*\*12\*\*/);
});

test('the description names the outcome', () => {
  assert.match(
    describeCheck(resolveCheck({ roll20: d20(20), dc: 10 }), 'x'),
    /critical success/,
  );
  assert.match(
    describeCheck(resolveCheck({ roll20: d20(1), dc: 10 }), 'x'),
    /critical failure/,
  );
  assert.match(
    describeCheck(resolveCheck({ roll20: d20(15), modifier: 0, dc: 10 }), 'x'),
    /vs DC 10 - success/,
  );
});

test('damage goes through temporary hit points first', () => {
  const result = applyDamage({ hpCurrent: 20, hpMax: 20, tempHp: 5 }, 8);
  assert.equal(result.tempHp, 0);
  assert.equal(result.hpCurrent, 17);
});

test('dropping to zero knocks a character down rather than killing them', () => {
  const result = applyDamage({ hpCurrent: 4, hpMax: 20, tempHp: 0 }, 9);
  assert.equal(result.hpCurrent, 0);
  assert.equal(result.downed, true);
  assert.equal(result.instantDeath, false);
});

test('damage far beyond the maximum is lethal outright', () => {
  const result = applyDamage({ hpCurrent: 4, hpMax: 20, tempHp: 0 }, 30);
  assert.equal(result.instantDeath, true);
});

test('healing stops at the maximum and brings someone back up', () => {
  assert.equal(applyHealing({ hpCurrent: 18, hpMax: 20 }, 10).hpCurrent, 20);

  const revived = applyHealing({ hpCurrent: 0, hpMax: 20 }, 1);
  assert.equal(revived.revived, true);
  assert.equal(revived.hpCurrent, 1);
});

test('three death saves either way settle it', () => {
  const start = { passed: 0, failed: 0 };
  const pass = resolveCheck({ roll20: d20(15), dc: 10 });
  const fail = resolveCheck({ roll20: d20(5), dc: 10 });

  let state = recordDeathSave(start, pass);
  state = recordDeathSave(state, pass);
  state = recordDeathSave(state, pass);
  assert.equal(state.stable, true);

  let dying = recordDeathSave(start, fail);
  dying = recordDeathSave(dying, fail);
  dying = recordDeathSave(dying, fail);
  assert.equal(dying.dead, true);
});

test('a natural 20 on a death save puts you straight back up', () => {
  const result = recordDeathSave(
    { passed: 0, failed: 2 },
    resolveCheck({ roll20: d20(20), dc: 10 }),
  );
  assert.equal(result.revived, true);
});

test('a short rest gives back about a quarter, never overhealing', () => {
  assert.equal(shortRest({ hp_current: 2, hp_max: 20 }).hpCurrent, 7);
  assert.equal(shortRest({ hp_current: 19, hp_max: 20 }).hpCurrent, 20);
});
