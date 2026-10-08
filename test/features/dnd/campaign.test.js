import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../../src/db/index.js';
import {
  SUMMARISE_EVERY,
  addLog,
  buildContext,
  campaignForChannel,
  createCampaign,
  deleteCampaign,
  logAsMessages,
  needsSummary,
  recentLog,
  setScene,
  setSummary,
} from '../../../src/features/dnd/campaigns.js';
import {
  addItem,
  awardXp,
  createCharacter,
  damageCharacter,
  deathSave,
  findByName,
  getCharacter,
  healCharacter,
  inventory,
  partyFor,
  removeItem,
  rest,
} from '../../../src/features/dnd/characters.js';
import { resolveCheck } from '../../../src/features/dnd/rules.js';

function setup() {
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
  return { db, campaign };
}

test('a campaign is found by its thread', () => {
  const { db, campaign } = setup();
  assert.equal(campaignForChannel(db, 't1').id, campaign.id);
  assert.equal(campaignForChannel(db, 'elsewhere'), null);
  db.close();
});

test('a character joins once, and not twice', () => {
  const { db, campaign } = setup();
  const first = createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });
  assert.equal(first.character.name, 'Thorn');

  const second = createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn Again',
    ancestry: 'Dwarf',
    classKey: 'rogue',
  });
  assert.match(second.error, /already have a character/);
  assert.equal(partyFor(db, campaign.id).length, 1);
  db.close();
});

test('characters are found by name, including a prefix', () => {
  const { db, campaign } = setup();
  createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Mirabel',
    ancestry: 'Elf',
    classKey: 'wizard',
  });

  assert.equal(findByName(db, campaign.id, 'mirabel').name, 'Mirabel');
  assert.equal(findByName(db, campaign.id, 'MIRA').name, 'Mirabel', 'a prefix is enough');
  assert.equal(findByName(db, campaign.id, 'Gandalf'), null);
  assert.equal(findByName(db, campaign.id, ''), null);
  db.close();
});

test('damage, healing and death saves move the sheet', () => {
  const { db, campaign } = setup();
  const { character } = createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });

  damageCharacter(db, character, character.hp_max);
  let current = getCharacter(db, character.id);
  assert.equal(current.hp_current, 0, 'down, not dead');

  const failed = resolveCheck({ roll20: () => 3, dc: 10 });
  deathSave(db, current, failed);
  current = getCharacter(db, character.id);
  assert.equal(current.death_saves_failed, 1);

  healCharacter(db, current, 5);
  current = getCharacter(db, character.id);
  assert.equal(current.hp_current, 5);
  assert.equal(current.death_saves_failed, 0, 'coming back up clears the saves');
  db.close();
});

test('a long rest restores everything, a short rest some of it', () => {
  const { db, campaign } = setup();
  const { character } = createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });

  damageCharacter(db, character, 10);
  rest(db, getCharacter(db, character.id), 'short');
  const afterShort = getCharacter(db, character.id);
  assert.ok(afterShort.hp_current > 2 && afterShort.hp_current < afterShort.hp_max);

  rest(db, afterShort, 'long');
  assert.equal(getCharacter(db, character.id).hp_current, character.hp_max);
  db.close();
});

test('experience levels a character up and raises their maximum', () => {
  const { db, campaign } = setup();
  const { character } = createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });

  const result = awardXp(db, character, 300);
  assert.equal(result.level, 2);
  assert.equal(result.levelledUp, true);
  assert.ok(result.hpMax > character.hp_max);
  db.close();
});

test('items stack, and run out', () => {
  const { db, campaign } = setup();
  const { character } = createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });

  addItem(db, character.id, { name: 'torch', quantity: 2 });
  addItem(db, character.id, { name: 'Torch', quantity: 1 });
  assert.equal(inventory(db, character.id).length, 1, 'case does not make a second pile');
  assert.equal(inventory(db, character.id)[0].quantity, 3);

  removeItem(db, character.id, 'torch', 3);
  assert.equal(inventory(db, character.id).length, 0);
  assert.match(removeItem(db, character.id, 'torch').error, /do not have/);
  db.close();
});

test('the context names the party, their health and the scene', () => {
  const { db, campaign } = setup();
  createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });
  const hurt = partyFor(db, campaign.id)[0];
  damageCharacter(db, hurt, hurt.hp_max - 1);
  setScene(db, campaign.id, 'At the flooded gate.');
  setSummary(db, campaign.id, 'They crossed the moor.');

  const context = buildContext(db, campaignForChannel(db, 't1'));
  assert.match(context, /The Sunken Keep/);
  assert.match(context, /Tone: grim/);
  assert.match(context, /Thorn/);
  assert.match(context, /badly hurt/, 'the model is told how hurt they are');
  assert.match(context, /They crossed the moor/);
  assert.match(context, /At the flooded gate/);
  db.close();
});

test('an empty party is stated plainly rather than left blank', () => {
  const { db, campaign } = setup();
  assert.match(buildContext(db, campaign), /nobody has made a character/);
  db.close();
});

test('the log becomes conversation turns with the speaker attached', () => {
  const { db, campaign } = setup();
  addLog(db, campaign.id, { kind: 'action', actorName: 'Thorn', content: 'I wade in.' });
  addLog(db, campaign.id, { kind: 'narration', content: 'The water is cold.' });
  addLog(db, campaign.id, { kind: 'roll', content: 'Thorn Strength: 14' });

  const messages = logAsMessages(recentLog(db, campaign.id));
  assert.deepEqual(messages, [
    { role: 'user', content: 'Thorn: I wade in.' },
    { role: 'assistant', content: 'The water is cold.' },
    { role: 'user', content: 'DICE: Thorn Strength: 14' },
  ]);
  db.close();
});

test('the log is capped and returned oldest first', () => {
  const { db, campaign } = setup();
  for (let i = 0; i < 30; i++) {
    addLog(db, campaign.id, { kind: 'narration', content: `turn ${i}` });
  }
  const recent = recentLog(db, campaign.id, 5);
  assert.equal(recent.length, 5);
  assert.equal(recent[0].content, 'turn 25');
  assert.equal(recent.at(-1).content, 'turn 29', 'oldest first');
  db.close();
});

test('a summary is asked for every so many turns', () => {
  const { db } = setup();
  assert.equal(needsSummary({ turn_count: 0 }), false);
  assert.equal(needsSummary({ turn_count: SUMMARISE_EVERY }), true);
  assert.equal(needsSummary({ turn_count: SUMMARISE_EVERY + 1 }), false);
  db.close();
});

test('deleting a campaign takes its characters and items with it', () => {
  const { db, campaign } = setup();
  const { character } = createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });
  addItem(db, character.id, { name: 'torch' });
  addLog(db, campaign.id, { kind: 'narration', content: 'something' });

  deleteCampaign(db, campaign.id);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM character_items').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM campaign_log').get().n, 0);
  db.close();
});
