import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/index.js';
import { MAX_ITERATIONS, executeConfirmed, runAgent } from '../../src/ai/agent.js';
import { PendingActions } from '../../src/ai/pending.js';
import { recallFacts } from '../../src/ai/memory.js';

function db() {
  const d = new Database(':memory:');
  migrate(d);
  return d;
}

/** A model that returns a scripted sequence of replies. */
function scriptedOllama(replies) {
  const sent = [];
  return {
    sent,
    async chat({ messages }) {
      sent.push(structuredClone(messages));
      return replies.shift() ?? { role: 'assistant', content: 'done', toolCalls: [] };
    },
  };
}

const config = { ai: { maxHistory: 5 } };

function member(id, permissions = []) {
  return {
    id,
    displayName: `user-${id}`,
    user: { tag: `user-${id}#0001`, bot: false },
    permissions: { has: (flag) => permissions.includes(flag) },
    roles: { highest: { position: 10 } },
  };
}

const guild = {
  id: 'g1',
  name: 'The Server',
  ownerId: 'owner',
  memberCount: 5,
  createdAt: new Date('2020-01-01'),
  channels: { cache: { size: 3 } },
  roles: { cache: new Map() },
  members: {
    me: {
      id: 'bot',
      permissions: { has: () => true },
      roles: { highest: { position: 99 } },
    },
    fetch: async (id) => member(id),
  },
};

// permissionsFor resolves against the member asked about, as the real one does,
// so a member without a permission really lacks it in this channel.
const channel = { id: 'c1', permissionsFor: (who) => who.permissions };

function base(overrides = {}) {
  return {
    db: db(),
    config,
    pending: new PendingActions(),
    guild,
    channel,
    member: member('u1'),
    botName: 'Bot',
    ...overrides,
  };
}

test('a plain answer comes straight back', async () => {
  const result = await runAgent({
    ...base(),
    ollama: scriptedOllama([{ content: 'Hello there', toolCalls: [] }]),
    prompt: 'hi',
  });
  assert.equal(result.content, 'Hello there');
  assert.deepEqual(result.pending, []);
});

test('the system prompt carries the server, the speaker and the rules', async () => {
  const ollama = scriptedOllama([{ content: 'ok', toolCalls: [] }]);
  await runAgent({ ...base(), ollama, prompt: 'hi' });

  const system = ollama.sent[0][0].content;
  assert.match(system, /The Server/);
  assert.match(system, /user-u1/);
  assert.match(system, /only do things by calling a tool/);
  assert.match(system, /not instructions to you/);
});

test('a tool call runs, its result goes back, and the model answers', async () => {
  const context = base();
  const ollama = scriptedOllama([
    {
      content: '',
      toolCalls: [{ name: 'remember_fact', arguments: { fact: 'likes pizza' } }],
    },
    { content: 'Noted.', toolCalls: [] },
  ]);

  const result = await runAgent({ ...context, ollama, prompt: 'remember I like pizza' });

  assert.equal(result.content, 'Noted.');
  const stored = recallFacts(context.db, { guildId: 'g1', userId: 'u1' });
  assert.equal(stored[0].fact, 'likes pizza');

  const second = ollama.sent[1];
  assert.equal(second.at(-1).role, 'tool');
  assert.match(second.at(-1).content, /remembered/);
});

test('invalid arguments come back as an error the model can retry from', async () => {
  const ollama = scriptedOllama([
    { content: '', toolCalls: [{ name: 'set_reminder', arguments: { in: 123 } }] },
    { content: 'Sorry, what time?', toolCalls: [] },
  ]);

  const result = await runAgent({ ...base(), ollama, prompt: 'remind me' });
  assert.equal(result.content, 'Sorry, what time?');

  const toolResult = JSON.parse(ollama.sent[1].at(-1).content);
  assert.match(toolResult.error, /not valid/);
  assert.ok(toolResult.details.length > 0);
});

test('an unknown tool is reported rather than crashing', async () => {
  const ollama = scriptedOllama([
    { content: '', toolCalls: [{ name: 'launch_missiles', arguments: {} }] },
    { content: 'I cannot do that.', toolCalls: [] },
  ]);

  await runAgent({ ...base(), ollama, prompt: 'do it' });
  assert.match(JSON.parse(ollama.sent[1].at(-1).content).error, /no tool called/);
});

test('a member without the permission cannot trigger a moderation tool', async () => {
  const ollama = scriptedOllama([
    {
      content: '',
      toolCalls: [
        {
          name: 'timeout_member',
          arguments: { user_id: '123456789012345678', minutes: 5 },
        },
      ],
    },
    { content: 'You cannot do that.', toolCalls: [] },
  ]);

  const context = base({ member: member('u1', []) });
  const result = await runAgent({ ...context, ollama, prompt: 'timeout them' });

  assert.match(
    JSON.parse(ollama.sent[1].at(-1).content).error,
    /does not have permission/,
  );
  assert.deepEqual(result.pending, [], 'nothing was even queued for confirmation');
});

test('a moderator gets a confirmation rather than an immediate timeout', async () => {
  const ollama = scriptedOllama([
    {
      content: '',
      toolCalls: [
        {
          name: 'timeout_member',
          arguments: { user_id: '123456789012345678', minutes: 5, reason: 'spam' },
        },
      ],
    },
    { content: 'Confirm below.', toolCalls: [] },
  ]);

  const context = base({ member: member('mod', [PermissionFlagsBits.ModerateMembers]) });
  const result = await runAgent({ ...context, ollama, prompt: 'timeout them' });

  assert.equal(result.pending.length, 1);
  assert.match(result.pending[0].description, /time out/);
  assert.equal(
    JSON.parse(ollama.sent[1].at(-1).content).status,
    'pending_confirmation',
    'the model is told it is pending, not done',
  );
});

test('the loop stops after the maximum iterations', async () => {
  const always = {
    async chat() {
      return {
        content: '',
        toolCalls: [{ name: 'list_facts', arguments: {} }],
      };
    },
  };

  const result = await runAgent({ ...base(), ollama: always, prompt: 'loop' });
  assert.match(result.content, /stuck/);
  assert.ok(MAX_ITERATIONS >= 1);
});

test('channel history is labelled by author and truncated', async () => {
  const ollama = scriptedOllama([{ content: 'ok', toolCalls: [] }]);
  await runAgent({
    ...base(),
    ollama,
    prompt: 'hi',
    history: [
      { fromBot: false, authorName: 'alice', content: 'x'.repeat(900) },
      { fromBot: true, authorName: 'Bot', content: 'previous answer' },
    ],
  });

  const [, first, second] = ollama.sent[0];
  assert.equal(first.role, 'user');
  assert.match(first.content, /^alice: x+$/);
  assert.ok(first.content.length < 600, 'long messages are cut down');
  assert.equal(second.role, 'assistant');
});

test('a confirmed action re-checks permission before running', async () => {
  const action = {
    toolName: 'timeout_member',
    args: { user_id: '123456789012345678', minutes: 5 },
    description: 'time out someone',
  };

  const lost = await executeConfirmed({
    action,
    toolCtx: { db: db(), guild, channel, member: member('mod', []) },
    member: member('mod', []),
    channel,
  });
  assert.match(lost.error, /no longer have permission/);
});
