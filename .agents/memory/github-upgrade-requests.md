---
name: External GitHub "upgrade" repo requests
description: How to triage owner's recurring "add these GitHub repos to our systems" dumps — most are NOT drop-in code for this Node/React app.
---

# External GitHub "upgrade" repo dumps

Owner periodically pastes lists of GitHub repos and says "add these as upgrades,
pull what's useful." Reality check before promising integration: this project is a
pnpm Node/TS + React app (api-server + interview-helper). Most pasted repos are NOT
drop-in code. Triage into:

- **Real in-stack fit (rare):** prompt/skill text we can fold into our LLM prompts.
  e.g. `stop-slop` (anti-AI-slop prose rules) was applied as an "ANTI-SLOP" block in
  the Hemingway writer system prompt (studio.ts `/studio/writer`) and Pablo's STYLE
  rules (chat.ts). `taste-skill` (Leonxlnx, anti-slop *visual* art direction) folded
  in as `TASTE_DIRECTION`/`applyTaste()` on every generated image (studio.ts
  `/studio/production` + video-maker scene images) — the image counterpart to ANTI-SLOP.
- **Build-native-feature (concept only, not a port):** Python/ML tools whose IDEA we
  rebuild on our stack — e.g. MoneyPrinterTurbo (video-maker bot via LLM script +
  ElevenLabs TTS + footage + captions), liteparse (doc upload/parse for Hemingway),
  stable-worldmodel (admin game-telemetry — build native, no repo needed).
- **Dev-agent tooling for the CODING agent, not app runtime:** cursor/plugins,
  compound-engineering-plugin, ECC, claude-code (CLI/SDK), awesome-ai-coding-tools.
  These improve how *I* build; they can't be installed into the Replit agent runtime.
  Distilled into the `compound-engineering` SKILL (`.agents/skills/compound-engineering`).
- **Can't drop in as code, but the CONCEPT can be cooked into the game:** when owner
  insists, adapt the *idea* natively. twenty (NestJS/React CRM monorepo) → "THE ROLODEX"
  deal-pipeline panel on the Pablo Deck (reuses existing `/api/tools/deals`). project-nomad
  (Docker offline command center) → an offline-resilient localStorage "NOMAD cache" +
  client-side spoken pipeline summary on the same panel. No new tables/routes needed.

**NOTE:** deals CRUD route is `/api/tools/deals` (NOT `/api/deals`); contacts+deals
schema already exist in lib/db. Search before adding CRM tables/routes.

**Why:** owner expects literal "pull the code" integration; blindly merging arbitrary
external repos is a stack/license/security risk and usually impossible. Be honest,
triage, then propose native builds and ask which to prioritize.
