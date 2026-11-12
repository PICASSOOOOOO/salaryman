---
name: Autopilot per-domain owner prefs
description: How owner-tunable autopilot prefs are wired across all four domains (route dispatch, sanitize, handler read, UI editor)
---

All four autopilot domains (marketing, business_ops, crm_calls, accounting) now
have owner-tunable prefs stored in `autopilot_configs.prefs` jsonb. The contract
is identical per domain and MUST stay symmetric across these layers:

- **Schema** (`lib/db/src/schema/autopilot.ts`): a `XAutopilotPrefs` interface +
  `AUTOPILOT_DEFAULT_*` / `AUTOPILOT_MAX_*` (and MIN where relevant) bound consts.
- **Sanitizer** (`artifacts/api-server/src/lib/autopilot/<domain>-prefs.ts`): pure
  `sanitizeXPrefs` + `readXPrefs`, built on shared `prefs-utils.ts`
  (`clampIntPref`, `readBoolPref`). Garbage MUST degrade to the schema defaults.
- **Route** (`routes/autopilot.ts`): one `PREFS_SANITIZERS` map keyed by domain
  drives the PUT prefs merge-over-stored-then-sanitize. GET exposes option lists
  (marketing platforms/tones, crm leadStatuses) for the UI.
- **Handler**: reads `readXPrefs(ctx.config.prefs)` at the top and uses those
  values instead of module constants.
- **UI** (`artifacts/interview-helper/src/pages/Autopilot.tsx`): one editor
  component per domain, rendered conditionally by `cfg.domain`.

**Why:** the invariant is "OFF = manual-only, zero divergence, defaults reproduce
prior behavior." Exported handler consts kept by tests (e.g. `DEFAULT_STAFF_TARGET`,
`TASK_ADVANCE_PER_TICK`) were repointed to the schema defaults rather than removed.

**How to apply:** adding/changing a pref means touching ALL five layers in lockstep
+ run `pnpm run typecheck:libs` (composite db) before api-server sees new exports.
Tests live in `__tests__/autopilot.<domain>-prefs.test.ts`.
