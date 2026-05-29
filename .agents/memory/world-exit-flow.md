---
name: SALARYMAN game exit → main terminal
description: Where in-game EXIT buttons must navigate, and the role of /world vs /pablo
---

# Game exit goes to the MAIN TERMINAL (/pablo), not /world

All user-facing "RETURN/BACK TO TERMINAL" and "SAVE & EXIT" buttons inside
`WorldPlay.tsx` must `navigate('/pablo')` (the Pablo terminal = the app's main
window). They save first via `doSaveRef.current(buildSaveData())`, so progress
is persisted server-side before leaving.

**Why:** `/world` is `WorldMenu` — an old onboarding-era multi-tab page
(IMMIGRATION / FIELD GUIDE / CORP QUARTER / MERCH / save-picker). Routing exits
there put a confusing "page in the middle" between the game and the terminal.
User (Picasso) wanted exits to land straight on the main terminal.

**How to apply:** keep `/world` ONLY as the entry/save-picker (the `if (!char)
navigate('/world')` guard at WorldPlay top is correct — that's *entry* with no
loaded character, not an exit). Never wire a new EXIT affordance to `/world`.
