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
  rules (chat.ts).
- **Build-native-feature (concept only, not a port):** Python/ML tools whose IDEA we
  rebuild on our stack — e.g. MoneyPrinterTurbo (video-maker bot via LLM script +
  ElevenLabs TTS + footage + captions), liteparse (doc upload/parse for Hemingway),
  stable-worldmodel (admin game-telemetry — build native, no repo needed).
- **Dev-agent tooling for the CODING agent, not app runtime:** taste-skill,
  cursor/plugins, compound-engineering-plugin, ECC, claude-code (CLI/SDK). These
  improve how *I* build or could become skills; they are not features inside SALARYMAN.
- **Cannot drop in:** full platforms (twenty = whole NestJS/React CRM monorepo) and
  Docker-only self-hosted apps (project-nomad — Replit can't run Docker).

**Why:** owner expects literal "pull the code" integration; blindly merging arbitrary
external repos is a stack/license/security risk and usually impossible. Be honest,
triage, then propose native builds and ask which to prioritize.
