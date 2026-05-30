---
name: Pablo persona prompts (live vs dead)
description: Which Pablo system-prompt string is actually live for each /chat/pablo/* route, so persona edits land in the right place.
---

Pablo's in-character voice is driven by LLM system-prompt strings in api-server.
There are duplicate route handlers across two files; mounting order decides which
prompt is live.

**Route → live prompt:**
- `POST /chat/pablo/command` — LIVE handler is in `chat.ts` (routes/index.ts mounts
  chatRouter BEFORE pabloCommandRouter). It builds `COMMAND_SYSTEM` from
  `PABLO_SYSTEM_PROMPT` (chat.ts) + terminal-mode JSON rules. The
  `PABLO_TERMINAL_PROMPT` in pablo-command.ts is DEAD for this route.
- `POST /chat/pablo/message` — chat.ts, uses `PABLO_SYSTEM_PROMPT`.
- `POST /chat/pablo/public` — only defined in pablo-command.ts (pre-auth gatekeeper),
  uses `PABLO_GATEKEEPER_PROMPT` (LIVE). Deliberately a "normal friendly assistant,
  not a character actor" — do NOT force the CEO/Mayor mogul persona here.
- `POST /chat/pablo/lore` — chat.ts, own `LORE_PROMPT`.

**Why it matters:** editing `PABLO_TERMINAL_PROMPT` to change in-app Pablo behavior
is a no-op — it's overridden. Edit `PABLO_SYSTEM_PROMPT` in chat.ts for the
authenticated voice, `PABLO_GATEKEEPER_PROMPT` for the pre-auth voice.

**Persona canon:** Pablo = CEO of PABLO CORP + Mayor of the player's city (fallback
phrase: "your virtual corporate overlord"). The product is PIXEL AGENTS (his prized
replicants, churned/maintained in his local bot factory — the factory is the forge,
never the product name); users lease one or staff a whole office (/bots, /bots/office).
Jean Claw is the office manager/foreman, not the owner.
