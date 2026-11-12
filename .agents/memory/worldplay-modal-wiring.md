---
name: WorldPlay modal/overlay wiring
description: The full set of places a new full-screen overlay/modal must be wired into WorldPlay, including the easy-to-miss ESC reset block.
---

Adding a new full-screen overlay/modal to `WorldPlay.tsx` (e.g. a storage locker, shop, panel) requires wiring it into FOUR places, not one. Missing any of them is a silent UX bug, not a type error.

1. **Freeze chain** — add `|| showX` to the `frozenRef.current = ...` assignment (the synchronous one, NOT in an effect). This pauses the game engine while the overlay is open.
2. **ESC detect** — add `|| showX` to the `const anyModalOpen = ...` expression in the `Escape` key handler.
3. **ESC reset block** — add `setShowX(false)` inside the `if (anyModalOpen) { ... }` body alongside the other `setShow*(false)` setters. **This is the one that gets forgotten:** step 2 makes ESC *think* a modal is open (so it runs the reset + `doSave`), but without a matching setter the overlay never closes and unrelated reset/save logic fires anyway.
4. **Render** — render `{showX && <Overlay onClose={() => setShowX(false)} />}` (placing it before another overlay block is fine).

**Why:** the ESC handler has a detect-list and a separate reset-list that must stay in lockstep; they are hand-maintained sibling expressions with no shared source, so a new overlay added to one but not the other half-works.
**How to apply:** whenever you introduce a `const [showX, setShowX] = useState(false)` overlay, grep for an existing overlay's state name (e.g. `showVend`) across the file and mirror every occurrence.
