---
name: Phone-system testing and recurring health
description: How Twilio phone health is verified, scheduled in production, and separated from development checks
---

Two layers verify the phone system:

1. **Mocked unit tests** — api-server script `test:phone` = `vitest run twilio` (twilio.auth/crud/routes
   suites). Registered as validation check `phone-system`. Proves routing/auth/CRUD logic.
2. **Live health check** — api-server script `health:phone` (`src/scripts/phone-health-check.ts`).
   Does REAL Twilio API checks (account active, browser Voice API key, number provisioned, balance) + live probes of the
   production API (`/api/healthz` 200, unauth `POST /api/twilio/call` must be 401), then emails a
   PASS/FAIL report via Resend and exits non-zero on hard failure. Registered as validation `phone-health`.

**19-minute automation:** Replit Scheduled Deployments have a one-hour minimum, so the 19-minute
phone check runs from a production-only timer in the always-on API VM. It starts shortly after API
startup, prevents overlapping checks, and emails failures rather than healthy passes. It cannot run
while the API process is down; independent outage coverage requires an external monitor.

**Why the live check complements the unit tests:**
- The unit tests MOCK Twilio, so they never catch a real outage / expired creds / depleted balance.
  The user wants "assume it's always broken," so daily verification must hit the real Twilio API.

**How to apply:** edit `src/scripts/phone-health-check.ts` for the live check; keep every outbound
Twilio/Resend/fetch call wrapped in a timeout (unattended job must never hang). A FAIL run that cannot
deliver its alert email is itself treated as a failure (non-zero exit). Indeterminate balance = FAIL,
not WARN. Production probe target defaults to https://salaryman.io (override via HEALTH_CHECK_BASE_URL).

Validate a Standard browser Voice API key against a supported Voice resource such as the Calls API.
Do not validate it against the Accounts resource: Twilio intentionally denies Standard keys there,
which creates a false "invalid key" diagnosis. Validate newly provisioned keys before persisting them.

**Feature independence:** Toll-free SMS verification is a separate health result. A rejected or
pending SMS registration must not make browser Voice unavailable or gate Voice readiness.

**Why:** The user explicitly requires each phone subfeature to be independent; SMS compliance can
fail while browser Voice is otherwise healthy.

**How to apply:** Keep SMS verification out of Voice readiness checks and report phone subfeature
status independently. The live `health:phone` script may still report its own SMS check as a failure.

**Runtime packaging:** The API bundle intentionally leaves some packages external, so production
images must retain runtime `node_modules`; excluding that tree can make the API crash before any
phone, CRM, or game-bridge route is available.

**Why:** A successful image build is not proof that an externalized runtime dependency is present.

**How to apply:** Keep production dependencies available in the published API image and verify the
API starts before interpreting downstream phone/CRM health failures.

The production bundle rebases staged package links to absolute paths under the API dist tree. A
multi-stage image must preserve that same absolute path or rewrite the links after copying; moving
the runtime tree elsewhere can leave external packages unresolved even though the image builds.

**Why:** Image-build success does not validate that copied pnpm symlink targets resolve at runtime.

**How to apply:** Keep the runtime tree at its staged path and smoke-test API startup after building
the image.
