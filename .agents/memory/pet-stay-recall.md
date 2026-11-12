---
name: Pet leave/recall + eastside apartments
description: How the "leave/recall pet" feature and multi-unit eastside_flat apartments work in WorldPlay.tsx, and the non-obvious constraints.
---

# Pet leave/recall (dog + cat)

`dogCompanion`/`catCompanion` carry a `stayAt: string` field (building bid where the pet was left; `''` = following). Persisted in `doSave` and restored on load alongside the other pet fields.

- When `stayAt` is set: world follow-AI is gated off (`!stayAt`), world sprite is hidden (`!stayAt`), interior sprite renders only when `stayAt === itr.bid` (or following).
- HUD STAY/COME buttons (per pet row) drive it. STAY requires being inside an interior (`g.interior`), sets `stayAt = g.interior.bid`. COME is GLOBAL (works anywhere) so a pet can never get stuck; it clears `stayAt` and snaps the pet's `x/y` (and `ix/iy` if indoors) to the player. React state `dogStay`/`catStay` drives the button label.

**Why the stayed-pet draw position derives from `itr.def` (exitX/exitY), not `ix/iy`:**
`ix/iy` are NOT persisted in the save — they reset to 0 on reload. Also FloorPanel "VISIT FLOOR" and the elevator create `g.interior` directly and bypass the `enterInterior` pet-placement code. So relying on `ix/iy` would draw a left pet at (0,0) after a reload or floor-visit entry. Computing the resting spot from the interior def each frame makes it correct on every entry path and across reloads.

**Interior bid namespace gotcha:** normal lobby entry sets `g.interior.bid = <building id>`; FloorPanel VISIT FLOOR sets `g.interior.bid = ${bid}_fl${floor}` (= `def.id`). These are different keys for the "same" building, BUT you always leave and re-enter a given physical place via the same door, so `stayAt === itr.bid` stays self-consistent per location. Not a bug — don't try to "unify" them.

# Eastside apartments

`BUILDING_FLOORS.eastside_flat` lists a lobby + several distinct unit floors (studio/one-bed/loft/penthouse). `generateApartmentInterior(bid, fl, dirLabel)` (module-level, before `generateFloorInterior`) renders a residential layout (bed/kitchenette/living/dining/study/bathroom/windows). `generateFloorInterior` early-returns it when `bid === 'eastside_flat' && fl.floor > 1` (floor 1 stays the generic lobby). `bed` is a valid `InteriorObject` type; there's no kitchen/fridge/sink type, so those reuse desk/vending_machine/water_cooler with home labels.
