---
name: Tower service scopes
description: Rules for routing Shadow Tower tenant stations to real Services Board listings.
---

Only fixed-suite commercial tenants have a service-counter scope. Lobby-wide and every-floor catalog businesses do not have tenant stations, so their service routes must resolve to an explicit empty/unavailable state rather than falling back to the shared board or inventing listings.

**Why:** The physical Tower floor contract is the authority for which businesses have reachable stations; treating catalog presence alone as a service counter creates routes with no playable tenant address.

**How to apply:** Resolve tenant keys through the canonical fixed-suite catalog before reading or writing scoped service listings. Keep legacy listings without a tenant key on the shared board, and let claim, completion, dispute, and payout continue to operate on the listing ID.