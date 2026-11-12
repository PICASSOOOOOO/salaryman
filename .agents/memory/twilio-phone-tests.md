---
name: Twilio phone-system test harness (api-server)
description: How the automated tests for the SALARYMAN phone routes are structured and the non-obvious traps in setting them up
---

# Twilio phone-system tests

Backend integration tests live in `artifacts/api-server/src/__tests__/` (vitest +
supertest). Run with `pnpm --filter @workspace/api-server run test`. The Twilio
SDK is mocked, so tests never place real calls or incur charges.

## Non-obvious setup rules

- **`vi.mock` factories cannot reference imported helpers** (hoisting). Work around
  it by making the factory `async` and dynamically importing inside it:
  `vi.mock("twilio", async () => (await import("./helpers/twilioMock")).makeTwilioMock())`.
  A module imported both by the factory and the test is the same singleton, so a
  shared exported `mockState` object lets tests steer mock behavior at call-time.
- **`vi.mock` paths are relative to the test file**, even when the mocked module is
  imported by a transitively-loaded file (the router). Test files in `src/__tests__/`
  mock `"../lib/plan"` and `"../lib/usage-meter"` (resolve to `src/lib/*`).
- **`import twilio from "twilio"` is a default import**: the mock module must return
  `{ default: fn }` where `fn` is callable (`twilio()` -> client) AND carries
  `.jwt.AccessToken` (with static `VoiceGrant`) and `.validateRequest`.
- **Auth is injected, not real**: a middleware sets `req.isAuthenticated()` and
  `req.user` from a mutable `authState`. `requireAuth` also has an org-restriction
  branch — mock `isOwnerEmail` to `true` to bypass it in normal tests; override with
  `mockReturnValueOnce(false)` to exercise the `TWILIO_ORG_RESTRICTED` deny path.
- **Env must be set in `setup.ts`** before routes run: TWILIO_ACCOUNT_SID/AUTH_TOKEN/
  PHONE_NUMBER plus API_KEY_SID/SECRET and TWIML_APP_SID (the last three short-circuit
  the lazy auto-provisioning in `ensureTwilioApiKey`/`ensureTwimlApp`).

## DB isolation

- Uses the **real dev DB** (no in-memory). user_id columns are plain varchar with no
  FK, so tests scope every row by a synthetic per-file `test-twilio-<uuid>` userId and
  delete them in `afterAll` — no `users` row seeding needed.
- `vitest.config.ts` sets `fileParallelism: false` so suites don't race on shared DB.

## Mute/hold branch trap

`call.groupSid` truthy = participant-update branch; falsy = the fallback that bridges
the solo call into a new conference (uses a real 600ms sleep). Set
`mockState.conferenceGroupSid = ""` to test the fallback. Both branches need coverage.

## Country-aware (VN/US) coverage

- Pure lib `lib/phone.ts` is db-free → unit-test directly (`phone.test.ts`): the
  `toE164` country matrix, `regulatoryRequirement`, `countryForCity`. No app/mock needed.
- Endpoint tests for region-defaults/regulatory/available-numbers/purchase-number live
  in `twilio.country.test.ts`. They mock `../lib/phone-context` (`resolveUserCity` /
  `resolveUserCountry`) off a mutable `cityState` so each test picks the player's home
  city without seeding `worldBusinessesTable`.
- The twilioMock now exposes `availablePhoneNumbers(country).local.list` (returns
  `+84`-prefixed numbers when country==='VN', else `+1`) and `incomingPhoneNumbers.create`.
- VN purchase is gated on `TWILIO_REGULATORY_BUNDLE_SID`; the deny path returns 409
  `regulatory_bundle_required` — delete the env var in-test to exercise it, restore after.
