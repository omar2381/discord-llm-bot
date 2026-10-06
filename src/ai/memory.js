export const MAX_FACT_LENGTH = 200;
export const MAX_FACTS_PER_USER = 50;
export const RECALL_LIMIT = 20;

export function hasOptedOut(db, userId) {
  return Boolean(db.prepare('SELECT 1 FROM ai_opt_out WHERE user_id = ?').get(userId));
}

export function optOut(db, userId) {
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO ai_opt_out (user_id) VALUES (?)').run(userId);
    db.prepare('DELETE FROM user_memories WHERE user_id = ?').run(userId);
  })();
}

export function optIn(db, userId) {
  db.prepare('DELETE FROM ai_opt_out WHERE user_id = ?').run(userId);
}

/**
 * Store a fact about a user. Returns { ok } or { ok: false, reason }.
 * Oldest facts are dropped once the cap is reached, so the list stays current
 * rather than refusing new ones.
 */
export function rememberFact(db, { guildId, userId, fact }) {
  if (hasOptedOut(db, userId)) {
    return { ok: false, reason: 'That person has asked not to be remembered.' };
  }

  const trimmed = String(fact ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'Nothing to remember.' };
  if (trimmed.length > MAX_FACT_LENGTH) {
    return { ok: false, reason: `Keep it under ${MAX_FACT_LENGTH} characters.` };
  }

  const existing = db
    .prepare(
      'SELECT id FROM user_memories WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC',
    )
    .all(guildId, userId);

  const duplicate = db
    .prepare(
      'SELECT 1 FROM user_memories WHERE guild_id = ? AND user_id = ? AND lower(fact) = lower(?)',
    )
    .get(guildId, userId, trimmed);
  if (duplicate) return { ok: true, duplicate: true };

  db.transaction(() => {
    for (const row of existing.slice(MAX_FACTS_PER_USER - 1)) {
      db.prepare('DELETE FROM user_memories WHERE id = ?').run(row.id);
    }
    db.prepare(
      'INSERT INTO user_memories (guild_id, user_id, fact, created_at) VALUES (?, ?, ?, ?)',
    ).run(guildId, userId, trimmed, Date.now());
  })();

  return { ok: true };
}

export function recallFacts(db, { guildId, userId, limit = RECALL_LIMIT }) {
  return db
    .prepare(
      `SELECT * FROM user_memories WHERE guild_id = ? AND user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(guildId, userId, limit);
}

/** Delete facts matching a substring, case-insensitively. Returns the count. */
export function forgetFacts(db, { guildId, userId, query }) {
  return db
    .prepare(
      `DELETE FROM user_memories WHERE guild_id = ? AND user_id = ?
       AND lower(fact) LIKE '%' || lower(?) || '%'`,
    )
    .run(guildId, userId, String(query ?? '')).changes;
}

export function forgetById(db, { guildId, userId, id }) {
  return (
    db
      .prepare('DELETE FROM user_memories WHERE id = ? AND guild_id = ? AND user_id = ?')
      .run(id, guildId, userId).changes > 0
  );
}

export function clearFacts(db, { guildId, userId }) {
  return db
    .prepare('DELETE FROM user_memories WHERE guild_id = ? AND user_id = ?')
    .run(guildId, userId).changes;
}
