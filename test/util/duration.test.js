import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, parseDuration } from '../../src/util/duration.js';

test('single units parse', () => {
  assert.equal(parseDuration('30s'), 30_000);
  assert.equal(parseDuration('10m'), 600_000);
  assert.equal(parseDuration('2h'), 7_200_000);
  assert.equal(parseDuration('1d'), 86_400_000);
});

test('units combine, in any case, with or without spaces', () => {
  assert.equal(parseDuration('2h30m'), 9_000_000);
  assert.equal(parseDuration('1d 2h 3m 4s'), 93_784_000);
  assert.equal(parseDuration('2H30M'), 9_000_000);
});

test('junk is rejected rather than partly parsed', () => {
  for (const input of [
    '',
    'soon',
    '10',
    'm',
    '10x',
    '10m please',
    'tomorrow at 5',
    '0s',
  ]) {
    assert.equal(parseDuration(input), null, `${input} should not parse`);
  }
});

test('formatDuration is readable and drops empty units', () => {
  assert.equal(formatDuration(30_000), '30s');
  assert.equal(formatDuration(9_000_000), '2h 30m');
  assert.equal(formatDuration(86_400_000), '1d');
  assert.equal(formatDuration(93_784_000), '1d 2h 3m 4s');
  assert.equal(formatDuration(500), '0s');
});

test('parse and format round-trip', () => {
  for (const text of ['45s', '10m', '2h 30m', '1d 2h']) {
    assert.equal(formatDuration(parseDuration(text)), text);
  }
});
