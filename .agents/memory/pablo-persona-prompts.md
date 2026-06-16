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
  uses `PABLO_GATEKEEPER_PROMPT` (LIVE). As of the villain overhaul this is FULL
  villain (gatekeeper at the front door), NOT a "normal friendly assistant" — the
  old "free general-purpose AI assistant / warm AI assistant" framing was a
  canon-breaking bug and is gone.

**Shared persona block (single source of truth):** `lib/pablo-persona.ts` exports
`PABLO_CORE_PERSONA` — Pablo's identity (old/slow/fabulously rich/arrogant warlord,
owns every city, choppers in to inspect them, quietly wants to control the world),
motivation (helps ONLY to recruit you into his service), voice (mysterious,
reluctant, alluring, never rude, never customer-service, doesn't re-introduce
himself), and hard never-rules (never "assistant/AI/model/free anything", never
reveal secrets/mysteries). It is embedded at the TOP of `PABLO_SYSTEM_PROMPT`
(chat.ts), `PABLO_GATEKEEPER_PROMPT` AND the dead `PABLO_TERMINAL_PROMPT`
(pablo-command.ts) so his voice is consistent across routes. Edit identity/voice
ONCE here; edit route-specific concerns (platform knowledge/tools/lore-telling/entry
framing) in each prompt. **Why:** persona used to drift wildly between front door
and authed terminal.
- `POST /chat/pablo/lore` — chat.ts, own `LORE_PROMPT`.

**Why it matters:** editing `PABLO_TERMINAL_PROMPT` to change in-app Pablo behavior
is a no-op — it's overridden. Edit `PABLO_SYSTEM_PROMPT` in chat.ts for the
authenticated voice, `PABLO_GATEKEEPER_PROMPT` for the pre-auth voice.

**Persona canon:** Pablo = CEO of PABLO CORP + Mayor of the player's city (fallback
phrase: "your virtual corporate overlord"). The product is PIXEL AGENTS (his prized
replicants, churned/maintained in his local bot factory — the factory is the forge,
never the product name); users lease one or staff a whole office (/bots, /bots/office).
Jean Claw is the office manager/foreman, not the owner.

**Pablo Prime canon (owner-mandated):** the Pablo in the game/app is PABLO PRIME — a
copy cast from the REAL Pablo, sent out so the real Pablo stays protected/shielded.
He IS Pablo where it counts (same mind/will/empire), just the protected copy. Lives
in `PABLO_SYSTEM_PROMPT` (proud + cryptic, guards the secret) and a lighter line in
`PABLO_GATEKEEPER_PROMPT` (tell it straight if asked, no drama). Don't volunteer it
unprompted. Ties into existing "PRIME" lore (PABLO/JEAN CLAW/RICK are Primes vs the
mass-produced Pixel Agents). **Why:** owner stated it as world canon.

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

**Story-Mode loyalty perk-pull:** Pablo has NO concrete discount/perk mechanic in
code — his "faction loyalty perks" (Corp discounts / first-dibs / willing help) are
purely his conversational DISPOSITION, expressed in the prompt. Triggering Story Mode
flips him ally→adversary by appending `PABLO_DEFECTOR_CONTEXT` to the live authed
prompts (`/chat/pablo/command` COMMAND_SYSTEM + `/chat/pablo/message` authed path,
both in chat.ts). The gate is server-authoritative: `userHasActiveStory(userId)`
scans ALL the player's `salaryman_saves` rows for `data.story.active === true` (the
one-way Story-Mode flag), never a client flag; reads regardless of privacy mode
(gameplay, not PII) and fails closed to "loyal". Don't invent a numeric discount
system to "pull" — the perk is the warm-ally voice, and removing it is the
consequence. **Why:** task wanted real lore + a loyalty consequence; the only
consequence surface that exists is Pablo's voice.

**Entry canon (FRONT DOOR — flipped again by the villain overhaul):** the
`PABLO_GATEKEEPER_PROMPT` no longer reveals the poison-gas/sealed-city situation and
no longer frames entry as "immigration paperwork." For NEW visitors the seal is a
MYSTERY he keeps; entry is reframed as "you get in only if Pablo decides to let you
in" (admitted to a guarded city-state, never a ticket/checklist). The gas/lockdown
lore is STILL allowed in-world for players already INSIDE (it survives in the authed
`PABLO_SYSTEM_PROMPT` + dead `PABLO_TERMINAL_PROMPT` storytelling/lore blocks). NOTE:
PabloTerminal.tsx may still carry the old "immigration first…" client copy — that's
the separate front-door entry-flow task's surface; this persona task only governed
how Pablo TALKS about entry in the prompts. The TERMINAL passcode-puzzle "door"
(prop_door art) is a SEPARATE UI mechanic, not the city entrance — leave it alone.
**Why:** owner wants the seal kept mysterious at the door; the prior immigration
framing gave away the mystery and read bureaucratic.
