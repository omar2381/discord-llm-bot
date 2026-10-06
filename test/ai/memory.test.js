import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/index.js';
import {
  MAX_FACTS_PER_USER,
  MAX_FACT_LENGTH,
  clearFacts,
  forgetById,
  forgetFacts,
  hasOptedOut,
  optIn,
  optOut,
  recallFacts,
  rememberFact,
} from '../../src/ai/memory.js';

function db() {
  const d = new Database(':memory:');
  migrate(d);
  return d;
}

const scope = { guildId: 'g1', userId: 'u1' };

test('a fact is stored and recalled newest first', () => {
  const d = db();
  rememberFact(d, { ...scope, fact: 'likes pizza' });
  rememberFact(d, { ...scope, fact: 'lives in Geneva' });

  const facts = recallFacts(d, scope).map((row) => row.fact);
  assert.deepEqual(facts, ['lives in Geneva', 'likes pizza']);
  d.close();
});

test('facts are scoped to the guild and the user', () => {
  const d = db();
  rememberFact(d, { guildId: 'g1', userId: 'u1', fact: 'a' });
  assert.equal(recallFacts(d, { guildId: 'g2', userId: 'u1' }).length, 0);
  assert.equal(recallFacts(d, { guildId: 'g1', userId: 'u2' }).length, 0);
  d.close();
});

test('blank and over-long facts are refused', () => {
  const d = db();
  assert.equal(rememberFact(d, { ...scope, fact: '   ' }).ok, false);
  const long = rememberFact(d, { ...scope, fact: 'x'.repeat(MAX_FACT_LENGTH + 1) });
  assert.equal(long.ok, false);
  assert.match(long.reason, /under 200/);
  d.close();
});

test('the same fact twice is not stored twice', () => {
  const d = db();
  rememberFact(d, { ...scope, fact: 'likes pizza' });
  const again = rememberFact(d, { ...scope, fact: 'Likes Pizza' });
  assert.equal(again.duplicate, true);
  assert.equal(recallFacts(d, scope).length, 1);
  d.close();
});

test('the oldest fact is dropped once the cap is reached', () => {
  const d = db();
  for (let i = 0; i < MAX_FACTS_PER_USER; i++) {
    rememberFact(d, { ...scope, fact: `fact ${i}` });
  }
  rememberFact(d, { ...scope, fact: 'the newest' });

  const facts = recallFacts(d, { ...scope, limit: 100 }).map((row) => row.fact);
  assert.equal(facts.length, MAX_FACTS_PER_USER);
  assert.equal(facts[0], 'the newest');
  assert.equal(facts.includes('fact 0'), false, 'the oldest went');
  d.close();
});

test('forgetting by text removes the matches only', () => {
  const d = db();
  rememberFact(d, { ...scope, fact: 'likes pizza' });
  rememberFact(d, { ...scope, fact: 'likes pasta' });
  rememberFact(d, { ...scope, fact: 'has a cat' });

  assert.equal(forgetFacts(d, { ...scope, query: 'LIKES' }), 2);
  assert.deepEqual(
    recallFacts(d, scope).map((row) => row.fact),
    ['has a cat'],
  );
  d.close();
});

test('forgetting by id only works on your own facts', () => {
  const d = db();
  rememberFact(d, { ...scope, fact: 'mine' });
  const [row] = recallFacts(d, scope);

  assert.equal(forgetById(d, { guildId: 'g1', userId: 'u2', id: row.id }), false);
  assert.equal(forgetById(d, { ...scope, id: row.id }), true);
  d.close();
});

test('opting out deletes what is stored and blocks new facts', () => {
  const d = db();
  rememberFact(d, { ...scope, fact: 'something' });
  optOut(d, 'u1');

  assert.equal(hasOptedOut(d, 'u1'), true);
  assert.equal(recallFacts(d, scope).length, 0);

  const refused = rememberFact(d, { ...scope, fact: 'anything' });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /asked not to be remembered/);

  optIn(d, 'u1');
  assert.equal(hasOptedOut(d, 'u1'), false);
  assert.equal(rememberFact(d, { ...scope, fact: 'allowed now' }).ok, true);
  d.close();
});

test('clearing removes everything for that user in that guild', () => {
  const d = db();
  rememberFact(d, { ...scope, fact: 'a' });
  rememberFact(d, { ...scope, fact: 'b' });
  rememberFact(d, { guildId: 'g2', userId: 'u1', fact: 'elsewhere' });

  assert.equal(clearFacts(d, scope), 2);
  assert.equal(recallFacts(d, { guildId: 'g2', userId: 'u1' }).length, 1);
  d.close();
});
