#!/bin/bash
# Stop the bot and remove its LaunchAgent. Logs and data/bot.db are kept.
set -u
LABEL="com.omar.discord-llm-bot"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Removed $LABEL"
