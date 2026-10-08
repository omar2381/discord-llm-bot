import { characterLine, inventory, partyFor } from './characters.js';

export const RECENT_TURNS = 14;
export const SUMMARISE_EVERY = 20;
export const MAX_LOG_CHARS = 600;

export function createCampaign(db, { guildId, channelId, name, tone, createdBy }) {
  const id = db
    .prepare(
      `INSERT INTO campaigns (guild_id, channel_id, name, tone, scene, created_by, created_at, last_played_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      guildId,
      channelId,
      name,
      tone ?? null,
      createdBy,
      Date.now(),
      Date.now(),
    ).lastInsertRowid;

  return getCampaign(db, id);
}

export function getCampaign(db, id) {
  return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) ?? null;
}

export function campaignForChannel(db, channelId) {
  return (
    db.prepare('SELECT * FROM campaigns WHERE channel_id = ?').get(channelId) ?? null
  );
}

export function campaignsInGuild(db, guildId) {
  return db
    .prepare('SELECT * FROM campaigns WHERE guild_id = ? ORDER BY last_played_at DESC')
    .all(guildId);
}

export function setStatus(db, campaignId, status) {
  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, campaignId);
}

export function setScene(db, campaignId, scene) {
  db.prepare('UPDATE campaigns SET scene = ? WHERE id = ?').run(scene, campaignId);
}

export function setSummary(db, campaignId, summary) {
  db.prepare('UPDATE campaigns SET summary = ? WHERE id = ?').run(summary, campaignId);
}

export function addLog(
  db,
  campaignId,
  { kind, actorId = null, actorName = null, content },
) {
  const trimmed = String(content).slice(0, MAX_LOG_CHARS);
  db.prepare(
    `INSERT INTO campaign_log (campaign_id, kind, actor_id, actor_name, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(campaignId, kind, actorId, actorName, trimmed, Date.now());

  db.prepare(
    'UPDATE campaigns SET turn_count = turn_count + 1, last_played_at = ? WHERE id = ?',
  ).run(Date.now(), campaignId);
}

export function recentLog(db, campaignId, limit = RECENT_TURNS) {
  return db
    .prepare('SELECT * FROM campaign_log WHERE campaign_id = ? ORDER BY id DESC LIMIT ?')
    .all(campaignId, limit)
    .reverse();
}

export function logSince(db, campaignId, afterId) {
  return db
    .prepare('SELECT * FROM campaign_log WHERE campaign_id = ? AND id > ? ORDER BY id')
    .all(campaignId, afterId);
}

/**
 * Is it time to fold the recent log into the summary? Doing this on a count
 * rather than on token length keeps it predictable, and the cost of being
 * slightly early is only one extra generation.
 */
export function needsSummary(campaign) {
  return campaign.turn_count > 0 && campaign.turn_count % SUMMARISE_EVERY === 0;
}

/**
 * Everything the DM needs to know, as text.
 *
 * This is the heart of making a small model work as a dungeon master. The model
 * is not asked to remember anything: the party, their health, where they are
 * and what has happened are rebuilt from the database on every single turn. If
 * the model forgets that someone is at 2 hit points, the next prompt tells it
 * again.
 */
export function buildContext(db, campaign) {
  const party = partyFor(db, campaign.id);
  const lines = [];

  lines.push(`Campaign: ${campaign.name}`);
  if (campaign.tone) lines.push(`Tone: ${campaign.tone}`);

  lines.push('', 'The party:');
  if (party.length === 0) {
    lines.push('- nobody has made a character yet');
  } else {
    for (const character of party) {
      lines.push(`- ${characterLine(character, inventory(db, character.id))}`);
    }
  }

  if (campaign.summary) {
    lines.push('', 'The story so far:', campaign.summary);
  }

  lines.push('', 'Right now:', campaign.scene || 'The adventure has not started yet.');

  return lines.join('\n');
}

/** Recent turns as conversation, so the model sees who said and did what. */
export function logAsMessages(entries) {
  return entries.map((entry) => {
    if (entry.kind === 'narration') {
      return { role: 'assistant', content: entry.content };
    }
    const who = entry.actor_name ?? 'Someone';
    const prefix =
      entry.kind === 'roll' ? 'DICE' : entry.kind === 'system' ? 'SYSTEM' : who;
    return { role: 'user', content: `${prefix}: ${entry.content}` };
  });
}

export function deleteCampaign(db, campaignId) {
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
}
