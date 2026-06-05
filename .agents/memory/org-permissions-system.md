---
name: Org permissions system
description: How per-org permissioned cross-user data sharing works (the org permissions matrix) and the rules to respect when extending it.
---

# Org permissions (cross-user data sharing)

Per-org access policy that governs when one member may CROSS-USE another member's
data inside an org. It generalizes the pre-existing door-lock `minRole` pattern.

## Model
- Each shareable capability is a permission KEY (e.g. `finance.view`,
  `finance.export`, `tax.view`, `crm.view/edit`, `members.view/manage`,
  `billing.manage`, `org.settings`). Catalog + UI metadata + defaults live in the
  db schema (`ORG_PERMISSION_KEYS`, `ORG_PERMISSION_META`,
  `DEFAULT_PERMISSION_MIN_ROLE`, `orgPermissionsTable`).
- Policy = defaults overlaid by `org_permissions` rows. A key with NO row uses the
  default, so a fresh org works with zero setup. To add a key: extend the catalog
  trio in lockstep (keys + meta + default) or the matrix renders an undefined row.

## Enforcement (server-authoritative)
- `canDoInOrg(userId, orgId, key)` is the single decision: owner always passes;
  otherwise the caller must have an ACTIVE membership whose role rank
  (`hasRoleAccess`) meets the configured `minRole`. Never trust a client flag.
- Cross-user reads go through a scope resolver (see tax routes): `scope=org`
  aggregates every active member's data ONLY after `canDoInOrg` passes; default/
  personal scope never crosses user boundaries.

## Which keys are actually WIRED (rest are policy-declared only)
- `finance.view` / `tax.view` / `finance.export` → tax routes (enterprise.ts).
- `crm.view` → the 3 CRM read routes (crm.ts).
- `members.manage` → the member-ROSTER mutation routes only (invite, POST add,
  PUT update, DELETE non-self) in organizations.ts. The many OTHER `manager`
  gates in that file are distinct features (org settings, departments, billing,
  phone, etc.) — do NOT blanket-wire them to `members.manage`.
- Defaults are behavior-preserving: `crm.view`=specialist (== old "any member"),
  `members.manage`=manager (== old hardcoded `hasRoleAccess(manager)`), so a fresh
  org behaves identically until an admin customizes the matrix.
- `crm.edit` / `members.view` / `billing.manage` are catalog entries with NO live
  enforcement point yet (e.g. CRM has no user-facing write route — leads come from
  the telephony engine). They are reserved; the matrix still lets orgs set policy.

## Owner-override pitfall when resolving org context (important)
**Why:** `canDoInOrg` has an owner fallback for missing/odd member rows, but a
route that PRE-GATES on `getCallerOrg` (active-membership-only) and 403s before
calling `canDoInOrg` silently defeats that fallback.
**How to apply:** resolve the orgId in a way that includes owned orgs
(`resolveCrmOrgId` pattern: active membership → else org you OWN), then delegate
the allow/deny decision entirely to `canDoInOrg`. Don't add a separate pre-gate
that can contradict it.

## Lockout guard (important)
`org.settings` (who can edit the matrix) is FLOORED at `director` on the PUT route
**Why:** without it, an admin could raise `org.settings` above their own role and
permanently lock the org out of its own settings. The owner override in
`canDoInOrg` is the other half of the safety net — keep both.

## Org aggregation faithfulness
For multi-user tax estimates, `computeTaxEstimate` only reads
`report.summary.{totalRevenue,totalPayroll,totalBills,totalExpenses}` + `asOf`, so
the org path sums member summaries and feeds them as income/expense OVERRIDES with
`report=null` (rather than building a fake AccountingReport), then forces
`attached=true` on the merged result since the totals ARE book-derived (the flag
otherwise reads false because no single report object is attached).
