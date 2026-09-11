---
name: CRM telephony recording
description: org-scoped recording of all Twilio calls/voicemails/SMS into one CRM timeline; dedupe + idempotency invariants
---

Every Twilio call/voicemail/SMS is mirrored into an org-shared CRM activity timeline via a single recorder helper called from each telephony touchpoint. The recorder resolves the org from the handling user's active membership, snapshots the org's industry at write time, and find-or-creates an org lead by last-10-digit phone match.

**Authority boundary:** CRM owns the selected lead/contact and the intent to call; the Phone floor owns live media controls; `call_history` is the provider audit; `crm_activities` is the org interaction ledger. A CRM-originated call must verify the record belongs to the caller's org/user before metering or dialing, derive the destination from that record, and create the CRM activity immediately. Twilio callbacks enrich that same row.

**Why:** Passing an arbitrary number plus an unverified lead ID lets callers misattribute activity across organizations. Delaying CRM insertion until a callback also makes live calls temporarily invisible and loses attribution when provider callbacks fail.

**How to apply:** Route all CRM call buttons through the reliable outbound bridge and the existing Phone controls. Pass an authoritative lead/contact ID into the call command; never build separate CRM mute/hold/transfer logic or a second call ledger.

**Organization authority:** A supplied CRM `orgId` is only a hint until the handling user has an active membership in it. For outbound work, resolve the user's validated current organization before falling back to another active membership; for an owned phone number, its organization is authoritative.

**Why:** Selecting an arbitrary active membership after a user changes organizations can write a call into the wrong shared CRM timeline and disclose activity across organizations.

**How to apply:** Validate explicit organization hints inside the shared recorder, not only at individual route call sites. Never use a first-membership lookup as the primary organization selection.

**Conference authority:** Before making any Twilio request that ends a conference, first verify a matching persisted conference is active and owned by the authenticated caller.

**Why:** A guessable or leaked room name must never give one phone user control over another user's live calls.

**How to apply:** Apply the ownership check before listing or updating Twilio participants; an unauthorized request must leave both the provider and the local call state untouched.

**Invariant — dedupe by (orgId, twilioSid, channel):** Twilio fires MULTIPLE webhooks for one interaction (call status ringing/in-progress/completed, recording, transcription). The recorder must upsert on that triple — first call inserts, later calls only enrich columns that have new non-empty values.

**Why:** A naive "insert every webhook" duplicates rows and, worse, the human-readable `lead_notes` mirror line and the `callCount`/`lastCalledAt` bump must fire ONCE per interaction. Writing them on every webhook overcounts calls and floods the lead timeline.

**How to apply:**
- Side effects (lead_notes insert, callCount bump) are gated on `isNewActivity` (the row was actually inserted this call), never on every invocation.
- Race safety is a PARTIAL unique index `(org_id, twilio_sid, channel) WHERE twilio_sid IS NOT NULL` — rows without a SID (e.g. Mila auto-replies) stay unconstrained. The app-level pre-check is not atomic, so the insert is wrapped in try/catch: on unique violation, re-query the winner and enrich it (don't drop data, don't re-run side effects).
- Recorder is defensive: never throws, every call site wraps it in `.catch(() => {})` and awaits it after the primary DB write so a CRM failure never breaks telephony.

**Voice-history retry invariant:** Provider Call SIDs identify one `call_history` lifecycle row, with a partial unique constraint for non-null SIDs. Status callbacks and inbound webhooks must tolerate arriving before the normal creator write or being retried.

**Why:** Twilio can deliver callbacks immediately and more than once. A non-atomic check-then-insert silently loses lifecycle updates in the first case and duplicates history in the second.

**How to apply:** Use SID-level idempotent creation/recovery for callback paths; preserve the existing history row when it wins a race. Test mocks must generate one SID per provider call, as Twilio does.

**Touchpoints that feed it (two SMS subsystems exist):** twilio.ts (call status webhook + fallback inbound insert, recording webhook for both voicemail and call, transcription webhook, SMS inbound, Mila outbound reply) AND campaigns.ts has its OWN SMS stack (`/sms/send`, bulk campaign send, its own `/sms/webhook/inbound`). Wire BOTH or SMS coverage is half-missing. Legacy inbound SMS must resolve its owner from the dialed `To` number before contact/conversation lookup, then pass that resolved org to the recorder; raw-phone lookups can otherwise cross users or silently lose CRM attribution.

**Known gap (accepted):** the legacy campaigns inbound-SMS webhook accepts unauthenticated Twilio payloads without signature verification; forged inbound could seed an org lead/activity. It now resolves the owning `To` number correctly, but signature validation remains a separate hardening task.
