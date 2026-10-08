import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../src/db/index.js';
import { playTurn, summariseCampaign } from '../../src/ai/dm/index.js';
import {
  campaignForChannel,
  createCampaign,
  recentLog,
} from '../../src/features/dnd/campaigns.js';
import {
  createCharacter,
  getCharacter,
  inventory,
  partyFor,
} from '../../src/features/dnd/characters.js';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const campaign = createCampaign(db, {
    guildId: 'g1',
    channelId: 't1',
    name: 'The Sunken Keep',
    createdBy: 'u0',
  });
  createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u1',
    name: 'Thorn',
    ancestry: 'Dwarf',
    classKey: 'fighter',
  });
  return { db, campaign };
}

function scripted(replies) {
  const sent = [];
  return {
    sent,
    async chat({ messages }) {
      sent.push(structuredClone(messages));
      return (
        replies.shift() ?? {
          role: 'assistant',
          content: 'The scene settles.',
          toolCalls: [],
        }
      );
    },
  };
}

const actor = { id: 'u1', name: 'Thorn' };

test('plain narration is returned and recorded', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([{ content: 'The water is black and still.', toolCalls: [] }]);

  const result = await playTurn({ ollama, db, campaign, action: 'I look in.', actor });

  assert.equal(result.narration, 'The water is black and still.');
  const log = recentLog(db, campaign.id);
  assert.equal(log[0].content, 'I look in.');
  assert.equal(log[0].kind, 'action');
  assert.equal(log.at(-1).kind, 'narration');
  db.close();
});

test('the prompt carries the party and the rule against inventing rolls', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([{ content: 'ok', toolCalls: [] }]);
  await playTurn({ ollama, db, campaign, action: 'hello', actor });

  const system = ollama.sent[0][0].content;
  assert.match(system, /Thorn/);
  assert.match(system, /NEVER state the result of a die roll/);
  assert.match(system, /12\/12 hp/, 'current health is in the prompt');
  db.close();
});

test('the bot rolls the dice, not the model', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [
        { name: 'roll_check', arguments: { character: 'Thorn', ability: 'str', dc: 15 } },
      ],
    },
    { content: 'You heave the gate open.', toolCalls: [] },
  ]);

  // A loaded die, so the outcome is known regardless of what the model wanted.
  const result = await playTurn({
    ollama,
    db,
    campaign,
    action: 'I force the gate.',
    actor,
    random: () => 0.999,
  });

  const toolResult = JSON.parse(ollama.sent[1].at(-1).content);
  assert.equal(toolResult.natural, 20, 'the die came from the bot');
  assert.equal(toolResult.success, true);
  assert.equal(result.rolls.length, 1);
  assert.match(result.rolls[0], /Thorn Strength/);
  db.close();
});

test('a loaded die the other way fails the check', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [
        { name: 'roll_check', arguments: { character: 'Thorn', ability: 'dex', dc: 20 } },
      ],
    },
    { content: 'You slip.', toolCalls: [] },
  ]);

  await playTurn({ ollama, db, campaign, action: 'I jump it.', actor, random: () => 0 });
  const toolResult = JSON.parse(ollama.sent[1].at(-1).content);
  assert.equal(toolResult.natural, 1);
  assert.equal(toolResult.success, false);
  db.close();
});

test('damage changes the sheet, and the next prompt reflects it', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [
        {
          name: 'damage',
          arguments: { character: 'Thorn', amount: 9, source: 'a trap' },
        },
      ],
    },
    { content: 'The bolt catches you.', toolCalls: [] },
  ]);

  await playTurn({ ollama, db, campaign, action: 'I step forward.', actor });
  assert.equal(getCharacter(db, partyFor(db, campaign.id)[0].id).hp_current, 3);

  // The whole point: a second turn is told the new number without the model
  // having to remember it.
  const second = scripted([{ content: 'You are bleeding.', toolCalls: [] }]);
  await playTurn({
    ollama: second,
    db,
    campaign: campaignForChannel(db, 't1'),
    action: 'I keep going.',
    actor,
  });
  assert.match(second.sent[0][0].content, /3\/12 hp/);
  db.close();
});

test('a character dropped to zero is down, not dead', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [{ name: 'damage', arguments: { character: 'Thorn', amount: 12 } }],
    },
    { content: 'You fall.', toolCalls: [] },
  ]);

  const result = await playTurn({ ollama, db, campaign, action: 'I charge.', actor });
  assert.match(result.events.join(' '), /falls unconscious/);
  assert.equal(getCharacter(db, partyFor(db, campaign.id)[0].id).hp_current, 0);
  db.close();
});

test('items given by the dungeon master really arrive', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [
        { name: 'give_item', arguments: { character: 'Thorn', item: 'brass key' } },
      ],
    },
    { content: 'It is cold in your hand.', toolCalls: [] },
  ]);

  await playTurn({ ollama, db, campaign, action: 'I search the body.', actor });
  const carried = inventory(db, partyFor(db, campaign.id)[0].id);
  assert.equal(carried[0].name, 'brass key');
  db.close();
});

test('naming someone who is not in the party is corrected, not invented', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [{ name: 'damage', arguments: { character: 'Gandalf', amount: 5 } }],
    },
    { content: 'Nothing happens.', toolCalls: [] },
  ]);

  await playTurn({ ollama, db, campaign, action: 'I attack.', actor });
  const toolResult = JSON.parse(ollama.sent[1].at(-1).content);
  assert.match(toolResult.error, /nobody called "Gandalf"/);
  assert.match(toolResult.error, /Thorn/, 'the real party is offered back');
  db.close();
});

test('invalid tool arguments come back as a correctable error', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [
        {
          name: 'roll_check',
          arguments: { character: 'Thorn', ability: 'luck', dc: 99 },
        },
      ],
    },
    { content: 'Let me think again.', toolCalls: [] },
  ]);

  await playTurn({ ollama, db, campaign, action: 'I try my luck.', actor });
  const toolResult = JSON.parse(ollama.sent[1].at(-1).content);
  assert.match(toolResult.error, /not valid/);
  assert.ok(toolResult.details.length > 0);
  db.close();
});

test('setting the scene is what the next turn is told', async () => {
  const { db, campaign } = setup();
  const ollama = scripted([
    {
      content: '',
      toolCalls: [
        {
          name: 'set_scene',
          arguments: { scene: 'Inside the keep, on a stair of wet stone.' },
        },
      ],
    },
    { content: 'You climb.', toolCalls: [] },
  ]);

  await playTurn({ ollama, db, campaign, action: 'I go in.', actor });
  assert.match(campaignForChannel(db, 't1').scene, /wet stone/);
  db.close();
});

test('experience is awarded to everyone at the table', async () => {
  const { db, campaign } = setup();
  createCharacter(db, {
    campaignId: campaign.id,
    userId: 'u2',
    name: 'Mira',
    ancestry: 'Elf',
    classKey: 'wizard',
  });

  const ollama = scripted([
    { content: '', toolCalls: [{ name: 'award_xp', arguments: { amount: 300 } }] },
    { content: 'Well done.', toolCalls: [] },
  ]);

  await playTurn({ ollama, db, campaign, action: 'We win.', actor });
  for (const character of partyFor(db, campaign.id)) {
    assert.equal(character.xp, 300, `${character.name} should have the xp`);
    assert.equal(character.level, 2);
  }
  db.close();
});

test('a model that only calls tools still produces something to read', async () => {
  const { db, campaign } = setup();
  const always = {
    async chat() {
      return {
        content: '',
        toolCalls: [{ name: 'damage', arguments: { character: 'Thorn', amount: 1 } }],
      };
    },
  };

  const result = await playTurn({ ollama: always, db, campaign, action: 'hm', actor });
  assert.ok(result.narration.length > 0, 'the events stand in for narration');
  db.close();
});

test('the summary is written back to the campaign', async () => {
  const { db, campaign } = setup();
  const { addLog } = await import('../../src/features/dnd/campaigns.js');
  addLog(db, campaign.id, { kind: 'narration', content: 'They crossed the moor.' });

  const ollama = scripted([{ content: 'The party crossed the moor.', toolCalls: [] }]);
  const summary = await summariseCampaign({
    ollama,
    db,
    campaign: campaignForChannel(db, 't1'),
  });

  assert.equal(summary, 'The party crossed the moor.');
  assert.equal(campaignForChannel(db, 't1').summary, summary);
  db.close();
});
