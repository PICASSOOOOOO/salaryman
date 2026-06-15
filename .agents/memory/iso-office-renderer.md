---
name: IsoOffice isometric renderer
description: /office uses a canvas isometric renderer; how to visually verify it given the auth-gated preview
---

# IsoOffice — isometric /office

`/office` (PabloOffice.tsx) renders `IsoOffice` (canvas, 2:1 iso projection, procedural iso
boxes — no PNG sprites). Same prop contract PixelOffice used. PixelOffice is KEPT for cutscenes
+ WorldPlay; do not delete it. IsoOffice reuses the top-down world/grid/collision/station/camera
math — only the projection + draw + tap-inverse changed.

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

**Why:** runTest(testReplitAuth) reaches the real /office and confirms the component mounts
(data-testid="pixel-office") but does NOT reliably hand back a screenshot file, and its prose
"it looks isometric" descriptions are unreliable/hallucinated. The early-return harness is the
only self-serve way to actually SEE the canvas.
