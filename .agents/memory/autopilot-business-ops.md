---
name: Business Ops autopilot domain
description: How the business_ops autopilot handler reuses manual service logic and what its per-tick decisions are.
---

# Business Ops autopilot (domain handler)

First concrete domain on top of the Bot Autopilot foundation. Registered as
`registerAutopilotHandler("business_ops", …)` in `index.ts` BEFORE
`startAutopilotScheduler()` (handlers must be registered before the scheduler
boots or the first ticks hit the no-op default).

## Service-reuse convention (the load-bearing rule)
Business-ops + hiring route logic was extracted into `lib/business-ops-service.ts`
and `lib/hiring-service.ts`. The autopilot handler and the Express routes both
call these — neither re-inlines flow logic.
**Why:** the autopilot CONTRACT requires "a bot can't do anything a human in that
seat couldn't"; sharing one service fn is the only thing that keeps OFF a clean
revert with no data divergence.
**How to apply:** any future change to task/time-entry/announcement/hiring flow
must edit the SERVICE fn, never re-add logic to the route or the handler. The
full stage-transition + webhooks + auto-staff-on-hire lives in
`hiring-service.updateApplicant`.

## Org-scoping
All business/hiring tables are keyed by `userId`, but autopilot is org-scoped, so
the handler acts on `ctx.ownerId` (the org owner's userId). No paid AI — content
is templated — so the only guardrail needed is `ctx.claimAction()` (per-tick cap).

## Per-tick decisions (pure helpers, unit-tested)
Decision logic is factored into pure helpers in `business-ops-handler.ts`
(tested in `__tests__/autopilot.business-ops.test.ts`); the handler only wires
them to services + ctx:
- Tasks: flow todo→in_progress→review→done; advance the N oldest-touched
  non-done tasks per tick (TASK_ADVANCE_PER_TICK=2); done sets completedAt.
- Time entries: close only PRIOR-day still-active entries (never today's live
  session) with clockOut 23:59.
- Staffing is CAPACITY-DRIVEN by OPEN job listings, NOT a hardcoded headcount.
  Each open requisition = one unfilled seat; the bot fills it and never hires
  beyond it. ONE step/tick: advance the furthest non-terminal applicant on an
  open seat toward hired (hired auto-creates staff row) → else source ONE
  candidate for an open seat that has no non-rejected applicant (so at most one
  hire per requisition) → else, only when there are ZERO open reqs AND the team
  is below the DEFAULT_STAFF_TARGET=5 baseline FLOOR, open one new req (logged as
  fallback). **Why:** a fixed target over/under-hires vs real office capacity;
  there is no per-org seat-capacity column, so open listings are the only real
  "configured limit" signal (matches the manual Hiring screen).
- Announcements: rate-limited to one per ANNOUNCEMENT_INTERVAL_MS (6h),
  category "operations", authorName = bot name.
