---
name: Bot Autopilot foundation
description: How the autopilot framework is shaped so the 4 domain behaviors (Business Ops/Marketing/CRM & Calls/Accounting) plug in without diverging from manual paths.
---

# Bot Autopilot foundation

The framework lets a Pixel Agent auto-run an org business domain. It is strictly
ADDITIVE: a missing config row == disabled == today's manual-only behavior.

## The contract every domain handler must obey
A handler does its work by calling the **same service functions the manual
screens call** — never re-implemented inline. That is the only thing that keeps
"a bot can't do anything a human in that seat couldn't" true and makes OFF a
clean revert. If a manual route still has logic inlined in the Express handler,
extract it to a callable service first. Full doc lives in
`artifacts/api-server/src/lib/autopilot/CONTRACT.md` — read it before building a
domain task.

## How a domain plugs in
- Implement an `AutopilotHandler` and `registerAutopilotHandler(domain, fn)` at
  boot. There is ONE scheduler — domains do NOT schedule themselves.
- Foundation ships no-op handlers that log a `noop` activity each tick so the
  feed proves the pipeline is alive.

## Scheduler model (important)
ONE recurring base tick (60s) evaluates all enabled configs and runs those whose
per-config `cadenceMinutes` has elapsed since `lastRunAt`. Do NOT create
per-config intervals. `lastRunAt` is stamped BEFORE the handler runs so a
slow/failing handler can't double-fire next tick. A module-level reentrancy guard
prevents overlapping passes.

## Guardrails are centralized on the ctx, not the handler
The engine resolves the bot + the **org owner** (org.ownerUserId) — the owner's
entitlement and API-credit balance gate paid work, not the bot. Handlers call
`ctx.claimAction()` (per-tick cap), `ctx.ensureEntitlement()` (claw_bot/PRIME),
`ctx.ensureCredit()` (canUseApiFeatures preflight) — each logs a `blocked` entry
and returns false instead of throwing.

**Why:** mirrors the gates the manual paths already enforce (PRIME gating, Pablo
tax). Keeping them on the ctx means every future domain handler can't forget one.

## Access control
Config read/write gated by the `autopilot.manage` org permission key
(DEFAULT_PERMISSION_MIN_ROLE = manager) via `canDoInOrg`. Owner always passes.

## Surfaces
Schema: `lib/db/src/schema/autopilot.ts` (configs + activity log, domain consts).
Service lib: `artifacts/api-server/src/lib/autopilot/`. HTTP: `routes/autopilot.ts`
(`GET /api/autopilot`, `PUT /api/autopilot/:domain`). UI: `/business/autopilot`.
Logged-out hits the new-user funnel → bounced to /pablo (not a routing bug).
