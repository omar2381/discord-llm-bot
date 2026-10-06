import test from 'node:test';
import assert from 'node:assert/strict';
import { SpamTracker, findBannedWord, normalise } from '../../src/features/automod.js';

test('whole words match, substrings do not', () => {
  const words = ['ass', 'spam'];
  assert.equal(findBannedWord('you ass', words), 'ass');
  assert.equal(findBannedWord('ASS!', words), 'ass');
  assert.equal(findBannedWord('(ass)', words), 'ass');

  for (const safe of ['class', 'passing', 'assassin', 'Scunthorpe', 'spammer']) {
    assert.equal(findBannedWord(safe, words), null, `${safe} should be allowed`);
  }
});

test('zero-width characters and stretched letters do not hide a word', () => {
  assert.equal(findBannedWord('s​pam', ['spam']), 'spam');
  assert.equal(findBannedWord('spaaaaam', ['spam']), 'spam');
  assert.equal(findBannedWord('SPAAAM', ['spam']), 'spam');
});

test('a clean message and an empty list return null', () => {
  assert.equal(findBannedWord('hello there', ['spam']), null);
  assert.equal(findBannedWord('anything', []), null);
  assert.equal(findBannedWord('anything', ['', '  ']), null);
});

test('regex characters in a banned word are escaped, not interpreted', () => {
  assert.equal(findBannedWord('literally a.b here', ['a.b']), 'a.b');
  assert.equal(
    findBannedWord('axb', ['a.b']),
    null,
    'the dot must not match any character',
  );
});

test('normalise collapses every run to a single character', () => {
  assert.equal(normalise('Hellooooo'), 'helo');
  assert.equal(normalise('book'), 'bok');
  // Both sides are normalised, so a doubled letter in the banned word is fine.
  assert.equal(findBannedWord('that book', ['book']), 'book');
});

test('a burst of messages is caught, slow messages are not', () => {
  let now = 0;
  const tracker = new SpamTracker({ now: () => now, burstCount: 5, burstMs: 5000 });

  for (let i = 0; i < 5; i++) {
    now += 100;
    assert.equal(tracker.check('u1', `message ${i}`), null);
  }
  now += 100;
  assert.equal(tracker.check('u1', 'one too many'), 'burst');

  // The same messages spread out are fine.
  const slow = new SpamTracker({ now: () => now, burstCount: 5, burstMs: 5000 });
  for (let i = 0; i < 10; i++) {
    now += 6000;
    assert.equal(slow.check('u2', `message ${i}`), null);
  }
});

test('the same message three times is caught even when slow', () => {
  let now = 0;
  const tracker = new SpamTracker({ now: () => now, repeatCount: 3, repeatMs: 10000 });

  assert.equal(tracker.check('u1', 'buy my thing'), null);
  now += 3000;
  assert.equal(tracker.check('u1', 'buy my thing'), null);
  now += 3000;
  assert.equal(tracker.check('u1', 'BUY MY THING'), 'repeat', 'case should not matter');
});

test('users are tracked separately', () => {
  let now = 0;
  const tracker = new SpamTracker({ now: () => now, burstCount: 2, burstMs: 5000 });

  assert.equal(tracker.check('a', 'x'), null);
  assert.equal(tracker.check('a', 'y'), null);
  assert.equal(tracker.check('b', 'x'), null, 'b is unaffected by a');
  assert.equal(tracker.check('a', 'z'), 'burst');
});

test('old history stops counting once the window passes', () => {
  let now = 0;
  const tracker = new SpamTracker({ now: () => now, burstCount: 3, burstMs: 5000 });

  for (let i = 0; i < 3; i++) assert.equal(tracker.check('u1', `m${i}`), null);
  now += 60_000;
  assert.equal(tracker.check('u1', 'much later'), null, 'the window has moved on');
});
