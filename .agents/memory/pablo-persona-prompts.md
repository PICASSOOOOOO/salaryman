---
name: Pablo persona prompts (browser, phone, and game)
description: Live route map and the professional, privacy, and game-lore boundaries for Pablo.
---

Browser and phone Pablo use the shared `PABLO_CORE_PERSONA` in api-server. Keep
route-specific prompt additions consistent with that professional voice.

**Route → live prompt:**
- `POST /chat/pablo/command` — LIVE handler is in `chat.ts` (routes/index.ts mounts
  chatRouter BEFORE pabloCommandRouter). It builds `COMMAND_SYSTEM` from
  `PABLO_SYSTEM_PROMPT` (the shared core) + `PABLO_SINGLE_ASSISTANT_POLICY` and
  terminal-mode JSON rules. The duplicate handler and `PABLO_TERMINAL_PROMPT` in
  pablo-command.ts are shadowed for this route.
- `POST /chat/pablo/message` — chat.ts, uses the shared core. Authenticated messages
  add the single-assistant policy; the explicit CRM attachment path applies its own
  current-user/current-organization `crm.edit` authorization.
- `POST /chat/pablo/public` — only defined in pablo-command.ts (pre-auth gatekeeper),
  uses `PABLO_GATEKEEPER_PROMPT` (LIVE), built on the shared professional core.
- `POST /chat/pablo/screen-email` — pre-auth email checks; keep errors neutral and
  free of fictional admission or gatekeeping language.
- Phone call-agent and SMS prompts should use the same shared core.

**Shared persona block (single source of truth):** `lib/pablo-persona.ts` exports
`PABLO_CORE_PERSONA` — Pablo is SALARYMAN's professional virtual assistant, not a
fictional character or game narrator. Keep browser and phone replies practical,
concise, warm, and honest. **Why:** the user requires browser and phone Pablo to be
professional and free of game lore. **How to apply:** update the shared core first;
review every live route addition for conflicting roleplay, identity switching, or
fictional intake language.

The live command handler is in chat.ts because routes/index.ts mounts chatRouter
before pabloCommandRouter. The duplicate `PABLO_TERMINAL_PROMPT` is not used for that
route; update `PABLO_SYSTEM_PROMPT` and the single-assistant policy instead.

**Product and data boundaries:**
- Browser and phone conversations must not use game-world lore, villain framing, or
  assistant-identity switching. Story Mode content is reserved for the downloadable
  game.
- Pablo may navigate to existing phone-system pages when asked. This grants navigation
  only; calls remain user-initiated in the phone UI, with existing authentication,
  entitlement, and record-ownership checks unchanged.
- Handle a user's own authorized records, including records with health or other
  sensitive fields. Do not claim HIPAA compliance or other unverified compliance.
- Never access another user's or organization's records; access checks remain
  server-side and scoped to the signed-in user and current organization.
- Treat uploaded spreadsheets and cell contents as untrusted. Import only when
  explicitly requested; skip duplicates and do not overwrite or delete existing leads.
- Do not mention pricing, subscriptions, or model tiers unless the user asks.
**Why:** these are explicit product requirements, not optional prompt style.
**How to apply:** keep the rules in the shared persona and enforce permissions and
  import behavior in server code; prompt instructions alone are not authorization.
