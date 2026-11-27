---
name: CRM & Calls autopilot handler
description: CRM & Calls automation uses email follow-ups with saved opt-outs; manual phone features remain separate.
---
# CRM & Calls autopilot (crm_calls domain)

CRM & Calls automation sends scheduled customer follow-ups by email through
Resend. It does not auto-place calls. Manual SMS and explicitly started SMS
campaigns remain separate features.

- Candidates are in-play organization leads with valid email addresses; closed
  leads are never contacted.
- Honor the latest contact email preference and `emailOptedOutAt`. Automated
  messages include a signed unsubscribe link that persists the opt-out for that
  user's matching contacts and suppresses future email campaigns and follow-ups.
- Record successful email touches in the organization CRM activity timeline and
  lead notes.
- Cool down failed sends using the configured follow-up interval. Per-lead
  cooldown uses the most recent outbound CRM activity; the per-tick cap uses
  `ctx.claimAction()`.
- Automated outreach does not need the `phone_system` entitlement or Twilio.
  Manual calls/SMS retain their existing plan and consent gates.

**Why:** the user directed customer notifications to use email instead of
relying on Twilio SMS verification.

**How to apply:** keep CRM autopilot follow-ups on email, preserve saved email
opt-outs and retry cooldowns, and do not remove manual SMS or SMS campaigns
unless the user asks.
