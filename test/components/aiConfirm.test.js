import test from 'node:test';
import assert from 'node:assert/strict';
import { afterAnswer } from '../../src/components/aiConfirm.js';

const row = (id, n) => ({
  components: [
    { customId: `aiconfirm:yes:${id}`, label: `Confirm ${n}` },
    { customId: `aiconfirm:no:${id}`, label: `Cancel ${n}` },
  ],
});

test('answering one action keeps the buttons of the others', () => {
  const message = {
    content: 'Two things need confirming.',
    components: [row('a', 1), row('b', 2)],
  };
  const next = afterAnswer(message, 'a', 'Done: give **VIP** to <@1>.');
  assert.equal(next.components.length, 1);
  assert.equal(next.components[0].components[0].customId, 'aiconfirm:yes:b');
  assert.equal(
    next.content,
    'Two things need confirming.\n\nDone: give **VIP** to <@1>.',
  );
});

test('the last answer leaves no buttons', () => {
  const next = afterAnswer(
    { content: 'x', components: [row('b', 2)] },
    'b',
    'Cancelled: y.',
  );
  assert.deepEqual(next.components, []);
});

test('an id that is a suffix of another does not remove the wrong row', () => {
  const next = afterAnswer(
    { content: '', components: [row('1', 1), row('11', 2)] },
    '1',
    'Done.',
  );
  assert.deepEqual(
    next.components.map((r) => r.components[0].customId),
    ['aiconfirm:yes:11'],
  );
  assert.equal(next.content, 'Done.');
});

test('a message near the length limit keeps only the status', () => {
  const next = afterAnswer(
    { content: 'x'.repeat(1995), components: [] },
    'a',
    'Done: something.',
  );
  assert.equal(next.content, 'Done: something.');
});
