---
name: SALARYMAN nav pared to core
description: The main menu was deliberately trimmed to the core game loop; don't reintroduce the business-suite hubs.
---

The global nav was deliberately pared down to the core game loop because the
owner said the app had "too many pages, confusing and superfluous."

**Kept in the menu:** PABLO (`/`), BOTS (`/bots`), OFFICE (`/office`, the one
playable office), COMMS (`/comms`), MY OFFICE (`/my-office`, in MORE), and
PROFILE (mobile dropdown).

**Pulled OUT of the menu (routes still exist, reachable via deep links):**
PHONE, the duplicate OFFICE CAM, CONSOLE, BUSINESS, CREATIVE, MARKETING.

**Why:** owner wants a focused game, not a sprawling business-productivity
suite. Nav trim (not page deletion) was chosen so nothing/monetization is
destroyed and it's reversible.

**How to apply:**
- Don't re-add CONSOLE/BUSINESS/CREATIVE/MARKETING/PHONE to the nav without
  the owner explicitly asking.
- The two nav definitions MUST stay mirrored: `NavBar.tsx` (NAV_PRIMARY /
  NAV_MORE) and `MobileBottomBar.tsx` (PRIMARY_TABS / DROPDOWN_ITEMS). Edit
  both together.
- The "office" primary tab is canonical → `/office` on BOTH desktop and
  mobile (was a desktop=/my-office vs mobile=/office mismatch before).
