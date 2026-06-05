---
name: World confinement — lethal gas, sealed offices, paid dogs
description: Design rules for how the SALARYMAN overworld is confined and how adoption is gated.
---

## Lethal poison gas confines the overworld
Outside `gasSafeZone` the fog is LETHAL: it drains `g.hp` by ~`maxHp/15` per second
(kills a full-HP player in ~15s) and sets `deathReason='Killed by the poison gas'`,
relying on the existing global `hp<=0` death path — do NOT add a second death check.
**Why:** the user's chosen mechanic for "limiting the outside world" is the gas itself
(not walls / strip-render). It replaced the older stamina-drain → blackout → hospital
behaviour, which was non-lethal and let players loiter in the fog.
**How to apply:** keep the gasmask / hazmat-escort / `subwayGrace` exemptions and the
`!frozenRef.current` guard intact — they are what make the safe zone (downtown rect +
year-clear disc + home/camp radius + subway) actually survivable. Don't reintroduce an
energy/stamina drain in the gas block or blackout→hospital will intercept the kill.

## Office / corporate front doors sealed until story active
`tryEnter` denies entry (sfxError + narr + return, BEFORE `getBuildingLock`) when
`isOfficeBuilding(bid) && !story.active`. Membership is by interior id in
`OFFICE_INTERIOR_IDS`.
**Why:** civic/survival buildings MUST stay open pre-story or onboarding breaks —
specifically `admin_bureau` (immigration/registration), plus `nexus_hub` and `police_hq`
are deliberately EXCLUDED. Locking those would soft-lock a brand-new player.
**How to apply:** the story does NOT start inside an office (it starts at the MX-75
beacon), so sealing offices never blocks story activation. `pablo_tower` is included and
is reachable once `story.active` (Mission 1 happens there). If a new corporate interior
is added, add its interior id to the set; never add civic/registration interiors.

## Strays are free-roaming; adoption is paid
Stray dogs still spawn and roam free. Adopting one costs `DOG_ADOPT_FEE` (FIAT),
charged once at the name-confirm step. There's an insufficient-funds guard at BOTH the
E-key trigger and the confirm handler; the stray is only removed from the world on a
successful paid adoption (failed/short attempts leave it in place to retry).
