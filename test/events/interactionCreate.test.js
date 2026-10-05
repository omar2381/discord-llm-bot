import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageFlags } from 'discord.js';
import { ERROR_MESSAGE, GONE_MESSAGE, execute } from '../../src/events/interactionCreate.js';
import { Cooldowns } from '../../src/util/cooldown.js';
import { fakeInteraction, fakeLogger } from '../fakes.js';

function makeCtx({ commands = {}, components = {} } = {}) {
  return {
    logger: fakeLogger(),
    commands: new Map(Object.entries(commands)),
    components: new Map(Object.entries(components)),
    cooldowns: new Cooldowns(),
  };
}

test('routes a slash command to its handler with ctx', async () => {
  let received;
  const ctx = makeCtx({ commands: { hello: { execute: (i, c) => (received = [i, c]) } } });
  const interaction = fakeInteraction('command', { name: 'hello' });
  await execute(interaction, ctx);
  assert.deepEqual(received, [interaction, ctx]);
});

test('routes buttons by the customId prefix', async () => {
  let args;
  const ctx = makeCtx({ components: { rps: { execute: (i) => (args = i.customId) } } });
  await execute(fakeInteraction('button', { customId: 'rps:accept:123' }), ctx);
  assert.equal(args, 'rps:accept:123');
});

test('unknown commands and components still get an ephemeral reply', async () => {
  const ctx = makeCtx();
  for (const interaction of [
    fakeInteraction('command', { name: 'gone' }),
    fakeInteraction('button', { customId: 'old:1' }),
  ]) {
    await execute(interaction, ctx);
    assert.equal(interaction.sent.length, 1);
    assert.equal(interaction.sent[0].payload.content, GONE_MESSAGE);
    assert.equal(interaction.sent[0].payload.flags, MessageFlags.Ephemeral);
  }
});

test('a throwing handler gets a reply, or a followUp if it already replied', async () => {
  const ctx = makeCtx({
    commands: {
      early: {
        execute: () => {
          throw new Error('boom');
        },
      },
      late: {
        execute: async (i) => {
          await i.reply('partial');
          throw new Error('boom');
        },
      },
    },
  });

  const early = fakeInteraction('command', { name: 'early' });
  await execute(early, ctx);
  assert.deepEqual(
    early.sent.map((s) => [s.method, s.payload.content]),
    [['reply', ERROR_MESSAGE]],
  );

  const late = fakeInteraction('command', { name: 'late' });
  await execute(late, ctx);
  assert.deepEqual(
    late.sent.map((s) => s.method),
    ['reply', 'followUp'],
  );
  assert.equal(late.sent[1].payload.content, ERROR_MESSAGE);
  assert.ok(ctx.logger.calls.some((c) => c.level === 'error'));
});

test('enforces cooldownSeconds per user', async () => {
  let runs = 0;
  const ctx = makeCtx({ commands: { slow: { cooldownSeconds: 60, execute: () => runs++ } } });
  await execute(fakeInteraction('command', { name: 'slow' }), ctx);
  const second = fakeInteraction('command', { name: 'slow' });
  await execute(second, ctx);
  await execute(fakeInteraction('command', { name: 'slow', userId: 'u2' }), ctx);
  assert.equal(runs, 2);
  assert.match(second.sent[0].payload.content, /Try again in \d+s/);
});

test('autocomplete without a handler responds with no choices', async () => {
  const interaction = fakeInteraction('autocomplete', { name: 'anything' });
  await execute(interaction, makeCtx());
  assert.deepEqual(interaction.sent, [{ method: 'respond', payload: [] }]);
});
