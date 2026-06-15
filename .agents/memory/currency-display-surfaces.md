---
name: Real-world currency display surfaces
description: Which money readouts are real-world USD (convert via formatFromUsd) vs in-game ƒ (leave alone)
---

The real-world currency preference (`src/lib/currency.ts` + `useCurrency`) converts USD-denominated readouts into the player's chosen currency. Display-only; never touch Stripe charge amounts or in-game ƒ/Gold.

**Which surfaces are genuinely real-world USD:**
- Reporting page "Est. MRR" + "$/user/mo" — backed by `/api/reporting/stats` billing: `estimatedMRR = totalProSubscribers * PRO_MONTHLY_PRICE` (PRO_MONTHLY_PRICE=$25, platform-wide pro tiers). REAL USD → convert. NOTE: this card lives in `src/pages/Reporting.tsx` (~line 697), NOT AdminPanel — task #444 mislabeled the file.

**Which look like USD but are in-game ƒ (do NOT convert):**
- `src/pages/BalanceSheet.tsx` net profit / ledger / invoices / "AVAILABLE TO WITHDRAW" — all derived from `/api/enterprise/balance-sheet` which sums in-game business invoices + balance_sheet_transactions. The "$" is thematic in-game business accounting, not real money.

**Stripe checkout (Pricing.tsx $149, CallHomePage.tsx $95/mo):** keep showing USD (charge currency is fixed); a parenthetical "(~€X)" estimate is optional, never replace the charged figure.

**Pattern:** subscribe with `const { code } = useCurrency()` for live re-render, then `formatFromUsd(usd, { code })`. StatCard `value` accepts `number | string`.
