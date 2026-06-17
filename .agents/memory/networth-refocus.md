---
name: SALARYMAN net-worth refocus
description: What "financial game on net worth + stamina" actually required in WorldPlay, and which parts are deeply entangled.
---

# SALARYMAN net-worth / stamina refocus

The push to make SALARYMAN a pure financial game (net worth + stamina, no
wallet/levels/XP/HP) splits cleanly into a SAFE set and an ENTANGLED set.

## Already-true / low-risk (don't re-litigate)
- **Voluntary debt is already blocked.** Every voluntary storefront in
  `WorldPlay.tsx` guards `if (g.salary < price) { sfxError(); setNarr('… INSUFFICIENT …'); return; }`
  before deducting. Only INVOLUNTARY charges (taxes, fines, debt-enforcement
  beatings, auto-rent/utilities) push `g.salary` negative — which is exactly
  the spec ("negative net worth only involuntarily"). Do NOT add a blanket
  negative-balance clamp; it would break the involuntary path.
- **Levels/XP removal = gut `applyExpGain` to a no-op** (keep the 9-arg
  signature so ~14 combat/kill call sites still compile). `noUnusedLocals:false`
  in tsconfig.base.json means the now-dead EXP_TABLE/MAX_LEVEL/expToLevel/
  LEVEL_MILESTONES consts don't error. Player level frozen at baseline ⇒ attack
  formula `20 + (level-1)*5` collapses to 20 ⇒ "fixed difficulty" for free
  (enemy THREAT_* stats are already constants, never level-scaled). Skill tree
  keeps existing `skillPoints`, just no new grants.

## Entangled / high-risk (HP + combat — a real refactor, not a tweak)
- `g.hp` has ~198 references. It drives the LETHAL death route (`g.hp<=0` →
  dead body + `setIsDead` + hospital cinematic, ~line 12239), is the field the
  MP/arena battle resolver returns (`outcome.playerHpRemaining` → `g.hp`), and
  is hit by environmental hazards (poison ~11082, radiation ~10517, hypothermia
  ~14349, starvation ~14381, acid ~14739) AND by dozens of building heals.
- A SEPARATE collapse route already exists: `g.energy<=0 && g.hp>0` →
  rescuable CRITICAL (120s) → hospital cinematic. The spec's "0-stamina
  blackout→hospital" wants combat to route here instead of the HP-death route.
- Converting combat to stamina means redirecting the ~6 player-damage sites
  (5685 resolver, 7740, 10740, 11632, 15189, 14965) and the resolver's
  hp/maxHp interface to energy, then deciding what HP-driven death/env-hazards
  become. This is the bulk of the work and must be tested live (combat + death
  + hospital + MP sync), not just typechecked. Deferred as a follow-up.

## Misc
- Unemployment stipend cadence lives in api-server `lib/salary.ts`
  (REAL_MS_PER_GAME_DAY = 1 real hour = 1 in-game day; idempotent whole-day
  cursor). Consumers: `useUnemploymentSalary.ts`, `PabloOffice.tsx`.
- Desktop had NO visible COMMS button (only buried terminal menu + `C` key);
  mobile already had a CHAT quick-action. Added a persistent top-right COMMS
  pill (left of the global AudioControl, which now sits top-right in-game).
