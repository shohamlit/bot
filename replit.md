# Discord Bot

A Node.js JavaScript Discord bot built with discord.js v14.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — run the bot locally
- Required env: `DISCORD_TOKEN` — your Discord bot token

## Stack

- Node.js 24, JavaScript (ESM)
- discord.js v14

## Where things live

- `artifacts/api-server/src/index.js` — bot entry point

## Architecture decisions

- Plain JavaScript (no TypeScript) per user preference
- ESM modules (`"type": "module"`)

## Product

A Discord bot. Code to be provided by the user.

## User preferences

- JavaScript only, no TypeScript
- Clean/minimal starting point

## Gotchas

- Set `DISCORD_TOKEN` as an environment secret before starting the bot

## Pointers

- See the `pnpm-workspace` skill for workspace structure details
