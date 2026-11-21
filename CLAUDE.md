# discord-llm-bot

A Discord bot for Omar's own servers: games, utilities, moderation, welcome and
role menus, a Dungeons and Dragons dungeon master, and an AI assistant that
runs on a **local** model through Ollama rather than a paid API.

**MCP prefix: none.** Storage is SQLite at `./data/bot.db`. No Supabase, no
hosted database; do not reach for a Supabase tool here.

**Hard requirement: it must stay free to run.** No paid API, no per-message
cost. The bot must work completely with `OLLAMA_URL` empty — only `/ask`, the
assistant and the dungeon master need it.

## Layout

Commands, events and components are read off the filesystem, so adding a file
is all it takes. No central registry to update.

| Path | Contract |
|---|---|
| `src/commands/**` | exports `data` (a `SlashCommandBuilder`), `execute(interaction, ctx)`, optionally `cooldownSeconds` |
| `src/events/**` | exports `name`, `execute(...args, ctx)`, optionally `once` |
| `src/components/**` | exports `prefix` and `execute(interaction, ctx)`; custom IDs are `prefix:arg1:arg2` |
| `src/features/**` | Discord-free logic, unit tested directly |
| `src/ai/**` | Ollama client, agent loop, tools, memory |
| `src/ai/dm/**` | the dungeon master |

`ctx` is `{ db, config, logger, client, commands, components, ai }`.

## Two rules that are load-bearing, not stylistic

**1. The model never acts with more authority than the person who asked.**
Every AI tool checks the permissions of the member who addressed the bot, so an
instruction planted in someone else's message cannot borrow a moderator's
powers. Destructive tools do not execute at all: they return a Confirm button
only the asker can press, re-checked when pressed. Kick and ban are not exposed
to the model.

**2. The model never produces a number that matters.** In the D&D code it
cannot roll dice: it calls `roll_check` and waits, and the d20 is the bot's.
Damage, items and experience are tool calls. Claimed in prose they do nothing,
and the next turn's prompt contradicts them.

The reason both work is that **state lives in SQLite, not in the model's
head**. A 3B model forgets; hit points, inventory and the scene are rebuilt
into the prompt every turn. If you add a feature where the model has to
remember something, store it instead.

## Working on it

```bash
npm ci
npm test                 # node:test, no framework
npm run lint             # eslint + prettier
npm run deploy:commands  # register to DEV_GUILD_ID, appears instantly
npm run dev
```

Every schema change is a new numbered file in `src/db/migrations/`. The runner
applies pending ones in filename order inside a transaction; never edit a
migration that has already run.

Tests mock `fetch` and use `:memory:` SQLite. Do not try to mock all of
discord.js — pass minimal fake objects instead.

## Running for real

On Omar's Mac as the LaunchAgent `com.omar.discord-llm-bot` (`npm run
service:install`, logs in `~/Library/Logs/discord-llm-bot/`), next to the
Homebrew Ollama service, with `OLLAMA_MODEL=qwen3:30b-instruct`. README,
"Running it around the clock", has the details.

## Not yet verified

Nothing here has run against a real Discord server. Intents, role hierarchy,
bulk delete and thread creation are all untested in the wild. The README ends
with a by-hand checklist.

## Docs

`PLAN.md` is the original six-phase build plan, with a Deviations section at
the bottom recording where the implementation departed from it. Keep adding to
that section rather than silently diverging.

`docs/` is a static landing page for GitHub Pages; the invite button needs an
application id in `docs/config.js`.
