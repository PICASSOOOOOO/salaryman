---
name: Land claiming + approval-gated construction
description: How the land/construction/labor system enforces its hard rules and stays concurrency-safe (api-server routes/land.ts + lib/db land-construction schema + LandRegistry page).
---

# Land claiming + approval-gated construction + labor

Feature surface: `artifacts/api-server/src/routes/land.ts` (mounted in routes/index.ts
BEFORE realEstateRouter), `lib/db/src/schema/land-construction.ts`
(land_plots / construction_projects / construction_labor_log), client page
`artifacts/interview-helper/src/pages/LandRegistry.tsx` (route `/world/land` behind
GameLock; entry button in WorldMenu header).

## Hard rules (do not weaken)
- **Two-step gate**: a plot is `claimed` by any player, then OPENED (`status: open`,
  stamps `approvedBy`) ONLY by game owner / Picasso admin (`canApprove` =
  `isOwnerEmail || isPicassoOrgMemberEmail` via users.email — the codebase's
  canonical authz; intentionally reused per the task spec).
- **A city building is created in exactly ONE place**: the `/construction/:id/work`
  completion branch, and only after re-checking `plot.approvedBy` is set and status
  is building/open. `construct` rejects any plot not `open`. Never add another
  cityBuildings insert path for plots.
- **Labor model = "Both"**: debtors (player_ledger.debt > 0) work off debt (debt
  reduced, no fiat), everyone else earns a fiat wage. Queued→in_progress promotion
  is ordered by owner debt DESC (debt-holders' builds first).

## Concurrency model (why the advisory locks exist)
**Why:** every GET /land/plots and /construction/projects calls `tickConstruction()`,
so concurrent requests genuinely race. Earlier version could over-promote past
MAX_ACTIVE_PROJECTS and could deadlock release-vs-work (opposite plot/project row-lock
order).
**How to apply:**
- Scheduler tick takes `pg_advisory_xact_lock(2,0)` first AND the promotion UPDATE is
  guarded `WHERE status='queued'`. Keep both — either alone is insufficient.
- Every path touching a plot + its project (`claim`/`release`/`construct`/`work`)
  takes `pg_advisory_xact_lock(1, plotId)` BEFORE any row `for("update")`. `work`
  must pre-read the project's plotId (no lock) to know which plot to lock first.
  If you add a new plot-mutating route, take the plot advisory lock first or you
  reintroduce the deadlock.

## Gotcha
- `/world/land` screenshots while logged-out render the Pablo funnel gate, not the
  page (see newuser-funnel-gate.md). Not a routing bug.
- Build gates on typecheck; verify per-package (`pnpm --filter ... run typecheck`),
  full repo typecheck exceeds the 2-min tool cap.
