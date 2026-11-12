---
name: Office surveillance embed mode
description: How the /my-office surveillance iframe stays chrome-free despite the office-first funnel stripping its ?embed= query.
---

# Office surveillance embed mode

`/my-office`'s right pane is a same-origin iframe of
`/office?mode=surveillance&embed=1`. Embed mode hides ALL app chrome (alpha
banner, audio control, toaster) and office chrome (header, economy drawer,
tutorial modal) so the pane reads as one clean CCTV feed.

## The trap
Detecting embed from `?embed=1` alone is NOT enough. The office-first funnel and
mode toggles strip the query to a clean `/office`, which would un-hide the
chrome inside the pane:
- The kept-alive `HomeOrCover` (always mounted in App.tsx) returns
  `<Redirect to="/office">` for authed+tutorial-done users. wouter's `<Redirect>`
  fires its navigation once when it MOUNTS (the CRTFallback→Redirect swap on
  auth-resolve), so a fresh load of ANY authed route bounces to `/office`. This
  is intentional office-first design, but it also strips the iframe's `?embed=`.
- `PabloOffice.selectMode` rebuilt the `/office` URL from scratch, dropping all
  params.

## The fix (lib/embed-mode.ts `isEmbedMode()`)
Return true if ANY of: latched (sticky once detected) OR
`window.top !== window.self` (nested browsing context = the iframe) OR
`?embed=1`/`?chrome=0`.

**Why the iframe check is the bulletproof one:** the surveillance pane is ALWAYS
an iframe, so `top !== self` stays true even after the funnel strips the URL to
`/office` and even across hard reloads inside the frame. It never leaks to the
parent `/my-office` window, where `top === self`.

**How to apply:** any chrome that must hide inside the surveillance pane should
gate on `isEmbedMode()`, never on a raw `?embed=` query read (the query is not
durable). `selectMode` must preserve existing query params, not rebuild the URL.

## Verification gotcha
You cannot e2e-screenshot the embedded pane easily: fresh loads of `/my-office`
bounce to `/office` (office-first funnel), and the test harness can't reliably
do in-app client navigation. Verify by logic + per-file typecheck; the iframe
detection is what makes it correct regardless of the URL state.
