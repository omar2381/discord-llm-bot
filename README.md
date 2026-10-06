# discord-llm-bot

A Discord bot for my own servers: games, utility commands, moderation, welcome
and role menus, and an optional AI assistant that runs on a local LLM through
[Ollama](https://ollama.com) rather than a paid API.

Built phase by phase from [PLAN.md](PLAN.md). **Phases 0 and 1 are done** —
the bot runs, registers its commands and plays rock-paper-scissors. Moderation,
welcome messages and the AI are still to come.

## Commands

| Command | What it does |
|---|---|
| `/ping` | Round-trip and websocket latency |
| `/rps choice:<option> [opponent:<user>]` | Seven-way rock-paper-scissors with an Accept button |
| `/roll [dice:"2d6+1"]` | Dice, up to 100 dice of up to 1000 sides |
| `/8ball question:<text>` | The usual twenty answers |

## Setup

Some of this only a human can do.

1. Create an application at <https://discord.com/developers/applications>.
2. **Bot** tab → **Reset Token** → this is `DISCORD_TOKEN`. Never share it.
3. Still on **Bot**, under *Privileged Gateway Intents*, enable **Server Members
   Intent** and **Message Content Intent**. Later phases need both.
4. **General Information** → **Application ID** is `CLIENT_ID`.
5. In Discord, turn on Developer Mode (Settings → Advanced), right-click your
   server → **Copy Server ID** → `DEV_GUILD_ID`.
6. **OAuth2 → URL Generator**: scopes `bot` and `applications.commands`;
   permissions View Channels, Send Messages, Embed Links, Read Message History,
   Manage Messages, Manage Roles, Kick Members, Ban Members, Moderate Members,
   Use External Emojis, Add Reactions, Send Polls. Open the URL it builds and
   add the bot to your server.
7. Server Settings → Roles: drag the bot's role **above** any role it should
   assign or moderate. Discord enforces that hierarchy.

Then:

```bash
cp .env.example .env     # fill in DISCORD_TOKEN, CLIENT_ID, DEV_GUILD_ID
npm ci
npm run deploy:commands  # registers to your dev server, appears instantly
npm run dev
```

`npm run deploy:commands:global` registers globally instead. Global commands can
take up to an hour to show up the first time, so develop against a guild.

## Checking it works

- `/ping` replies with two numbers.
- `/rps choice:rock` posts a challenge; a *different* account presses Accept,
  picks from the menu, and the result is posted publicly.
- `/roll 2d6+1` gives a total and the individual dice; `/roll banana` explains
  itself rather than failing.
- `/8ball question:will this work` answers.

## Development

```bash
npm test     # node:test, no framework
npm run lint # eslint + prettier
npm run format
```

Logic that does not need Discord lives in `src/features/` and is unit tested
directly. Commands, events and components are picked up from the filesystem, so
adding a file is all it takes:

- `src/commands/**` exports `data` (a `SlashCommandBuilder`), `execute(interaction, ctx)`,
  and optionally `cooldownSeconds`.
- `src/events/**` exports `name`, `execute(...args, ctx)`, optionally `once`.
- `src/components/**` exports `prefix` and `execute(interaction, ctx)`; custom
  IDs are `prefix:arg1:arg2`.

`ctx` is `{ db, config, logger, client, commands, components }`.

## Requirements

Node.js 22 or newer. The database is SQLite, created at `./data/bot.db` on first
run; nothing else to install.

## History

An earlier attempt lived in `discord-bot-tests`, a fork of Discord's
`discord-example-app` containing no work of my own. GitHub cannot detach a fork,
so it was deleted and this repository started fresh. The rock-paper-scissors
rules table is adapted from it, with attribution, in `src/features/rps.js`; the
original is in [reference/](reference).
