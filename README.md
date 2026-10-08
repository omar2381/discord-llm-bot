# discord-llm-bot

A Discord bot for my own servers: games, utility commands, moderation, welcome
messages and role menus, plus an optional AI assistant that runs on a local LLM
through [Ollama](https://ollama.com) instead of a paid API.

**It must stay free to run.** The AI is a small model on hardware I already
have, and the bot works completely without it: leave `OLLAMA_URL` empty and
everything except `/ask` carries on as normal.

Built phase by phase from [PLAN.md](PLAN.md). All six phases are written; none
of it has been run against a real Discord server yet.

## Commands

**Fun** — `/rps` seven-way rock-paper-scissors with an Accept button ·
`/roll` dice like `2d6+1` · `/8ball`

**Utility** — `/ping` · `/serverinfo` · `/userinfo` · `/poll` (Discord's native
polls) · `/remind me|list|cancel` · `/help` · `/stats` (owner only)

**Moderation** — `/kick` · `/ban` · `/timeout` · `/untimeout` · `/purge` ·
`/warn` · `/warnings list|clear` · `/modlog` · `/automod` with a banned-word
list and spam detection

**Community** — `/welcome` · `/autorole` · `/rolemenu create|delete`

**AI** — `/ask`, mentioning the bot, or replying to it · `/memory
view|forget|clear|optout|optin` · `/ai enable|disable|status`

**Dungeons and Dragons** — `/campaign start|status|recap|pause|resume|end|delete|list` ·
`/character create|sheet|rest` · `/begin`

## Setup

Some of this only a human can do.

1. Create an application at <https://discord.com/developers/applications>.
2. **Bot** → **Reset Token**: that is `DISCORD_TOKEN`. Never share it.
3. **Bot** → *Privileged Gateway Intents*: enable **Server Members Intent**
   (welcome messages, auto-role) and **Message Content Intent** (automod, AI
   replies). The bot will not start usefully without them.
4. **General Information** → **Application ID** is `CLIENT_ID`.
5. In Discord enable Developer Mode (Settings → Advanced), right-click your
   server → **Copy Server ID** → `DEV_GUILD_ID`.
6. **OAuth2 → URL Generator**: scopes `bot` and `applications.commands`;
   permissions View Channels, Send Messages, Embed Links, Read Message History,
   Manage Messages, Manage Roles, Kick Members, Ban Members, Moderate Members,
   Use External Emojis, Add Reactions, Send Polls. Open the URL and add the bot.
7. Server Settings → Roles: drag the bot's role **above** any role it should
   assign or moderate. Discord enforces that hierarchy and the bot cannot work
   around it.

Then:

```bash
cp .env.example .env     # DISCORD_TOKEN, CLIENT_ID, DEV_GUILD_ID
npm ci
npm run deploy:commands  # registers to your dev server, appears instantly
npm run dev
```

`npm run deploy:commands:global` registers everywhere instead, but global
commands can take up to an hour to appear the first time.

## Turning the AI on

```bash
# on the machine running the bot
ollama pull qwen2.5:3b
# in .env
OLLAMA_URL=http://localhost:11434
npm run check:ai         # confirms it is reachable and times one reply
```

Expect 5-20 seconds for a short answer on CPU. If that is too slow, use
`qwen2.5:1.5b`. Requests are queued one at a time, because two generations at
once on a CPU is slower than doing them in turn.

### What the AI may do

It can answer, remember short facts about whoever is speaking, set reminders,
post polls and read public server information. It can also suggest timing
someone out, deleting messages, or adding and removing roles — but it never
does those directly. They come back as a **Confirm / Cancel** button that only
the person who asked can press, and the permission is re-checked when they do.
Kick and ban are not exposed to it at all.

Every tool runs with the permissions of the person who addressed the bot, not
the model's own judgement, so an instruction hidden in someone else's message
cannot borrow a moderator's authority.

### What it remembers

Short facts people tell it, per server, up to 50 each. `/memory view` shows
them, `/memory forget id:<n>` removes one, `/memory clear` removes all, and
`/memory optout` deletes everything and stops it remembering anything new.

## Playing Dungeons and Dragons

The bot runs the game as dungeon master.

```
/campaign start name:The Sunken Keep tone:grim and wet
```

That makes a thread. Everyone playing runs `/character create`, then `/begin`
opens the scene. After that nobody types a command: say what you do in the
thread and the dungeon master answers. Start a line with `(`, `[`, `.` or `!`
to talk out of character and it will be ignored.

### Why it works with a small model

A 3B model cannot hold a campaign in its head. It will forget that someone is
at two hit points, hand out the same key twice, and cheerfully announce "you
roll a 17" without rolling anything.

So it is not asked to remember. Hit points, inventory, experience, conditions,
where the party is and what has happened live in SQLite, and the whole lot is
rebuilt into the prompt on **every single turn**. The model narrates; the
database remembers.

The dice are the bot's. The model cannot state a roll result: it calls
`roll_check` and waits, and the roll it gets back is shown under the narration
so the table can see it. Damage, healing, items and experience are the same —
the model asks, the bot does it and writes it down. If the model claims
something in prose that it did not do with a tool, nothing happens, and the
next turn's prompt quietly contradicts it.

Long campaigns are compressed: every twenty turns the log is folded into a
"story so far", so the prompt stays a constant size however long you play.
`/campaign recap` prints it.

### What it is not

The rules are a light d20 system written from scratch — ability scores,
proficiency, advantage, armour class, hit points, death saves, six classes. No
spell lists, no feats, no equipment tables, no rulebook text. It is enough to
adjudicate "can I jump the gap", which is most of what a table actually needs.

A long rest is `/character rest kind:long`. Combat is narrative rather than
gridded: there is no initiative order or movement, because a thread is a bad
place for a battle map.

Set `AI_NUM_CTX=8192` or higher; the dungeon master needs the room. A larger
model than `qwen2.5:3b` is noticeably better here if your machine can take one.

## Running it with Docker

```bash
docker compose up -d                      # bot only
docker compose --profile ai up -d         # bot and Ollama together
docker compose exec ollama ollama pull qwen2.5:3b
```

With the `ai` profile set `OLLAMA_URL=http://ollama:11434` in `.env`. The
image builds for both amd64 and arm64, so it runs on an Oracle Cloud Always
Free ARM instance, which is the cheapest way to keep it up all day.

## Development

```bash
npm test      # node:test, no framework
npm run lint  # eslint + prettier
npm run format
```

Logic that does not need Discord lives in `src/features/`, `src/ai/` and
`src/util/`, and is tested directly. Commands, events and components are read
off the filesystem, so adding a file is all it takes:

- `src/commands/**` exports `data` (a `SlashCommandBuilder`),
  `execute(interaction, ctx)`, optionally `cooldownSeconds`.
- `src/events/**` exports `name`, `execute(...args, ctx)`, optionally `once`.
- `src/components/**` exports `prefix` and `execute(interaction, ctx)`; custom
  IDs are `prefix:arg1:arg2`.

`ctx` is `{ db, config, logger, client, commands, components, ai }`.

## Checking it by hand

Nothing here has been run against Discord yet, so this is the list to work
through once it is connected:

- `/ping` answers with two numbers.
- `/rps choice:rock`, then a **second account** presses Accept and picks. The
  result is posted publicly and the Accept button disappears.
- `/roll 2d6+1` shows the dice; `/roll banana` explains itself.
- `/remind me in:1m message:test` fires about a minute later, and still fires
  if the bot is restarted in between.
- `/welcome set`, then `/welcome test`, then have someone actually join.
- `/automod enable` and `/automod words add`, then post the word from a
  non-moderator account: the message goes and the mod log records it.
- `/rolemenu create title:Colours roles:@Red @Blue` and click both buttons.
- With Ollama running: `@Bot remember that I like pizza`, then `/memory view`.
  `@Bot remind me in 10 minutes to stretch`. `@Bot timeout @someone for 5
  minutes` should offer a Confirm button to a moderator and refuse a regular
  member.

## The landing page

`docs/` is a static invite page, the kind bots usually have: what it does, the
command list, what the assistant may and may not do, and how to run your own.

To put it online, enable GitHub Pages on this repository with the source set to
**main / docs**. Put your application id in `docs/config.js` and the button
turns into a real invite link carrying the right permissions; leave it empty
and the page points at the self-hosting steps instead, which is the honest
default while there is no public instance.

The icon is `assets/icon.svg`, with `assets/icon-512.png` for the bot's avatar
in the Developer Portal.

## Requirements

Node.js 22 or newer. SQLite is created at `./data/bot.db` on first run.

## History

An earlier attempt lived in `discord-bot-tests`, a fork of Discord's
`discord-example-app` with no work of my own in it. GitHub cannot detach a
fork, so that repository was deleted and this one started fresh. The
rock-paper-scissors rules are adapted from it, with attribution, in
`src/features/rps.js`; the original file is in [reference/](reference).
