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

## Dog companion names are GLOBALLY unique (enforced at the SAVE write path)
Uniqueness is enforced server-side in the `PUT /salaryman/saves/:slot` upsert, NOT via a
DB constraint. The preflight `GET /salaryman/dog-name-available` is UX-only — the client
blocks adoption on it (defaults to unavailable; only adopts on `available===true`) but it
is advisory; the write path is authoritative. Both compare
`upper(trim(data->'dogCompanion'->>'name'))` and exclude the caller's own saves.
**Why:** a DB unique index is unworkable here — names live inside the `data` jsonb blob,
pre-existing saves already hold dup/legacy names, and high-frequency autosaves would
constantly trip a hard constraint. So we validate ONLY on the adoption *transition*
(incoming active dog name differs from the prior persisted one); steady-state autosaves
of an already-owned dog never re-check.
**How to apply:** the transition check + upsert run in ONE `db.transaction` holding
`pg_advisory_xact_lock(hashtext(name))` (closes the TOCTOU between check and write so two
concurrent same-name adoptions can't both commit). On conflict: revert `dogCompanion` to
prior, refund `DOG_ADOPT_FEE` into BOTH the blob `data.salary` AND the `salary` column
(shared `salaryColumn` var feeding the upsert), and return `dogNameRejected:true` so the
rest of the save still persists and the player isn't charged. On accept: canonicalize the
stored name (trim+upper) so future lookups match. This mirrors the deferred
player-name-uniqueness model. The upsert is factored into `writeSave(exec)` typed
`Pick<typeof db,"insert">` so it runs against either `db` or the tx.

## Cat companion: parallel to dog, SEPARATE name namespace
A CAT companion mirrors the dog exactly (state, follow/combat AI, clinic+3-crystal
healing, stray+adopted sprites, HUD chip 🐈, async preflight `GET /salaryman/cat-name-available`,
naming panel). Cats are INDEPENDENT — a player may own both a dog AND a cat at once.
**Why:** request was "add cats too same details" — faithful parity with dog, not a redesign.
**How to apply:** the PUT save write-path computes `dogTransition` and `catTransition`
independently and runs BOTH in ONE `db.transaction`. Advisory locks are NAMESPACED:
`pg_advisory_xact_lock(hashtext('dog:'+name))` vs `hashtext('cat:'+name)` — so the same
name is allowed across species but unique within a species. Dup-checks compare
`data->'catCompanion'->>'name'` separately from dog. On conflict: revert the offending
companion blob, refund the species fee into BOTH `salary` column and blob `data.salary`,
return `catNameRejected` (alongside `dogNameRejected`). NOTE: client does NOT consume
`catNameRejected`/`dogNameRejected` — conflicts are caught by the async preflight before
charging; server refund is the safety net. The E-key adopt uses an `openedAdopt` local
flag so a single keypress opens at most ONE adopt panel (dog wins if both strays adjacent).
