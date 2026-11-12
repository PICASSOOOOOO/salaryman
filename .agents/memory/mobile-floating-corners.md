---
name: Mobile floating-button corners
description: How the app-level floating buttons share the bottom-right corner without overlapping on mobile.
---

# Bottom-right corner is shared real estate

Two **always-app-level** floating controls live bottom-right and used to overlap on phones:
- The global **chat FAB** (inside `ChatPanel`, ~60px on mobile, very high z) — mounted only when `showChat` (`isAuthenticated && !isFullscreenRoute && !isGameRoute`).
- The **AudioControl** speaker button (always mounted in App).

**Rule:** any new bottom-right floating element must coordinate with these, not blindly claim the corner.

**How it's solved:** App passes `chatFabPresent={showChat}` to `AudioControl`.
- When the FAB is present → AudioControl sits to its LEFT (safe-area-aware right offset).
- When absent (e.g. `/pablo` front door, in-game) → AudioControl returns to the plain corner, so it doesn't float over centered captions / input rows.

**Why:** stacking it straight UP overlapped the `/pablo` Send button & caption; offsetting left only when the FAB exists avoids both the FAB overlap AND the front-door overlap.

**Gotcha:** a right-anchored popup (AudioControl's panel is `w-60`/240px) clips off the LEFT edge on ~320px phones once the button is shifted left. Clamp it with `maxWidth: calc(100vw - <buttonRightOffset+12>px)` so it shrinks instead of clipping. Verify any new corner popup at 320px width.
