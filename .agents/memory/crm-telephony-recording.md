---
name: CRM telephony recording
description: org-scoped recording of all Twilio calls/voicemails/SMS into one CRM timeline; dedupe + idempotency invariants
---

Every Twilio call/voicemail/SMS is mirrored into an org-shared CRM activity timeline via a single recorder helper called from each telephony touchpoint. The recorder resolves the org from the handling user's active membership, snapshots the org's industry at write time, and find-or-creates an org lead by last-10-digit phone match.

**Invariant — dedupe by (orgId, twilioSid, channel):** Twilio fires MULTIPLE webhooks for one interaction (call status ringing/in-progress/completed, recording, transcription). The recorder must upsert on that triple — first call inserts, later calls only enrich columns that have new non-empty values.

**Why:** A naive "insert every webhook" duplicates rows and, worse, the human-readable `lead_notes` mirror line and the `callCount`/`lastCalledAt` bump must fire ONCE per interaction. Writing them on every webhook overcounts calls and floods the lead timeline.

**How to apply:**
- Side effects (lead_notes insert, callCount bump) are gated on `isNewActivity` (the row was actually inserted this call), never on every invocation.
- Race safety is a PARTIAL unique index `(org_id, twilio_sid, channel) WHERE twilio_sid IS NOT NULL` — rows without a SID (e.g. Mila auto-replies) stay unconstrained. The app-level pre-check is not atomic, so the insert is wrapped in try/catch: on unique violation, re-query the winner and enrich it (don't drop data, don't re-run side effects).
- Recorder is defensive: never throws, every call site wraps it in `.catch(() => {})` and awaits it after the primary DB write so a CRM failure never breaks telephony.

**Touchpoints that feed it (two SMS subsystems exist):** twilio.ts (call status webhook + fallback inbound insert, recording webhook for both voicemail and call, transcription webhook, SMS inbound, Mila outbound reply) AND campaigns.ts has its OWN SMS stack (`/sms/send`, bulk campaign send, its own `/sms/webhook/inbound`). Wire BOTH or SMS coverage is half-missing.

**Known gap (accepted):** inbound SMS webhooks accept unauthenticated Twilio payloads without signature verification (pre-existing for all webhooks here); forged inbound could seed an org lead/activity. Hardening (Twilio signature validation + resolve org by owned `To` number) is a separate cross-cutting task, not part of recording.
