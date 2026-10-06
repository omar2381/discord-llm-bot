const DEFAULTS = Object.freeze({
  welcome_channel_id: null,
  welcome_message: null,
  autorole_id: null,
  modlog_channel_id: null,
  automod_enabled: 0,
  spam_enabled: 0,
  ai_enabled: 1,
});

export function getSettings(db, guildId) {
  const row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  return { guild_id: guildId, ...DEFAULTS, ...(row ?? {}) };
}

/** Upsert one or more columns. Column names are checked against DEFAULTS. */
export function setSettings(db, guildId, patch) {
  const keys = Object.keys(patch);
  for (const key of keys) {
    if (!(key in DEFAULTS)) throw new Error(`unknown setting: ${key}`);
  }
  if (!keys.length) return;

  const columns = keys.join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const updates = keys.map((key) => `${key} = excluded.${key}`).join(', ');

  db.prepare(
    `INSERT INTO guild_settings (guild_id, ${columns}) VALUES (?, ${placeholders})
     ON CONFLICT(guild_id) DO UPDATE SET ${updates}`,
  ).run(guildId, ...keys.map((key) => patch[key]));
}

export function getBannedWords(db, guildId) {
  return db
    .prepare('SELECT word FROM banned_words WHERE guild_id = ? ORDER BY word')
    .all(guildId)
    .map((row) => row.word);
}

export function addBannedWord(db, guildId, word) {
  return (
    db
      .prepare('INSERT OR IGNORE INTO banned_words (guild_id, word) VALUES (?, ?)')
      .run(guildId, word.toLowerCase().trim()).changes > 0
  );
}

export function removeBannedWord(db, guildId, word) {
  return (
    db
      .prepare('DELETE FROM banned_words WHERE guild_id = ? AND word = ?')
      .run(guildId, word.toLowerCase().trim()).changes > 0
  );
}
