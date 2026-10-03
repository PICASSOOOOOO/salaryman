---
name: Pablo automation foundation
description: Product direction and execution/access rules for Pablo Prime's paid automation domains.
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
A successful paid Prime activation automatically enables the four currently
supported workflows. Users can pause any workflow; payment-event retries must not
overwrite existing config rows or undo saved pauses. Scheduled runs remain gated
by the organization's active paid `claw_bot` entitlement, and run without
per-action approval after activation.

**Why:** the user explicitly chose automatic activation of all four workflows as
part of the paid Prime feature, while retaining the ability to stop workflows
they do not want.

**How to apply:** start missing configs only after a successful paid checkout;
preserve existing settings and pauses, and enforce paid access at control APIs
and again in the background scheduler. Browser and future desktop controls share
the same server-side schedules rather than running parallel automation engines.

## Automation catalog and income direction
The intended catalog extends beyond the first four domains: creative work,
communication, consent-based telemarketing, permitted web research/scraping,
app/site/downloadable-game construction, data and database management, office
decor, and broader business workflows. Bot-based income generation should be
optional and is a top product priority; users need a trustworthy path to receive
verified earnings from their bots.

**Why:** the user said the initial four domains are not enough and identified
optional user income from bots as paramount.

**How to apply:** ship each category as a real supported capability, not a
placeholder. Reuse the existing consent and authoritative settlement rules;
make income workflows optional and never promise guaranteed earnings.
