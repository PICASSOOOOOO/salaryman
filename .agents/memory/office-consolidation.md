---
name: Office consolidation (live + surveillance)
description: The single-office design — modes not separate pages, surveillance reuses live artwork, and where dead-ends hide.
---

The SALARYMAN office is being consolidated into ONE surface (`/office` = PabloOffice.tsx), not multiple office pages.

**LIVE vs SURVEILLANCE are MODES of the same scene, not different art.**
- Surveillance = the same `PixelOffice` rendered with `playable={false}` + a CCTV overlay (red frame, blinking REC, live timestamp). Do NOT reskin it (no green duotone / OfficeStage portrait variant) — the owner explicitly wants identical artwork between modes.
- `PixelOffice` already supports passive viewing via the `playable` flag and `mode` prop; reuse it, never fork the art.
- Mode is URL-driven: `/office?mode=surveillance`. The retired `/office/surveillance` route redirects there. Keep mode synced to the query (popstate listener + replaceState on toggle) so back/forward + shareable links work.

**Why:** owner wants every office variant funneled into one place; some standalone office pages had NO exit and trapped users.

**Dead-end watch:** `MyOffice.tsx` (Command Desk dashboard) had ZERO navigation — always give office pages a way back (Hub + Enter Office). Also beware `/team` links: that route does NOT exist; the real one is `/business/team`.

**Still open (future):** fold the `/game/office` cutscene, `/bots/office` isometric, and per-bot offices into the unified flow; unify the character renderer so the player looks identical in world + office (office still uses its own SKIN_TONES).
