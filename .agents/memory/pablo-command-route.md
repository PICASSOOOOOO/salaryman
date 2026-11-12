---
name: Pablo command route (duplicate handler)
description: Which /chat/pablo/command handler is live, and how Nebula memory works.
---

# Pablo `/chat/pablo/command` — duplicate route, only one wins

Two files define `POST /chat/pablo/command`: `routes/chat.ts` and `routes/pablo-command.ts`. In `routes/index.ts`, `chatRouter` is mounted **before** `pabloCommandRouter`, and Express runs the first match — so **`chat.ts` is the live handler and `pablo-command.ts` is dead code for this route.** Edit `chat.ts`; don't be fooled into editing `pablo-command.ts`.

**Why:** wasted effort risk — the obvious-looking standalone `pablo-command.ts` never executes for the authed terminal.

## Pablo "memory" model
- The Nebula voice terminal (`PabloTerminal.tsx`) calls `/chat/pablo/command`. The chat panel calls `/chat/pablo/message`. Both persist to the **same** per-user Pablo channel (`ensurePabloChannel`), so it's one unified conversation thread.
- Long-term memory note lives in `userMemoryTable` (one row/user) — edited via `/account/memory` + tools. It is only injected into a prompt where code explicitly loads it.
- `pabloPrivacyMode` (users table) is the gate: ON ⇒ session-only, read nothing personal, persist nothing; deletes existing history when toggled on. Always check privacy FIRST (minimal query) and **fail closed** (missing user row ⇒ treat as privacy ON) before reading profile/memory or writing.
