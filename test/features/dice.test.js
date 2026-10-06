import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DICE,
  MAX_SIDES,
  formatRoll,
  parseDice,
  roll,
} from '../../src/features/dice.js';

test('valid notation parses', () => {
  assert.deepEqual(parseDice('d6'), { count: 1, sides: 6, modifier: 0 });
  assert.deepEqual(parseDice('2d6'), { count: 2, sides: 6, modifier: 0 });
  assert.deepEqual(parseDice('2d6+1'), { count: 2, sides: 6, modifier: 1 });
  assert.deepEqual(parseDice('4d8-2'), { count: 4, sides: 8, modifier: -2 });
  assert.deepEqual(parseDice(' 3D10 '), { count: 3, sides: 10, modifier: 0 });
});

test('nonsense is rejected', () => {
  for (const input of ['', 'd', '6', 'dd6', '2d', 'two d6', '2d6+', '2d6++1', '-2d6']) {
    assert.equal(parseDice(input), null, `${input} should not parse`);
  }
});

test('caps are enforced', () => {
  assert.ok(parseDice(`${MAX_DICE}d6`));
  assert.equal(parseDice(`${MAX_DICE + 1}d6`), null);
  assert.ok(parseDice(`d${MAX_SIDES}`));
  assert.equal(parseDice(`d${MAX_SIDES + 1}`), null);
  assert.equal(parseDice('0d6'), null);
  assert.equal(parseDice('d1'), null);
});

test('rolls stay in range and the modifier is applied once', () => {
  const spec = parseDice('5d6+3');
  for (let i = 0; i < 100; i++) {
    const { rolls, total } = roll(spec);
    assert.equal(rolls.length, 5);
    for (const value of rolls) {
      assert.ok(value >= 1 && value <= 6, `${value} out of range`);
    }
    assert.equal(total, rolls.reduce((a, b) => a + b, 0) + 3);
  }
});

test('the extremes of the random range map to 1 and the number of sides', () => {
  assert.deepEqual(roll(parseDice('1d20'), () => 0).rolls, [1]);
  assert.deepEqual(roll(parseDice('1d20'), () => 0.999999).rolls, [20]);
});

test('formatting shows the notation, and the dice when there is more than one', () => {
  assert.equal(
    formatRoll(parseDice('1d6'), { rolls: [4], modifier: 0, total: 4 }),
    '**4** (1d6)',
  );
  assert.equal(
    formatRoll(parseDice('2d6+1'), { rolls: [4, 2], modifier: 1, total: 7 }),
    '**7** (2d6+1: 4, 2 +1)',
  );
});
