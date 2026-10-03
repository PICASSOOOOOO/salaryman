---
name: Pablo automation foundation
description: Product direction and execution/access rules for Pablo Prime's four opt-in business automation domains.
---

# Pablo automation foundation

The framework lets Pablo Prime run an organization's enabled business domains.
A missing config row or `enabled=false` means manual-only behavior.

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
The engine resolves the **org owner** (org.ownerUserId). Owner entitlements and
Pablo's assistant battery gate paid AI work; owner exemptions and the existing
assistant-battery seeding behavior are preserved. Handlers call
`ctx.claimAction()` (per-tick cap), `ctx.ensureEntitlement()` (claw_bot/PRIME),
and `ctx.ensureCredit()` (assistant battery) — each logs a `blocked` entry and
returns false instead of throwing.

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

## Product direction
For now, all four supported domains run under Pablo Prime; do not expose per-domain
bot assignment. Keep a future split into individual agent bots as a deliberate
extension rather than letting legacy bot IDs influence current runs.

**Why:** the user specified this product direction.

**How to apply:** current automation is grouped under Pablo. Any later per-domain
agent ownership is a separate product change with explicit routing and guardrails.

## Activation and paid access
Each domain stays off until a user enables it once. After that, Pablo runs it on
schedule without per-run approval, but only while the organization's owner has
the active paid `claw_bot`/Pablo Prime entitlement. Do not auto-enable domains.
Settings beyond that opt-in are optional; server defaults must work without
requiring users to configure unrelated domains. Browser and future desktop
surfaces should control the same server-side schedules rather than run parallel
automation engines.

**Why:** the user chose one-time opt-in for a paid feature and wants automation
only where people choose it, without unwanted setup or actions.

**How to apply:** enforce paid access at control APIs and again in the background
scheduler; preserve the saved opt-in if access lapses, but block unattended runs.
Keep each domain independently optional, with no per-run approval or local
desktop scheduler.
