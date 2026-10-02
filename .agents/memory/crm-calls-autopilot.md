---
name: CRM & Calls autopilot handler
description: How the crm_calls autopilot domain works leads, what it does NOT do (auto-calls), and the entitlement/dedup gates.
---
# CRM & Calls autopilot (crm_calls domain)

Handler: `lib/autopilot/crm-handler.ts`, registered in `index.ts` boot before `startAutopilotScheduler()`.

- **Outreach is SMS-only.** The bot does NOT auto-place calls. The manual call flow (`/twilio/call`) dials a Twilio CONFERENCE a human joins from the browser — there is no unattended equivalent, so auto-calling would ring leads into an empty conference. SMS is the only self-driving channel.
- **Shared service, never inline.** Sends via `sendSmsMessage` in `lib/telephony-service.ts` — the SAME function the `/sms/send` route now calls (extracted). That routes through `recordTelephonyActivity`, so CRM dedup + lead_notes side-effects fire identically. NEVER write crm_activities directly.
- **Entitlement gate = `phone_system`, NOT claw_bot.** Manual telephony gates on `phone_system` (bundled by PABLO/claw_bot). Handler mirrors it via `checkEntitlement(ownerId, email, "phone_system")`. `checkEntitlement` was widened from `"claw_bot"` to `FeatureKey` for this.
- **OFF == manual-only; missing entitlement is NOT a hard fail.** Without `phone_system` the bot records the *intended* SMS to the autopilot log (action `intended_sms`, outcome `blocked`) and sends nothing.
- **Per-lead cap = 24h cooldown** measured against the lead's most recent OUTBOUND `crm_activities.occurredAt` (covers BOTH manual + auto, calls + SMS). recordTelephonyActivity does NOT bump `lastCalledAt` for SMS, so don't rely on the lead column — query crm_activities.
- **Per-tick cap = `ctx.claimAction()`** (one claim per lead). Lead selection: status in new/contacted/qualified/proposal (closed_won/closed_lost never contacted), has phone, most-overdue-first.
- `sendSmsMessage` gained an optional `orgId` forwarded to recordTelephonyActivity so a multi-org owner isn't misattributed; the manual route omits it (keeps resolve-from-user behavior).
- Test `__tests__/autopilot.crm.test.ts` builds ctx by hand; twilioMock gained a `messages.create` spy (`__spies.messagesCreate`).

SMS outreach must honor the latest saved channel preference. Inbound STOP-family commands persist an SMS opt-out before any assistant response; START/UNSTOP clears it. CRM Auto suppresses matching opted-out leads. A failed SMS follow-up is cooled down for the configured follow-up interval using its persisted activity log, rather than being retried on every scheduler tick.

**Why:** automatic SMS must stop after a recipient opts out, and a sender/provider failure must not create a rapid retry loop.

**How to apply:** Keep SMS consent commands out of the assistant reply path, preserve saved preference checks in every automatic CRM sender, and retain durable failure backoff when changing the follow-up scheduler.
