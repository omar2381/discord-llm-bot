#!/bin/bash
# Started by launchd (see install.sh); also fine to run by hand.
#
# Exits 0 when there is nothing to run yet (no token in .env). The LaunchAgent
# restarts only on failure, so that is a clean stop rather than a loop, and
# launchd starts this again by itself the moment .env is saved.
set -u
cd "$(dirname "$0")/../.." || exit 1

LOG_DIR="$HOME/Library/Logs/discord-llm-bot"
LOG="$LOG_DIR/bot.log"
mkdir -p "$LOG_DIR"

# Keep the current log and one previous, rotated at each start past 10 MB.
if [ -f "$LOG" ] && [ "$(stat -f %z "$LOG")" -gt 10485760 ]; then
  mv -f "$LOG" "$LOG.1"
fi
exec >>"$LOG" 2>&1

stamp() { date '+%Y-%m-%d %H:%M:%S'; }

if ! grep -Eq '^DISCORD_TOKEN=[^[:space:]#]+' .env 2>/dev/null; then
  echo "$(stamp) run.sh: no DISCORD_TOKEN in .env yet; not starting. Saving .env starts the bot."
  exit 0
fi

# better-sqlite3 is a native module built for one Node version. A Homebrew
# upgrade of node would otherwise leave the bot crash-looping on startup.
if ! node -e "require('better-sqlite3')" 2>/dev/null; then
  echo "$(stamp) run.sh: better-sqlite3 does not load under $(node -v); rebuilding it."
  npm rebuild better-sqlite3 || exit 1
fi

echo "$(stamp) run.sh: starting under node $(node -v)"
export NODE_ENV=production
exec node src/index.js
