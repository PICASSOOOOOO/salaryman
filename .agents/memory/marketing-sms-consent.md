---
name: Marketing SMS consent boundary
description: User's scope for outbound SMS lead-generation campaigns and sender-number ownership
---

Marketing SMS campaigns use saved contacts with explicit, recorded SMS marketing permission and an active Twilio number owned by the user or their organization. Campaigns require an explicit start; do not send automatically during setup or through a duplicate campaign workflow.

**Why:** The user asked to keep consent gates minimal while placing responsibility on organizations and users through their own Twilio and marketing SMS numbers.

**How to apply:** Reuse SALARYMAN's existing SMS campaigns, persist permission per contact, recheck it before each send, and keep the user's or organization's active number as the sender.
