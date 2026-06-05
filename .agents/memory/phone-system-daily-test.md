---
name: Phone-system daily testing
description: How Twilio/phone-system health is verified and how the daily automated check is wired
---

Two layers verify the phone system:

1. **Mocked unit tests** — api-server script `test:phone` = `vitest run twilio` (twilio.auth/crud/routes
   suites). Registered as validation check `phone-system`. Proves routing/auth/CRUD logic.
2. **Live health check** — api-server script `health:phone` (`src/scripts/phone-health-check.ts`).
   Does REAL Twilio API checks (account active, number provisioned, balance) + live probes of the
   production API (`/api/healthz` 200, unauth `POST /api/twilio/call` must be 401), then emails a
   PASS/FAIL report via Resend and exits non-zero on hard failure. Registered as validation `phone-health`.

**Daily automation = a Replit Scheduled Deployment** running `pnpm --filter @workspace/api-server run health:phone`.
The cron schedule is chosen by the user in the Publishing UI — the agent CANNOT create a scheduled
deployment or set its cron programmatically (no callback exposes it). This is why the deliverable is a
ready run command + a user publish step, not a fully self-running job.

**Why the live check is decoupled from the DB and the unit tests:**
- The unit tests MOCK Twilio, so they never catch a real outage / expired creds / depleted balance.
  The user wants "assume it's always broken," so daily verification must hit the real Twilio API.
- The health script must NOT import `lib/plan` (or anything pulling in `@workspace/db`) — `@workspace/db`
  throws at module load when `DATABASE_URL` is missing, which would crash the job in a DB-less scheduled
  deployment. Resolve the alert recipient from `PHONE_HEALTH_ALERT_EMAIL`/`OWNER_EMAILS` env directly.

**How to apply:** edit `src/scripts/phone-health-check.ts` for the live check; keep every outbound
Twilio/Resend/fetch call wrapped in a timeout (unattended job must never hang). A FAIL run that cannot
deliver its alert email is itself treated as a failure (non-zero exit). Indeterminate balance = FAIL,
not WARN. Production probe target defaults to https://picassoo.app (override via HEALTH_CHECK_BASE_URL).
