---
name: IsoOffice isometric renderer
description: /office uses a canvas isometric renderer; how to visually verify it given the auth-gated preview
---

# IsoOffice — isometric /office

`/office` (PabloOffice.tsx) renders `IsoOffice` (canvas, 2:1 iso projection, procedural iso
boxes — no PNG sprites). IsoOffice reuses the top-down world/grid/collision/station/camera
math — only the projection + draw + tap-inverse changed.

**Source-of-truth split (post-retirement of the old flat live renderer):**
- The shared office DATA contract — `OfficeStation` / `OfficeRoom` / `OfficeBot` (+ deprecated
  `PixelOfficeBot` alias) — now lives in `src/components/office/office-types.ts`. IsoOffice and
  PabloOffice import from there. PixelOffice only RE-EXPORTS those types for back-compat; it no
  longer defines or consumes them.
- `IsoOffice` is the ONLY renderer for the live walkable `/office`. All the rich features
  (bullpen, cryo capsules, executive rooms, interaction stations, scrolling camera, premium
  lighting, shared paper-doll appearance) live ONLY in IsoOffice now.
- `PixelOffice` is CUTSCENE-ONLY and flat BY DESIGN — a fixed 16×7 top-down diorama. Its only
  callers are the onboarding cutscenes: PabloOnboarding (non-playable wander fallback) and
  PostOnboardingIntro (playable "learn the controls" beat). Its props are pared to
  `{ scale, crtTint, playable, onEnterTerminal }` — the old bullpen/bots/rooms/stations/camera/
  premium/appearance/mode/frozen props were DEAD duplicates of IsoOffice and were removed. Do
  NOT migrate these cutscenes to iso (that's an unwanted creative change) and do NOT re-add the
  removed props.
- WorldPlay's in-city interior is its OWN canvas code, not PixelOffice — flat by design, untouched.

## Verifying a logged-out preview of a gated page (the hard part)
The app_preview screenshot browser is ALWAYS logged out (401), and the AppShell holds EVERY
deep route on `CRTFallback ("LOADING...")` for anon cold loads — nested Suspense around
always-mounted keepalive subtrees (Home/Console) + holdForAuth. So adding a temp route +
ANON_ALLOWED_PREFIXES entry is NOT enough; the page still shows LOADING.

**What actually works:** add an EARLY RETURN at the very top of `AppShell` (after the hooks,
before any gate): `if (pathname === "/__isodev") return <IsoDev />;` with a NON-lazy import of
the temp page. This bypasses holdForAuth + all Suspense/keepalive gates. Restart the workflow
(HMR alone is unreliable here — repeated edits trip the keepalive ErrorBoundary loop), then
app_preview screenshot. REVERT all of it before commit (early return, route, import,
whitelist entry, temp page file).

## Living-office tuning (objects + character scale)
- The 5 interaction objects are SOLID props: a `stationBlocked` tile set (in IsoOffice)
  mirrors each station's DRAWN floor footprint (computed from the same tx/ty the renderer
  uses) + the desk, OR'd into the per-axis slide collision next to `blockedRef`. Keep
  footprint math in lockstep with the draw or collision drifts off the visible art.
- Player sprite scale is `u * 0.5` (was an oversized `u * 0.95`) — tuned so the paper-doll
  reads as a person ~the height of the room furniture, matching the concept art / intro video.
- ATM / vending / payphone each get a DISTINCT `drawMachine` render (coloured cabinet +
  glowing faceplate + emoji icon), NOT the generic kiosk-with-a-dot; elevator keeps drawElevator.
- A solo player (no org members) gets a clean single room: PabloOffice's execLayout returns
  ZERO rooms when the roster is empty (no VACANT placeholder suites) so the floor carries no
  illogical walls; floor depth falls to the tier minimum (capsule = 18 rows).

## Office HUD layout + occupancy minimap
- /office HUD now has ONE top-right money cluster (NetWorthHUD on top, then live
  WALLET/salary lines) and a top-left see-through neon WIREFRAME minimap
  (`OfficeMinimap`) fed by `IsoOffice`'s `onOccupants` callback (interval-polled,
  normalized 0..1, written to a ref so the parent never re-renders per frame).
- IMPORTANT: PabloOffice calls IsoOffice with `deskColCount/deskRowCount/capsuleCount=0`
  and NO `bullpen`/`activeBots`/`idleBots` — so the live iso floor renders NO bots
  and no secretary; the minimap's only live occupant is the player. The older
  in-floor cryo-capsule bot monitoring was a PixelOffice-era idea, not wired to the
  iso office. To show bots on the minimap you must first wire bots into IsoOffice.

**Why:** runTest(testReplitAuth) reaches the real /office and confirms the component mounts
(data-testid="pixel-office") but does NOT reliably hand back a screenshot file, and its prose
"it looks isometric" descriptions are unreliable/hallucinated. The early-return harness is the
only self-serve way to actually SEE the canvas.
