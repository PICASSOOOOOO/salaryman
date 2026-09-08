---
name: Country-aware telephony contact matching
description: How inbound call/SMS contact matching resolves the country to normalize phone numbers
---
Inbound webhooks (twilio.ts) match callers against saved contacts by normalizing
both sides to E.164. The country used to normalize MUST come from the dialed
(owning) number, not the user's home city.

**Why:** A player can own numbers in several countries (e.g. a Huda/VN player
with a VN +84 line). Normalizing with the user's home country mis-handles local
formats ("09…") so a VN-stored contact won't match an inbound +84 call.

**How to apply:**
- `resolveOwningNumberCountry(userId, toNumber)` (lib/phone-context.ts) reads the
  persisted `phone_numbers.countryCode` for the dialed number, falling back to
  the user's home country, then US.
- `matchContactByPhone(userId, from, countryOverride?)` takes that country.
- Every inbound webhook (inbound/webhook, voicemail/webhook, secretary/handle,
  webhook/voice) destructures `To` and passes the owning country. webhook/recording
  has no `To`, so it keeps the user-country fallback.
- Web outbound paths never use game city/home country. They accept an optional ISO country, default to US, and preserve explicit `+` E.164 numbers. Game city selection belongs only to the downloadable game.

**Gotcha:** the dev DB can lag the schema — `phone_numbers.country_code` (also
`city_id`, `region`) may be missing. Add with `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS`, and rebuild `@workspace/db` (`tsc --build lib/db/tsconfig.json`) so the
stale .d.ts exposes the new column or consumers won't typecheck.
