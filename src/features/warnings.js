export function addWarning(db, { guildId, userId, moderatorId, reason }) {
  return db
    .prepare(
      `INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(guildId, userId, moderatorId, reason ?? null, Date.now()).lastInsertRowid;
}

export function listWarnings(db, guildId, userId) {
  return db
    .prepare(
      `SELECT * FROM warnings WHERE guild_id = ? AND user_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(guildId, userId);
}

export function clearWarnings(db, guildId, userId) {
  return db
    .prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?')
    .run(guildId, userId).changes;
}
