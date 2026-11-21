#!/bin/bash
# Install (or reinstall) the bot as a macOS LaunchAgent: starts at login,
# restarts after a crash or a lost connection, logs to
# ~/Library/Logs/discord-llm-bot/. Free: it runs on this Mac, beside Ollama.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="com.omar.discord-llm-bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/discord-llm-bot"
NODE_DIR="$(dirname "$(command -v node)")"

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

# Paths are XML-escaped in case the checkout ever moves somewhere with an &.
esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(esc "$ROOT/scripts/service/run.sh")</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(esc "$ROOT")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(esc "$NODE_DIR"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <!-- Start at login, and again whenever .env is saved. -->
  <key>RunAtLoad</key>
  <true/>
  <key>WatchPaths</key>
  <array>
    <string>$(esc "$ROOT/.env")</string>
  </array>
  <!-- Restart after any failure (crash, kill, network); a clean exit 0 means
       "nothing to do until the config changes" and is left alone. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>ExitTimeOut</key>
  <integer>15</integer>
  <!-- run.sh sends the bot's own output to bot.log; this catches launchd and
       shell errors from before that redirect. -->
  <key>StandardOutPath</key>
  <string>$(esc "$LOG_DIR/launchd.log")</string>
  <key>StandardErrorPath</key>
  <string>$(esc "$LOG_DIR/launchd.log")</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL"
echo "  plist: $PLIST"
echo "  logs:  $LOG_DIR/bot.log  (npm run service:logs)"
