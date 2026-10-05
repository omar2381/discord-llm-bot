# discord-llm-bot

A Discord bot for my own servers: games, utility commands, moderation, welcome
and role menus, and an optional AI assistant that runs on a local LLM through
[Ollama](https://ollama.com) rather than a paid API.

**Status: scaffolding only (Phase 0).** The bot starts, connects and answers
`/ping`; everything else is still to come. [PLAN.md](PLAN.md) is the full
specification: goals, decisions already made, database schema, and seven phases
of work (0–6), each with its own tests and a "Done when" checklist.

## Why it must stay free

My friends should be able to use it without it costing me anything per message,
so the AI is a small local model (`qwen2.5:3b`) over Ollama's HTTP API, not a
hosted API. The bot is designed to work completely without AI: leave
`OLLAMA_URL` empty and every other command still works.

## Shape of it

|         |                                                 |
| ------- | ----------------------------------------------- |
| Runtime | Node.js 22 LTS, JavaScript (ESM), no build step |
| Discord | discord.js v14, gateway bot                     |
| Storage | SQLite via `better-sqlite3`, one file           |
| AI      | Ollama `/api/chat`, tool calling, optional      |
| Tests   | `node:test`, no framework                       |

## Before any code runs: Discord Developer Portal

Only a human can do this part.

1. Go to <https://discord.com/developers/applications> → **New Application** → name it.
2. **Bot** tab → **Reset Token** → copy it into `.env` as `DISCORD_TOKEN`. Never share it.
3. **Bot** tab → _Privileged Gateway Intents_ → enable **Server Members Intent** and
   **Message Content Intent**. The bot refuses to log in without them.
4. **General Information** → copy **Application ID** → `.env` as `CLIENT_ID`.
5. In Discord, turn on Developer Mode (User Settings → Advanced), right-click your
   server → **Copy Server ID** → `.env` as `DEV_GUILD_ID`.
6. **OAuth2 → URL Generator**: scopes `bot` and `applications.commands`. Bot permissions:
   View Channels, Send Messages, Embed Links, Read Message History, Manage Messages,
   Manage Roles, Kick Members, Ban Members, Moderate Members, Use External Emojis,
   Add Reactions, Send Polls. Open the generated URL and add the bot to your server.
7. Server Settings → Roles: drag the bot's role **above** any role it should assign
   or moderate.

## Running it

Needs Node.js 22 or newer.

```sh
cp .env.example .env        # then fill in DISCORD_TOKEN, CLIENT_ID, DEV_GUILD_ID
npm ci
npm run deploy:commands     # registers slash commands in DEV_GUILD_ID (instant)
npm run dev                 # starts the bot, restarts on file changes
```

You should see `Ready as YourBot#1234`. Try `/ping` in your server.

Run `npm run deploy:commands` again whenever you add, rename or change a command.
`npm run deploy:commands:global` registers them in every server the bot is in
instead (the first rollout can take up to an hour).

| Script                    | What it does                              |
| ------------------------- | ----------------------------------------- |
| `npm start`               | Run the bot                               |
| `npm run dev`             | Run with auto-restart on changes          |
| `npm run deploy:commands` | Register slash commands in `DEV_GUILD_ID` |
| `npm test`                | Unit tests                                |
| `npm run lint`            | ESLint + Prettier check                   |
| `npm run format`          | Auto-format everything                    |

## Commands

| Command | What it does                           |
| ------- | -------------------------------------- |
| `/ping` | Checks the bot is alive; shows latency |

## Project layout

```
src/
  index.js              entry point: client, loaders, shutdown
  config.js             reads and validates .env
  db/                   SQLite + numbered migrations in db/migrations/
  commands/<group>/     one slash command per file (data + execute)
  events/               discord.js event handlers (name + execute)
  components/           button/select/modal handlers, routed by customId prefix
  util/                 module loader, cooldowns, reply helpers
scripts/                deploy-commands.js
test/                   node:test files, mirroring src/
```

Adding a command means adding one file under `src/commands/<group>/` that exports
`data` (a `SlashCommandBuilder`) and `execute(interaction, ctx)`, then running
`npm run deploy:commands`. `ctx` holds `client`, `config`, `db` and `logger`.

## History

An earlier attempt lived in `discord-bot-tests`, which was a fork of Discord's
`discord-example-app` and contained no work of my own. GitHub has no way to
detach a fork, so that repository was deleted and this one started fresh. The
one piece carried over is in [reference/](reference): Discord's
rock-paper-scissors rules table, MIT licensed, kept because the plan refers to
it. It is reference material, not part of the bot.
