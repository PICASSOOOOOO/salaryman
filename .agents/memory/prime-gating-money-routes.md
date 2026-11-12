---
name: PRIME gating of money-costing routes
description: Which paid endpoints are gated how, and the two distinct money-protection mechanisms in api-server
---

# PRIME gating of money-costing routes

There are TWO distinct money-protection mechanisms in api-server — don't confuse them
or convert one to the other:

1. **Hard PRIME gate** — `requireFeature("claw_bot")` middleware (from middlewares/requirePro).
   Used for premium tools: studio.* generators, twilio call/sms, music/video gen, live
   social publish, and social AI copy gen (/social/generate, /social/generate-variants).
   Non-PRIME → 403. PRIME = the existing `claw_bot` bundle; there is NO separate "prime" key.

2. **Pablo Tax meter** — `chargePabloTax()` (lib/pablo-tax.ts). Every paid API call is recorded
   at 4× markup. PRIME users get the first $149/mo free (prepaid); non-PRIME accrue debt and a
   billing waterfall (earned ƒ → gold → Stripe) fires per $20 increment. The onboarding starting
   ƒ is QUARANTINED so new users can't burn tutorial money on AI. This is the economic gate for
   nano-banana image gen — do NOT convert it to a hard PRIME gate; non-PRIME paying is intentional.

## The fire-and-forget enforcement trap
`chargePabloTax` is called AFTER the provider call (`void charge().catch()`), so on its own it
canNOT stop a broke user from getting one more expensive result per request. The model's own
design promises a "$20 hard-block" but it was never enforced. Enforcement lives in
`canUseApiFeatures(userId)` — an AWAITED preflight that must run BEFORE the expensive provider
call. It blocks non-PRIME users who already owe >= one unpaid $20 increment (owedCents); PRIME
and solvent users pass. Returns 402 with `{error, owedCents, upgrade:"/upgrade"}`.
**Why:** post-hoc metering ≠ enforcement. Any NEW paid endpoint that uses the tax meter must also
call `canUseApiFeatures` up front, or it re-opens the same leak.

## Deliberately NOT gated (gating these breaks the funnel)
- Story chat and transcription remain open for the logged-out conversation/onboarding funnel.
- Pablo's resolved TTS voice is paid-gated with an approved tester exception (see
  [Pablo voice output gating](pablo-voice-output-gating.md)); other-character TTS remains separate.
- Twilio Mila voice token remains open for public Twilio playback.
- scraper.ts (/scraper/extract, /scraper/batch) — uses only free oEmbed fetch + cheerio, no paid
  API key, so it is NOT a money-costing feature despite "scraping" sounding expensive.
