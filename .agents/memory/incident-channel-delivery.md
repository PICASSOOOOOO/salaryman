---
name: Incident channel delivery
description: How the Art Library downtime report is pushed to a shared on-call channel
---

The Art Library "Copy all" downtime report can be broadcast to a shared on-call
channel via POST /api/art/incident-report (admin-only, owner-email gated). The
client sends the EXACT text from buildAllHistoryCopyText (one report format, no
divergent server-side rebuild).

Delivery (lib/incident-channel.ts) reuses the same config the automatic
backend-offline alerts already use:
- Discord: INCIDENT_DISCORD_WEBHOOK_URL → falls back to DISCORD_WEBHOOK_URL;
  validated by isValidDiscordWebhookUrl (SSRF guard), posted via safeFetch in
  ```-fenced chunks ≤1900 chars (splitForDiscord, pure/tested).
- Email: ART_BACKEND_ALERT_EMAIL → falls back to ownerEmails() (Resend).

**Why:** email is effectively ALWAYS "configured" because ownerEmails() carries
hardcoded staff addresses, so the route's 503 "no channel configured" guard only
fires if owner emails were somehow emptied. Discord is the only channel that is
genuinely opt-in. Don't write a unit test asserting "nothing configured" with
empty env — it will fail on the owner-email fallback.

**How to apply:** to add another incident channel, extend deliverIncidentReport
and incidentChannelsConfigured together (delivered/failed/skipped tuple), keep
the single-report-format invariant, and gate any new outbound webhook with an
allow-list validator + safeFetch.

**Per-channel dedup (Retry failed):** the dedup window is keyed per
`fingerprint(text):channel`, not per report. claimIncidentReport(text, channels)
returns {fresh[], duplicate[], sentAgoMs}; the route claims ONLY the
configured+selected channels, delivers to fresh ∪ unconfigured-selected (so
skipped still reports), and releases claims for whatever FAILED (delivered
channels keep their claim). Effect: a "Retry failed only" send re-sends the
failed channels but a channel that already delivered stays 409-deduped. 409
fires only when every configured+selected channel is a duplicate.
