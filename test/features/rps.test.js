import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICES,
  RULES,
  choiceOptions,
  formatResult,
  getResult,
  shuffle,
} from '../../src/features/rps.js';

test('there are seven choices, each beating three others', () => {
  assert.equal(CHOICES.length, 7);
  for (const choice of CHOICES) {
    assert.equal(Object.keys(RULES[choice]).length, 3, `${choice} should beat 3`);
  }
});

test('all 49 pairs resolve, and only identical choices tie', () => {
  let p1Wins = 0;
  let ties = 0;
  for (const a of CHOICES) {
    for (const b of CHOICES) {
      const { outcome } = getResult(a, b);
      assert.ok(['p1', 'p2', 'tie'].includes(outcome));
      if (outcome === 'tie') {
        assert.equal(a, b, `${a} vs ${b} tied but they differ`);
        ties++;
      }
      if (outcome === 'p1') p1Wins++;
    }
  }
  assert.equal(ties, 7);
  assert.equal(p1Wins, 21);
});

test('if A beats B then B loses to A', () => {
  for (const a of CHOICES) {
    for (const b of CHOICES) {
      if (a === b) continue;
      const forward = getResult(a, b);
      const reverse = getResult(b, a);
      assert.equal(
        forward.outcome === 'p1' ? 'p2' : 'p1',
        reverse.outcome,
        `${a} vs ${b} is not symmetric`,
      );
      assert.equal(forward.verb, reverse.verb);
    }
  }
});

test('an unknown choice is rejected rather than silently tying', () => {
  assert.throws(() => getResult('rock', 'banana'), /unknown choice: banana/);
  assert.throws(() => getResult('banana', 'rock'), /unknown choice: banana/);
});

test('formatResult names the winner, or says draw', () => {
  const p1 = { id: '1', choice: 'rock' };
  const p2 = { id: '2', choice: 'scissors' };
  assert.equal(
    formatResult(getResult('rock', 'scissors'), p1, p2),
    "<@1>'s **rock** crushes <@2>'s **scissors**",
  );

  const loser = { id: '1', choice: 'scissors' };
  const winner = { id: '2', choice: 'rock' };
  assert.equal(
    formatResult(getResult('scissors', 'rock'), loser, winner),
    "<@2>'s **rock** crushes <@1>'s **scissors**",
  );

  assert.match(
    formatResult(getResult('rock', 'rock'), p1, { id: '2', choice: 'rock' }),
    /Draw\.$/,
  );
});

test('shuffle keeps every item and does not mutate the input', () => {
  const input = [...CHOICES];
  const out = shuffle(input, () => 0.5);
  assert.deepEqual([...out].sort(), [...CHOICES].sort());
  assert.deepEqual(input, CHOICES);
});

test('shuffle reaches the last position (the biased sort rarely did)', () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    let i = 0;
    const out = shuffle(CHOICES, () => ((seed * 7 + i++ * 13) % 100) / 100);
    seen.add(out[0]);
  }
  assert.ok(seen.size > 1, 'first position should vary');
});

test('choiceOptions returns all seven with labels and descriptions', () => {
  const options = choiceOptions(() => 0);
  assert.equal(options.length, 7);
  for (const option of options) {
    assert.ok(CHOICES.includes(option.value));
    assert.equal(option.label, option.value[0].toUpperCase() + option.value.slice(1));
    assert.ok(option.description.length > 0);
    assert.ok(option.description.length <= 100, 'Discord caps descriptions at 100');
  }
});
