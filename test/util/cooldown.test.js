import test from 'node:test';
import assert from 'node:assert/strict';
import { Cooldown } from '../../src/util/cooldown.js';

test('the first call passes and the next is held for the full wait', () => {
  let now = 0;
  const cooldown = new Cooldown(5, () => now);

  assert.equal(cooldown.check('user'), 0);
  assert.equal(cooldown.check('user'), 5);

  now = 2000;
  assert.equal(cooldown.check('user'), 3);

  now = 5000;
  assert.equal(cooldown.check('user'), 0, 'allowed again once the window passes');
});

test('keys are independent, and clear releases one', () => {
  let now = 0;
  const cooldown = new Cooldown(10, () => now);

  assert.equal(cooldown.check('a'), 0);
  assert.equal(cooldown.check('b'), 0, 'b is not affected by a');
  assert.equal(cooldown.check('a'), 10);

  cooldown.clear('a');
  assert.equal(cooldown.check('a'), 0);
});
