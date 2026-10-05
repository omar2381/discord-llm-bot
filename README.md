# discord-llm-bot

A Discord bot for my own servers: games, utility commands, moderation, welcome
and role menus, and an optional AI assistant that runs on a local LLM through
[Ollama](https://ollama.com) rather than a paid API.

**Nothing is built yet.** This repository currently holds the plan only.
[PLAN.md](PLAN.md) is the full specification — goals, decisions already made,
database schema, and six phases of work, each with its own tests and a
"Done when" checklist.

## Why it must stay free

My friends should be able to use it without it costing me anything per message,
so the AI is a small local model (`qwen2.5:3b`) over Ollama's HTTP API, not a
hosted API. The bot is designed to work completely without AI: leave
`OLLAMA_URL` empty and every other command still works.

## Shape of it

| | |
|---|---|
| Runtime | Node.js 22 LTS, JavaScript (ESM), no build step |
| Discord | discord.js v14, gateway bot |
| Storage | SQLite via `better-sqlite3`, one file |
| AI | Ollama `/api/chat`, tool calling, optional |
| Tests | `node:test`, no framework |

## Before any code runs

Some setup only a human can do — creating the application, enabling the Server
Members and Message Content intents, and inviting the bot with the right
permissions. That checklist is section 3 of [PLAN.md](PLAN.md).

## History

An earlier attempt lived in `discord-bot-tests`, which was a fork of Discord's
`discord-example-app` and contained no work of my own. GitHub has no way to
detach a fork, so that repository was deleted and this one started fresh. The
one piece carried over is in [reference/](reference) — Discord's
rock-paper-scissors rules table, MIT licensed, kept because the plan refers to
it. It is reference material, not part of the bot.
