import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingActions } from '../../src/ai/pending.js';

const item = {
  requesterId: 'u1',
  toolName: 'timeout_member',
  args: {},
  description: 'd',
};

test('the person who asked can claim it, once', () => {
  const pending = new PendingActions();
  const id = pending.add(item);

  assert.equal(pending.claim(id, 'u1').action.toolName, 'timeout_member');
  assert.equal(pending.claim(id, 'u1').error, 'expired', 'it is gone after one use');
});

test('nobody else can claim it, and it survives their attempt', () => {
  const pending = new PendingActions();
  const id = pending.add(item);

  assert.equal(pending.claim(id, 'someone-else').error, 'not_yours');
  assert.equal(
    pending.claim(id, 'u1').action.description,
    'd',
    'still there for the asker',
  );
});

test('it expires', () => {
  let now = 0;
  const pending = new PendingActions({ now: () => now, ttlMs: 1000 });
  const id = pending.add(item);

  now = 1001;
  assert.equal(pending.claim(id, 'u1').error, 'expired');
  assert.equal(pending.size, 0, 'and is cleaned up');
});

test('cancelling removes it without running anything', () => {
  const pending = new PendingActions();
  const id = pending.add(item);

  assert.equal(pending.cancel(id, 'someone-else').error, 'not_yours');
  assert.equal(pending.cancel(id, 'u1').action.toolName, 'timeout_member');
  assert.equal(pending.size, 0);
});

test('sweeping drops only what has expired', () => {
  let now = 0;
  const pending = new PendingActions({ now: () => now, ttlMs: 1000 });
  pending.add(item);
  now = 600;
  pending.add(item);

  now = 1200;
  pending.sweep();
  assert.equal(pending.size, 1);
});

test('an unknown id is simply expired', () => {
  assert.equal(new PendingActions().claim('nope', 'u1').error, 'expired');
});
