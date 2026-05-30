---
name: Comms toast / alert architecture
description: Where comms pop-up toasts originate, why they don't fire in the city, and how DND-while-playing is wired
---

# Comms pop-up toast architecture (SALARYMAN / interview-helper)

- The comms pop-up toasts (new DM/company/Pablo messages + associate requests)
  are generated **inside `ChatPanel.tsx`** via two `useEffect`s, gated on
  `useCommsAlerts()`.
- `ChatPanel` is mounted by `App.tsx` only when
  `showChat = isAuthenticated && !isFullscreenRoute && !isGameRoute`. So on
  fullscreen/game routes (`/world`, `/world/play`, `/mobile`, `/game`, etc. —
  see `FULLSCREEN_ROUTES`/`GAME_ROUTES` in App.tsx) ChatPanel UNMOUNTS and its
  toasts do **not** fire at all today. A separate effort is making pop-ups show
  in the city; until that lands, toast gating changes in ChatPanel are inert on
  those routes.

## DND-while-playing ("Do Not Disturb while in city")
- Preference + live state live in `src/lib/commsAlerts.ts`:
  - `useCommsCityDnd()` — persisted opt-IN preference (localStorage key
    `salaryman_comms_city_dnd` = "1"; missing = off). Mirrors the master
    `useCommsAlerts()` pattern.
  - `setImmersiveViewActive(bool)` / `useImmersiveViewActive()` — a NON-persisted
    module-level **ref-count** + custom-event tracker. Ref-count (not a bool)
    tolerates one immersive view mounting before the previous unmounts.
- `WorldPlay.tsx` calls `setImmersiveViewActive(true)` on mount /
  `(false)` on unmount. **Why module-level, not a route check inside ChatPanel:**
  ChatPanel can't see the city route (it's unmounted there), so the flag must
  live outside any single component and survive ChatPanel's mount lifecycle.
- ChatPanel suppresses both toast effects when
  `commsCityDndOn && immersiveViewActive`, but still walks messages / updates
  seen-ids so badge/unread counts stay correct.
- **How to apply:** any new immersive/full-screen view that should silence comms
  pop-ups under this preference must call `setImmersiveViewActive(true/false)`
  in a mount effect; do NOT try to detect the route from ChatPanel.
