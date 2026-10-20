---
name: Verified real-salary wage
description: How the in-game verified-salary hourly FIAT wage accrues and is verified
---

# Verified real-salary wage

## Product requirement: paid wages must be confirmed

Real-world payroll must not count toward player progression merely because a
monthly salary was declared or an employer relationship was verified. The
organization owner must confirm that the wages were actually paid. Keep
real-world payroll progress separate from in-game job wages and purchased
income.

**Why:** the user requires game progression to reflect actual work and explicitly
requires org-owner confirmation that real-world wages were paid.

**How to apply:** before using a real-world salary signal for XP, skill points,
or other progression, verify a paid payroll event and its owner confirmation.
The current `incomeVerified` declaration/qualification flow is not sufficient
evidence of individual wages paid.

A player whose real-world monthly salary is VERIFIED earns `floor(monthly/720)` ƒ
per WHOLE REAL-world hour (720 = 30d × 24h), credited as spendable FIAT checking.

- Accrual engine: `artifacts/api-server/src/lib/verified-salary.ts`. Pure
  `accrueWholeHours(lastMs, now, hourlyRate)` (unit-tested) + `claimVerifiedSalary(userId)`
  tx engine. Cursor = `player_ledger.verifiedSalaryLastClaimAt`; advances by whole
  hours only → idempotent under polling; sub-hour remainder rolls forward. First
  touch anchors cursor + pays 0; unverified never sets cursor + pays 0.
- **Why FIAT, never Gold:** the existing Gold-only cash-out gate makes FIAT
  non-withdrawable to real money — spendable in-game, not cashable. Don't switch
  the credit currency.
- **Cadence is REAL time** (`Date.now()`), NOT the in-game day/night clock. This
  is the whole point of the task — don't tie it to game-clock hours like the
  unemployment stipend (claimSalary in salary.ts) does.
- Verified monthly salary source = latest `world_businesses` row that is
  `businessType='real' AND incomeVerified=true`, its `declaredMonthlyIncome`.

## Two verification paths (both = world_businesses.incomeVerified)
1. Automated payroll provider (Gusto/ADP) sets it at registration.
2. Admin qualification portal: `GET /api/admin/salary-qualifications` (real,
   incomeVerified=false, declaredMonthlyIncome>0, meta.qualificationStatus≠rejected)
   + `POST /api/admin/salary-qualifications/:id/decide {approve}`. Approve flips
   incomeVerified=true + stamps ownerVerifiedAt/By(admin) + clears pending (re-check
   incomeVerified=false in WHERE → 409 on double-submit). Reject sets
   meta.qualificationStatus='rejected' (jsonb `||` merge, preserves other keys).
   Mirrors org-owner attestation in /world/verify-business-salary but admin-authority.

## Surfaces
- Route: `POST /api/economy/verified-salary/claim` (economy.ts) — matched by
  FIAT_AFFECTING regex (economy|salary), so HUD refreshes.
- Hook: `useVerifiedSalary.ts` polls 60s, emits +ƒ pay events (real-hour cadence
  so a fast poll is unnecessary).
- HUD: PabloOffice top-right, blue "SALARY ƒX/HR · NEXT ƒ IN Nm" block under the
  green stipend WALLET block. Hidden until verified.
- Admin UI: AdminPanel 'salaryqual' tab (Wallet icon, badge=queue length).

## "Awaiting work visa" status (unverified real-business owners)
- claimVerifiedSalary now also returns `awaitingVerification` /
  `pendingMonthlySalary` / `pendingHourlyRate` (computed from the most-recent
  real business with `incomeVerified=false`, via `getPendingMonthlySalary`).
  awaitingVerification = `!verified && pendingMonthly > 0`. These are display-only
  signals — an unverified owner still earns ONLY the unemployment stipend
  (500ƒ/hr) until verified; no salary is paid while awaiting.
- **Narrative framing (HARD):** an unverified real-business owner is presented as
  "LEGALLY UNEMPLOYED · WORK VISA PENDING" on the stipend, NOT as a fully
  employed OWNER. Onboarding business-registration warnings (PabloOnboarding.tsx,
  WorldMenu.tsx) must say "stipend until your work visa clears", never "ƒ0 until
  verified".
- The city employment readouts in WorldPlay.tsx (compact class row + StatRow
  EMPLOYMENT) are derived from the LOCAL save's empLabel, which does NOT know
  verification state — they read `verifiedSalaryStatus` (useVerifiedSalary) at
  render and append "· WORK VISA PENDING" (amber) / "· ƒX/HR" only when
  `empLabel.startsWith('OWNER')`. WorldPlay polls useVerifiedSalary(true) so a
  verified owner's salary accrues anywhere in the world, not just the office.
