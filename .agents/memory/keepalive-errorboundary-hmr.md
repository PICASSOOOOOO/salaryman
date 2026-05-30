---
name: Keep-alive ErrorBoundary + HMR self-heal
description: Why transient Fast-Refresh hook-order crashes used to permanently brick the always-mounted Console terminal, and the dev-only fix.
---

Rule: The interview-helper app keeps `Console` (the "terminal") and the home panel
permanently mounted but hidden (`display:none`) inside their own `ErrorBoundary`
(App.tsx keep-alive block). A React `ErrorBoundary` does not reset on its own, so any
caught render error leaves that subtree stuck on the fallback for the rest of the
session — even after the code is valid again. `ErrorBoundary` now listens for Vite's
`vite:afterUpdate` HMR event and clears its error state (dev-only; `import.meta.hot`
is undefined in prod, so no production behavior change).

**Why:** A user reported "errors/glitches in nebula and terminal." The only real JS
error was a hook-order crash whose flattened hook list = `useAuth()` (6 hooks) +
`usePlan()` (useState, useRef, useRef). Signature was a Fast-Refresh artifact from
adding a second `useRef` (reqIdRef) to `usePlan` — both hooks are linear, no
conditional hook exists. The crash itself is transient, but the keep-alive boundary
made it look permanent.

**How to apply:** If someone reports the terminal/home stuck on the error fallback in
dev after an edit, it's this pattern — not a real conditional-hook bug. A full reload
or the next HMR update clears it. Don't re-investigate `usePlan`/`useAuth` for
conditional hooks. The THREE.Clock deprecation warning on /pablo is emitted by
@react-three/fiber internally (not app code) and is harmless.
