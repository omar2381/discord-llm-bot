import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Cooldowns } from '../../src/util/cooldown.js';

test('blocks repeat use until the cooldown expires', () => {
  let now = 1_000;
  const cooldowns = new Cooldowns({ now: () => now });

  assert.equal(cooldowns.hit('/ping', 'u1', 3), 0);
  now += 1_000;
  assert.equal(cooldowns.hit('/ping', 'u1', 3), 2_000);
  assert.equal(cooldowns.hit('/ping', 'u2', 3), 0, 'other users are independent');
  assert.equal(cooldowns.hit('/roll', 'u1', 3), 0, 'other commands are independent');
  now += 2_000;
  assert.equal(cooldowns.hit('/ping', 'u1', 3), 0);
});

test('no cooldown when seconds is missing or zero', () => {
  const cooldowns = new Cooldowns();
  assert.equal(cooldowns.hit('/x', 'u', undefined), 0);
  assert.equal(cooldowns.hit('/x', 'u', undefined), 0);
  assert.equal(cooldowns.hit('/x', 'u', 0), 0);
});
