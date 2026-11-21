import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/index.js';
import { createOllama, OllamaUnavailableError } from '../../src/ai/ollama.js';
import { createCampaign } from '../../src/features/dnd/campaigns.js';
import { createCharacter } from '../../src/features/dnd/characters.js';
import { isBusy, takeTurn } from '../../src/features/dnd/play.js';

// The bot runs around the clock while Ollama comes and goes (restarts, updates,
// the Mac under load). These pin down that a missing Ollama is reported as
// offline, not as a crash or a generic failure.

test.afterEach(() => mock.restoreAll());

function refuseConnections() {
  mock.method(globalThis, 'fetch', async () => {
    const error = new TypeError('fetch failed');
    error.cause = { code: 'ECONNREFUSED' };
    throw error;
  });
}

const silentLogger = { warn() {}, error() {}, info() {} };

test('a refused connection becomes OllamaUnavailableError', async () => {
  refuseConnections();
  const ollama = createOllama({ url: 'http://localhost:11434', model: 'm' });
  await assert.rejects(
    () => ollama.chat({ messages: [] }),
    (error) => {
      assert.ok(error instanceof OllamaUnavailableError);
      assert.match(error.message, /ECONNREFUSED/);
      return true;
    },
  );
});

test('a timeout is still a timeout, not "offline"', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('timed out', 'TimeoutError');
  });
  const ollama = createOllama({ url: 'http://host', model: 'm' });
  await assert.rejects(
    () => ollama.chat({ messages: [] }),
    (error) => error.name === 'TimeoutError',
  );
});

test('an unpulled model is flagged', async () => {
  mock.method(
    globalThis,
    'fetch',
    async () => new Response('{"error":"model \\"m\\" not found"}', { status: 404 }),
  );
  const ollama = createOllama({ url: 'http://host', model: 'm' });
  await assert.rejects(
    () => ollama.chat({ messages: [] }),
    (error) => error.modelMissing === true,
  );
});

test('the dungeon master says it is offline and frees the table', async () => {
  refuseConnections();
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const campaign = createCampaign(db, {
    guildId: 'g1',
    channelId: 't1',
    name: 'The Sunken Keep',
    tone: 'grim',
    createdBy: 'u0',
  });
  createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });

  const ctx = {
    db,
    logger: silentLogger,
    ai: {
      enabled: true,
      ollama: createOllama({ url: 'http://localhost:1', model: 'm' }),
    },
  };
  const result = await takeTurn({
    ctx,
    campaign,
    action: 'I open the door.',
    actor: { id: 'u1', name: 'Thorn' },
  });

  assert.match(result.refused, /offline/);
  assert.equal(isBusy(campaign.id), false, 'the next turn is not blocked');
  db.close();
});
