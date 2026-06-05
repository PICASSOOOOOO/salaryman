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

## Lockout guard (important)
`org.settings` (who can edit the matrix) is FLOORED at `director` on the PUT route
**Why:** without it, an admin could raise `org.settings` above their own role and
permanently lock the org out of its own settings. The owner override in
`canDoInOrg` is the other half of the safety net — keep both.

## Org aggregation faithfulness
For multi-user tax estimates, `computeTaxEstimate` only reads
`report.summary.{totalRevenue,totalPayroll,totalBills,totalExpenses}` + `asOf`, so
the org path sums member summaries and feeds them as income/expense OVERRIDES with
`report=null` (rather than building a fake AccountingReport). Known cosmetic:
that path reports `attached=false` even though it is book-derived.
