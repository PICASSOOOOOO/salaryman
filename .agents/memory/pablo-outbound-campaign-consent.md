---
name: Pablo outbound campaign consent
description: Contact-specific permission and assigned-voice rules for Pablo outbound campaigns and direct calls.
---

Pablo outbound campaigns and direct Pablo dialing can use only the current user's saved CRM contacts with recorded phone-call permission. A campaign-wide declaration or a pasted phone number is not permission. Recheck permission on the server before each dial, and persist a spoken stop/do-not-call as an opt-out. Campaign voice must use Pablo's assigned ElevenLabs voice; fail closed when synthesis is unavailable.

**Why:** the user set these as product privacy and reliability requirements for outbound calling.

**How to apply:** Preserve contact ownership, consent timestamps, pre-dial checks, persistent opt-out, and real assigned-voice synthesis checks in every Pablo outbound path. Do not place real recipient calls in automated tests.