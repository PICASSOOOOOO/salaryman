---
name: Phone-system daily testing
description: How the Twilio/phone-system tests are run and how "daily" automation is wired
---

The Twilio/phone-system test suites (twilio.auth/crud/routes, 62 tests) are run via the
api-server script `test:phone` = `vitest run twilio` (filename substring filter catches all
three suites). A named CI-style validation check `phone-system` runs
`pnpm --filter @workspace/api-server run test:phone`.

**Daily automation:** the only truly-automatic daily mechanism on Replit is a **Scheduled
Deployment** — its cron schedule is chosen by the user in the Publishing UI and CANNOT be set
by the agent programmatically (no cron/deployConfig callback exposes it). The `test:phone`
script is the intended run command for that scheduled job. The main app is deployed separately
as autoscale; a scheduled test job is an additional deployment the user must publish.

**Why:** user wants Twilio/phone always healthy + tested daily. A registered validation check
proves green on demand; true daily runs require the user to publish a Scheduled Deployment.

**How to apply:** to run the check now use the `phone-system` validation or `test:phone`. If a
scheduled deployment runs it in production, ensure devDependencies (vitest) are installed in the
build and DATABASE_URL is available, since the tests hit a real DB scoped by synthetic userId.
