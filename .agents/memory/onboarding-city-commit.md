---
name: Onboarding city commit
description: Why first-run city selection must be committed with registration before navigating to the office.
---

Commit the selected operational city atomically with the first registry row, before marking onboarding complete or navigating away. Updating local active-city state is useful for the immediate office render, but is not durable identity state.

**Why:** A fire-and-forget city request followed by navigation or hard reload can be cancelled. The account then counts as onboarded while another device hydrates no city and silently falls back to Minx.

**How to apply:** Treat home city as part of registration, validate it against a server-owned live-city allowlist, then seed local `cityId` only for a fresh save. Later hydration must not replace a valid traveled current city.