---
name: Office consolidation (one office)
description: There is ONE office in SALARYMAN — /office. Why the other "office" pages are dead/redirected and which surface is intentionally NOT folded.
---

# One office: /office

`/office` (PabloOffice → PixelOffice) is the single canonical office: a walkable
pixel room with a `?mode=surveillance` passive view (SAME artwork as live, no
green-duotone reskin). The owner character there is drawn with the shared
`drawPlayerSprite` (src/lib/character-identity.ts) — identical to the WorldPlay
city — via `PixelOffice`'s `appearance` prop. PixelOffice still has a legacy
char_0 sprite-sheet fallback for static cutscene callers that pass no appearance.

These routes now REDIRECT to `/office` (App.tsx); their page files (TheOffice,
OfficeScene, BotOffice) remain on disk but are UNROUTED dead code — do not treat
them as live:
- `/bots/office` — old isometric "android factory" office; divergent renderer + a
  no-exit dead-end.
- `/game/office` — legacy bathroom→office tutorial cutscene (OfficeScene sets NO
  onboarding/completion flag, and nothing navigates to /game/bathroom anymore).
- `/bots/:id/office` — per-bot "cinematic office" shell.
- `/office/surveillance` — → `/office?mode=surveillance`.

**Why:** user explicitly chose "GO ALL THE WAY" — collapse every office surface
into one, kill the dead-end isometric office, retire per-bot cinematic offices.

**How to apply:**
- Per-bot management is NOT an office anymore — it lives at `/bots/:id/command`
  (BotCommandCenter) + /logs /connect /analytics. Don't resurrect BotOffice.
- `/my-office` (MyOffice dashboard — economy/holdings stats) is INTENTIONALLY left
  routed and separate; the user declined folding it into /office. Don't "unify" it.
- Stale `navigate('/bots/.../office')` calls (OfficeSurveillance, CutscenePage,
  WorldPlay, JobOffers, Rebellion, MobileTerminal) are fine — the redirects catch
  them; landing on the generic /office is the intended behavior.
