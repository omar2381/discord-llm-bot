import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WELCOME,
  chunkButtons,
  renderWelcome,
} from '../../src/features/welcome.js';

const member = {
  userId: '42',
  username: 'omar',
  serverName: 'The Server',
  memberCount: 101,
};

test('every placeholder is filled', () => {
  assert.equal(
    renderWelcome('{user} {username} {server} {memberCount}', member),
    '<@42> omar The Server 101',
  );
});

test('a placeholder used twice is filled twice', () => {
  assert.equal(renderWelcome('{user} {user}', member), '<@42> <@42>');
});

test('an unknown placeholder is left visible rather than blanked', () => {
  assert.equal(renderWelcome('hi {nickname}', member), 'hi {nickname}');
});

test('a missing template falls back to the default', () => {
  assert.equal(renderWelcome(null, member), renderWelcome(DEFAULT_WELCOME, member));
  assert.match(renderWelcome(undefined, member), /<@42>/);
});

test('text with no placeholders is untouched', () => {
  assert.equal(renderWelcome('welcome!', member), 'welcome!');
});

test('buttons are chunked five to a row', () => {
  assert.deepEqual(chunkButtons([1, 2, 3]), [[1, 2, 3]]);
  assert.deepEqual(chunkButtons([1, 2, 3, 4, 5]), [[1, 2, 3, 4, 5]]);
  assert.deepEqual(chunkButtons([1, 2, 3, 4, 5, 6]), [[1, 2, 3, 4, 5], [6]]);
  assert.deepEqual(chunkButtons([]), []);
});

test('25 roles fit in five rows, which is Discord’s limit', () => {
  const rows = chunkButtons(Array.from({ length: 25 }, (_, i) => i));
  assert.equal(rows.length, 5);
  for (const row of rows) assert.equal(row.length, 5);
});
