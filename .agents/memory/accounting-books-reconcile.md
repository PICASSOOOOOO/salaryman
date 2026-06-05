---
name: Accounting books reconciliation
description: How the BUSINESS finance "books" (P&L, balance sheet, accounting sheets) source revenue/outflows, and the invariant new financial reports must hold.
---

# Accounting books reconciliation (SALARYMAN BUSINESS finance)

The finance sheets are **computed live** from existing tables — there is no
dedicated ledger-of-record table that already holds revenue.

- **Revenue = PAID invoices only** (`invoices` status `paid`; amount = Σ qty×rate + tax via taxRate%). `balance_sheet_transactions` *does* have a `type: "income"` but **no income rows are ever inserted** (recordTx is only called for payroll/bill/expense). So count revenue from invoices, and explicitly **skip `type === "income"`** tx rows to avoid future double-count if someone starts inserting them.
- **Outflows = `balance_sheet_transactions`** rows of type payroll / bill / expense.

**Why:** P&L (`/enterprise/summary`), balance sheet (`/enterprise/balance-sheet`) and the accounting sheets (`/enterprise/accounting`) must all agree. They only agree if every aggregation path uses the *same* source rules.

**How to apply — invariant for any new financial sheet:** apply **identical amount/type guards across ALL aggregation passes** in the same endpoint. The accounting endpoint builds journal postings (double-entry) AND a separate monthly cash-flow pass; both must use the same filters (`amount <= 0` skip, `status !== "paid"` skip, `type === "income"` skip) or cash flow / cashBalance diverges from the cash ledger and trial balance. The double-entry trial balance self-balances *only* because every event emits a matched debit+credit pair of equal amount.

Dates are varchar `YYYY-MM-DD`. For aging, compare both sides at UTC midnight (`Date.parse(today())` vs `Date.parse(dueDate)`) so time-of-day never shifts an item into the wrong overdue bucket.
