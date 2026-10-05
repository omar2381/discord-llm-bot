CREATE TABLE guild_settings (
  guild_id            TEXT PRIMARY KEY,
  welcome_channel_id  TEXT,
  welcome_message     TEXT,          -- supports {user} {username} {server} {memberCount}
  autorole_id         TEXT,
  modlog_channel_id   TEXT,
  automod_enabled     INTEGER NOT NULL DEFAULT 0,
  spam_enabled        INTEGER NOT NULL DEFAULT 0,
  ai_enabled          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE banned_words (
  guild_id TEXT NOT NULL,
  word     TEXT NOT NULL,
  PRIMARY KEY (guild_id, word)
);

CREATE TABLE warnings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason       TEXT,
  created_at   INTEGER NOT NULL      -- unix ms
);
CREATE INDEX idx_warnings_user ON warnings(guild_id, user_id);

CREATE TABLE reminders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id   TEXT,
  message    TEXT NOT NULL,
  due_at     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_reminders_due ON reminders(due_at);

CREATE TABLE role_menus (
  message_id TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  title      TEXT NOT NULL
);

CREATE TABLE role_menu_roles (
  message_id TEXT NOT NULL REFERENCES role_menus(message_id) ON DELETE CASCADE,
  role_id    TEXT NOT NULL,
  label      TEXT NOT NULL,
  emoji      TEXT,
  PRIMARY KEY (message_id, role_id)
);

CREATE TABLE rps_games (
  id            TEXT PRIMARY KEY,     -- interaction id of the challenge
  challenger_id TEXT NOT NULL,
  choice        TEXT NOT NULL,
  opponent_id   TEXT,                 -- set when someone accepts
  created_at    INTEGER NOT NULL
);

-- AI memory: short facts about a user, scoped per guild
CREATE TABLE user_memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  fact       TEXT NOT NULL,           -- max 200 chars
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_memories_user ON user_memories(guild_id, user_id);

CREATE TABLE ai_opt_out (
  user_id TEXT PRIMARY KEY            -- users who don't want to be remembered
);
