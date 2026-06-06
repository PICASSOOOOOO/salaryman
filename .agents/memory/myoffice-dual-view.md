---
name: MyOffice Dual View + route consolidation
description: The /my-office "Dual View" flagship (work + live surveillance) and the publish-prep route-consolidation posture.
---

# /my-office "Dual View" flagship
`/my-office` is the showcase for the reusable dual-pane `SplitWorkspace`
(`components/classroom/SplitWorkspace.tsx`, stacks vertically <768px). An opt-in
"Dual View" toggle (persisted `localStorage myoffice:dualView`) swaps the normal
single-column dashboard for SplitWorkspace with modules: surveillance (singleton),
dashboard, events, holdings, economy.

**Surveillance pane = same-origin `<iframe src={BASE_URL}office?mode=surveillance>`**,
not an embedded PixelOffice engine. **Why:** the live office renderer's camera/
viewport sizing is window-driven and fights a resizable pane; the iframe reuses the
real `/office` surveillance view (cast, camera, CCTV overlay) and sizes cleanly,
shares the session cookie, and is lazy (`loading="lazy"` + only mounted when Dual
View is on AND a pane has the surveillance module selected). Tradeoff: it boots a
second app instance (extra polling/audio/WS) — acceptable for an opt-in power view.
**How to apply:** to add more dual-pane pages, reuse SplitWorkspace + extract the
page's sections into `const` JSX blocks shared by both single- and dual-view so the
default layout stays byte-identical; mark any pane that must be unique `singleton`.

# Publish-prep consolidation posture (user-approved AGGRESSIVE)
Owner explicitly chose the most aggressive cleanup: repoint in-app links to canonical
module paths, then DELETE still-dead flat redirect aliases — do NOT re-add legacy
redirects for bookmark compatibility. Removed flat paths (features, rebellion,
manifesto, jean-claw, contacts, hiring, calendar, documents, studio, lab, campaigns,
reporting) now fall through to the catch-all NotFound (`pages/not-found.tsx`), which
is graceful (offers "Return to Workspace" → "/"). **Why:** architect flagged 404s on
stale bookmarks as a risk, but the owner's call wins and the friendly 404 is the
agreed mitigation. Kept /dashboard, /agents, /seo redirects (still referenced).
