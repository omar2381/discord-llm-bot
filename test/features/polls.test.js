import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ANSWER_LENGTH,
  MAX_OPTIONS,
  buildPoll,
  parsePollOptions,
} from '../../src/features/polls.js';

test('options split on the pipe and are trimmed', () => {
  assert.deepEqual(parsePollOptions('yes | no').options, ['yes', 'no']);
  assert.deepEqual(parsePollOptions(' a |b |  c ').options, ['a', 'b', 'c']);
});

test('empty segments are dropped rather than becoming blank answers', () => {
  assert.deepEqual(parsePollOptions('a || b |').options, ['a', 'b']);
});

test('too few, too many and duplicate options are refused', () => {
  assert.match(parsePollOptions('only one').error, /at least 2/);
  assert.match(
    parsePollOptions(Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => i).join('|'))
      .error,
    /at most 10/,
  );
  assert.match(parsePollOptions('yes | YES').error, /appears twice/);
});

test('an over-long answer is named in the error', () => {
  const long = 'x'.repeat(MAX_ANSWER_LENGTH + 1);
  assert.match(parsePollOptions(`${long} | fine`).error, /too long/);
});

test('buildPoll produces the shape discord.js expects', () => {
  const poll = buildPoll({
    question: 'Pizza?',
    options: ['yes', 'no'],
    hours: 24,
    multi: true,
  });
  assert.deepEqual(poll, {
    question: { text: 'Pizza?' },
    answers: [{ text: 'yes' }, { text: 'no' }],
    duration: 24,
    allowMultiselect: true,
  });
});
