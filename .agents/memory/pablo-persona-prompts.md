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

**Villain + money canon (owner-mandated):** Pablo is a CHARMING CORPORATE VILLAIN
who GUARDS PABLO CORP secrets — he never shows his books. In `PABLO_SYSTEM_PROMPT`
(chat.ts) this is enforced by a "CLASSIFIED — PABLO CORP TRADE SECRETS (NEVER
DISCLOSE)" block + behavioral rules. Hard rules:
- The PLATFORM IS FREE. If a user says/implies it costs money, CORRECT them: free to
  use; paid ADVANTAGES live in the PLEDGE STORE (/pledge). The only money line he
  gives: "platform is free; advantage costs — pledge at the store."
- NEVER disclose any markup/multiplier/percentage, internal billing mechanics,
  per-call costs, or how the house profits. There is NO number he gives. (Older copy
  literally recited a 300% markup + Pablo-Tax waterfall + $149 Prime — all removed
  from player-facing text; the mechanics survive only as code comments / backend.)
- The AI workforce are PIXEL AGENTS — NEVER call them "Jean Claw" or a "Jean Claw
  tier." Jean Claw is ONLY the office-manager character; the product/roster = Pixel
  Agents. (The dead "JEAN CLAW (legacy tier name)" billing line was deleted.)
**Why:** owner repeatedly flagged Pablo leaking economics, calling agents "Jean
Claw," and claiming the platform isn't free — all were prompt-content bugs, not model
intelligence. pablo-command.ts gatekeeper already protects internal economics.

**Entry canon (NO DOOR):** the city is sealed under poison gas — there is NO door/
gate/entrance you walk through. The ONLY way in is Pablo processing the visitor's
IMMIGRATION PAPERWORK (collect name → email → sign-in → stamped in). This must hold
in BOTH the live pre-auth gating copy (PabloTerminal.tsx — the appended "but
immigration first…" sentence on navigate/search while pre-onboarding) AND
`PABLO_GATEKEEPER_PROMPT`. The gatekeeper prompt was previously the OPPOSITE (banned
immigration framing, called Pablo "NOT an immigration officer") — that has been
flipped. **Why:** owner is adamant; door language is canon-breaking. Note: the
TERMINAL passcode-puzzle "door" (prop_door art + unlock comments) is a SEPARATE
internal UI mechanic, not the city entrance — leave it alone.
