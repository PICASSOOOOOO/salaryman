# SALARYMAN by Picasso.ai

SALARYMAN is the central component of **THE PICASSO PLATFORM**, an AI-powered executive productivity platform. It unifies business operations through integrated AI agents, communication tools, creative suites, and CRM functionality — wrapped in a persistent, multiplayer game world.

## Highlights

- **Pablo** — a free AI assistant (animated 3D mascot with a 2D fallback).
- **Pixel Agents** — purchasable, configurable AI bots sold inside the Pledge Store.
- **Persistent game world** — 13-month calendar, 4-season weather, day/night cycles, interactive interiors, and NPCs.
- **Creative suites** — AI image generation, design studio, audio stem editor, video intelligence, and music production.
- **Business tooling** — CRM with telephony, hiring pipeline, accounting, org roles, and autopilot automation.
- **Real-time comms** — WebRTC video, proximity voice chat, in-game phone, and app-wide WebSocket chat.

## Tech Stack

- **Runtime:** Node.js 24, pnpm workspace monorepo
- **Language:** TypeScript 5.9
- **Backend:** Express 5, PostgreSQL (Drizzle ORM), Zod, OpenAPI 3.1 codegen (Orval)
- **Frontend:** React + Vite + Tailwind CSS
- **Auth:** Replit Auth (OIDC)
- **AI/Media:** ElevenLabs / OpenAI TTS, Nano Banana, Replicate

## Monorepo Structure

```
artifacts/
  interview-helper/   # Web app (React + Vite + Tailwind) — the SALARYMAN client
  api-server/         # Express 5 API server (/api prefix)
  mockup-sandbox/     # Component preview server
lib/                  # Shared packages (db, etc.)
scripts/              # Tooling and maintenance scripts
```

## Getting Started

```bash
pnpm install

# Run the API server
pnpm --filter @workspace/api-server run dev

# Run the web client
pnpm --filter @workspace/interview-helper run dev
```

## Configuration

The app reads its credentials from environment variables (managed as Secrets on Replit — they are **not** committed to this repo). To run elsewhere you will need to provide your own values. See `artifacts/api-server/docs/required-secrets.md` for the full inventory of external credentials and what each one unlocks.

## License

Proprietary — © Picasso.ai. All rights reserved.
