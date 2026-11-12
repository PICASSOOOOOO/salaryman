---
name: Real banking + net-worth overview
description: View-only Plaid bank linking and the unified financial overview that combines real bank + brokerage balances.
---

# Real banking + unified financial overview

A VIEW-ONLY feature: users link real bank accounts via Plaid's hosted Link
(we never see bank credentials), see real balances, and a combined net worth
that adds in brokerage balances from the in-app trading system, converted to a
chosen home currency. No money movement, ever.

## Hard boundary
- This is COMPLETELY separate from the in-game FIAT bank (`schema/bank.ts`,
  `routes/bank.ts`). Never mix the two. Real money lives in
  `real_bank_connections` + brokerage tables; in-game ƒ lives in `bank.ts`.

## PER-USER credentials (bring-your-own, like broker keys)
- The platform owner does NOT supply a shared Plaid key. Each user enters their
  OWN Plaid client_id + secret (+ env), stored encrypted per-user in
  `user_banking_credentials` (userId unique). Mirrors the trading-system broker
  bring-your-own-keys pattern. There is NO app-level PLAID_CLIENT_ID/PLAID_SECRET
  anymore — do not request them.
- plaid-client.ts exports `makePlaidClient(creds)`, `normalizePlaidEnv`,
  `PlaidCredentials`, `PLAID_PRODUCTS`, `PLAID_COUNTRY_CODES`. NO more
  `getPlaidClient()`/`isPlaidConfigured()`.
- banking.ts has `loadUserCreds(userId)` / `getClientForUser(userId)` (returns
  null when no creds) / `needsCredentials(res)` (returns code `NEEDS_CREDENTIALS`).
  Every Plaid-touching route loads the per-user client first and returns
  needsCredentials if null. `fetchAccountSnapshots(client, token)` and
  `resolveInstitutionName(client, id)` take the client as first arg.

## Layout
- Provider wrapper: `artifacts/api-server/src/lib/plaid-client.ts`
  (official `plaid` SDK, `balance` product, country US/CA/GB; env per-user,
  default sandbox).
- Routes: `artifacts/api-server/src/routes/banking.ts` (mounted in
  `routes/index.ts`, at root so proxy path is `/api/banking/*`).
  GET/POST/DELETE credentials (POST validates via a linkTokenCreate probe before
  saving, onConflictDoUpdate by userId, NEVER returns secrets — only
  clientIdHint + env) / status / link-token / exchange / connections / refresh /
  DELETE connections/:id / overview. Access token + creds encrypted via bot-crypto.
- Schema: `lib/db/src/schema/real-bank-connections.ts` holds BOTH
  `realBankConnectionsTable` (migration 0033) and `userBankingCredentialsTable`
  (migration 0034). Remember composite rebuild (`tsc --build lib/db/tsconfig.json`)
  after schema edits or api-server won't see new exports.
- UI: `artifacts/interview-helper/src/components/FinancialOverview.tsx`, wired as
  the "NET WORTH" tab in TradingConsole (`pages/BotFactory.tsx`). User-scoped —
  ignores the selected botId. Shows a CredentialsForm (client id/secret/env +
  link to dashboard.plaid.com signup) when not configured; Link button only after
  creds saved; handles `NEEDS_CREDENTIALS` by re-opening the form.

## Overview aggregation
- `/banking/overview?currency=XXX` sums: real bank cached snapshots + ALL of the
  user's bots' `botBrokerConnectionsTable` (cachedEquityNative ?? cachedBalanceNative,
  native cents) + legacy `botTradingAccountsTable` schwab (cachedEquity, USD, only
  when encryptedAccessToken present). Converts via `lib/currency` (convert/
  formatCurrency/centsToMajor). Plaid balances are MAJOR units (dollars), broker
  caches are CENTS — don't double-convert.

## Config
- No app-level Plaid secrets. Each user supplies their own keys (validated on
  save). Routes return `NEEDS_CREDENTIALS` (not 503 PROVIDER_NOT_CONFIGURED) when
  the calling user has no creds; UI shows the CredentialsForm. Encryption key =
  BOT_ENCRYPTION_KEY || SESSION_SECRET (SESSION_SECRET present).
