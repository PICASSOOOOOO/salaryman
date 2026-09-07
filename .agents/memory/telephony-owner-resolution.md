---
name: Telephony callback owner resolution
description: How inbound Twilio callbacks choose a user and organization when provider URLs carry legacy user hints.
---

Active persisted phone-number ownership is authoritative for inbound Twilio callbacks. A callback query `userId` is only a compatibility fallback when no number row exists; it must never override an active destination-number owner, and ambiguous or inactive number mappings fail closed.

**Why:** Org founders can reassign shared numbers, while Twilio continues retrying or using URLs that may contain an older user hint. Trusting the hint can leak calls, SMS, voicemail, and CRM activity across organizations.

**How to apply:** Keep the resolver provider-neutral and use it for voice, status fallback, recording/voicemail, and SMS attribution. Preserve the paid `phone_system` gate on phone actions; CRM read/activity access remains governed by org CRM permissions.