import assert from 'node:assert/strict';
import { test } from 'node:test';
import { data, execute } from '../../src/commands/utility/ping.js';
import { fakeInteraction } from '../fakes.js';

test('/ping replies, then edits in the latency', async () => {
  assert.equal(data.name, 'ping');
  const interaction = fakeInteraction('command', { name: 'ping' });
  await execute(interaction, { client: { ws: { ping: 42 } } });
  assert.equal(interaction.sent[0].method, 'reply');
  assert.equal(interaction.sent[1].method, 'editReply');
  assert.match(interaction.sent[1].payload, /Round trip: \*\*\d+ ms\*\* · Gateway: \*\*42 ms\*\*/);
});

test('/ping copes with no gateway ping yet', async () => {
  const interaction = fakeInteraction('command', { name: 'ping' });
  await execute(interaction, { client: { ws: { ping: -1 } } });
  assert.match(interaction.sent[1].payload, /Gateway: \*\*n\/a\*\*/);
});
