import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCORD_LIMIT, splitMessage } from '../../src/util/splitMessage.js';

test('short text is one chunk, empty text is none', () => {
  assert.deepEqual(splitMessage('hello'), ['hello']);
  assert.deepEqual(splitMessage(''), []);
  assert.deepEqual(splitMessage('   '), []);
  assert.deepEqual(splitMessage(null), []);
});

test('every chunk is within the Discord limit', () => {
  const text = 'word '.repeat(2000);
  for (const chunk of splitMessage(text)) {
    assert.ok(chunk.length <= DISCORD_LIMIT, `${chunk.length} is too long`);
  }
});

test('nothing is lost in the split', () => {
  const text = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
  const joined = splitMessage(text, 200).join('\n');
  assert.equal(joined.replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});

test('it prefers to break at a paragraph, then a line, then a space', () => {
  const paragraphs = `${'a'.repeat(90)}\n\n${'b'.repeat(90)}`;
  assert.deepEqual(splitMessage(paragraphs, 100), ['a'.repeat(90), 'b'.repeat(90)]);

  const lines = `${'a'.repeat(90)}\n${'b'.repeat(90)}`;
  assert.deepEqual(splitMessage(lines, 100), ['a'.repeat(90), 'b'.repeat(90)]);

  const words = `${'a'.repeat(90)} ${'b'.repeat(90)}`;
  assert.deepEqual(splitMessage(words, 100), ['a'.repeat(90), 'b'.repeat(90)]);
});

test('an unbroken run longer than the limit is cut anyway', () => {
  const chunks = splitMessage('x'.repeat(250), 100);
  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [100, 100, 50],
  );
});
