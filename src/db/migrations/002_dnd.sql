-- Dungeons and Dragons campaigns.
--
-- The point of this schema is that the model does not hold the campaign in its
-- head. Hit points, inventory, the party, where everyone is and what has
-- happened live here, and are fed back into the prompt every turn. A small
-- model narrates; the database remembers.

CREATE TABLE campaigns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL UNIQUE,   -- the thread the campaign is played in
  name          TEXT NOT NULL,
  tone          TEXT,                   -- "grim", "comic", whatever the table wants
  status        TEXT NOT NULL DEFAULT 'active',  -- active | paused | ended
  scene         TEXT,                   -- where the party is, right now
  summary       TEXT,                   -- the story so far, compressed
  turn_count    INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_played_at INTEGER
);
CREATE INDEX idx_campaigns_guild ON campaigns(guild_id, status);

CREATE TABLE characters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  ancestry     TEXT NOT NULL,
  class        TEXT NOT NULL,
  level        INTEGER NOT NULL DEFAULT 1,
  xp           INTEGER NOT NULL DEFAULT 0,
  hp_current   INTEGER NOT NULL,
  hp_max       INTEGER NOT NULL,
  temp_hp      INTEGER NOT NULL DEFAULT 0,
  death_saves_passed INTEGER NOT NULL DEFAULT 0,
  death_saves_failed INTEGER NOT NULL DEFAULT 0,
  ac           INTEGER NOT NULL,
  str          INTEGER NOT NULL,
  dex          INTEGER NOT NULL,
  con          INTEGER NOT NULL,
  intl         INTEGER NOT NULL,
  wis          INTEGER NOT NULL,
  cha          INTEGER NOT NULL,
  gold         INTEGER NOT NULL DEFAULT 0,
  conditions   TEXT NOT NULL DEFAULT '',  -- comma separated
  notes        TEXT,
  created_at   INTEGER NOT NULL,
  UNIQUE (campaign_id, user_id)
);
CREATE INDEX idx_characters_campaign ON characters(campaign_id);

CREATE TABLE character_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1,
  note         TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_items_character ON character_items(character_id);

-- Everything that happened, newest last. Narration and player actions are kept
-- verbatim for the recent window; older entries are folded into campaigns.summary
-- and may be pruned.
CREATE TABLE campaign_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,          -- narration | action | roll | system
  actor_id     TEXT,                   -- discord user id, null for the DM
  actor_name   TEXT,
  content      TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_log_campaign ON campaign_log(campaign_id, id);
