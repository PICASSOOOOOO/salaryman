---
name: SALARYMAN net-worth refocus
description: What "financial game on net worth + stamina" actually required in WorldPlay, and which parts are deeply entangled.
---

# SALARYMAN net-worth / stamina refocus

## Current character-status and economy model

Stamina is bodily health. There is no separate health/HP meter and characters
do not actually die: exhaustion makes them tired. Show stamina in the
Health/Inventory area using Zelda-like quarter-heart increments. Stamina capacity
should rise with better credit, experience, skills, item powers, and low net
worth; poor credit and high net worth reduce it. Items help balance those
tradeoffs. High-powered corporate characters also lose stamina hearts faster
than poorer characters; wealth therefore reduces both stamina capacity and
stamina endurance. Wealthy characters need more replenishing items or rest to
recover, limiting how long they can adventure primarily to make money.
Stamina recovery revenue must flow directly to the Picasso org.

Credit score represents the establishment's assessment and affects financial
systems. Net worth is the player's actual personal worth. Poorer players gain
physical power; wealthier players gain corporate power, job/access opportunities,
and influence. Wallet cash, bank balance, and net worth are three distinct
values: wallet is cash on hand ("cash is king"), bank money is subject to
capitalistic lending and interest algorithms, and net worth represents what the
player is actually worth.

The compact status HUD shows credit score, stamina, wallet cash, and net worth.
Clicking credit score or net worth opens the corresponding economy pages.

**Why:** the user clarified that stamina is health, no one actually dies, and
wealth, establishment credit, skills, items, access, power, and influence form
one connected progression system.

**How to apply:** do not add a separate HP/death model. Keep wallet, bank balance,
net worth, credit, and stamina distinct; balance poorer physical resilience and
slower stamina drain against wealthy corporate influence, with items as
counterweights. Give wealthy adventurers meaningful recovery costs and rest
needs so wealth does not also create unlimited adventure stamina; route recovery
item and rest revenue directly to the Picasso org.

## Legacy implementation risks

Older notes proposed removing wallet, levels/XP, and HP for a pure financial
game. That product direction is superseded: XP contributes to stamina capacity,
wallet cash remains visible, and stamina is the sole bodily health measure.
Existing damage, hazards, rescue, and hospitalization code is entangled, so
refactor it deliberately to exhaustion/tiredness rather than leaving any lethal
HP path behind.

## Existing economy invariants (preserve)
- **Voluntary debt is already blocked.** Every voluntary storefront in
  `WorldPlay.tsx` guards `if (g.salary < price) { sfxError(); setNarr('… INSUFFICIENT …'); return; }`
  before deducting. Only INVOLUNTARY charges (taxes, fines, debt-enforcement
  beatings, auto-rent/utilities) push `g.salary` negative — which is exactly
  the spec ("negative net worth only involuntarily"). Do NOT add a blanket
  negative-balance clamp; it would break the involuntary path.

## Entangled / high-risk (stamina-as-health refactor)
- `g.hp` has ~198 references. It drives the LETHAL death route (`g.hp<=0` →
  dead body + `setIsDead` + hospital cinematic, ~line 12239), is the field the
  MP/arena battle resolver returns (`outcome.playerHpRemaining` → `g.hp`), and
  is hit by environmental hazards (poison ~11082, radiation ~10517, hypothermia
  ~14349, starvation ~14381, acid ~14739) AND by dozens of building heals.
- A separate exhaustion/rescue route already exists. The current product
  direction is nonlethal: route exhaustion to tired/rescue behavior, not death.
- Converting combat and hazards to the stamina-only model is a substantial
  refactor. Test combat, exhaustion, rescue, and multiplayer sync; never retain
  a lethal death route.

## Misc
- Unemployment stipend cadence lives in api-server `lib/salary.ts`
  (REAL_MS_PER_GAME_DAY = 1 real hour = 1 in-game day; idempotent whole-day
  cursor). Consumers: `useUnemploymentSalary.ts`, `PabloOffice.tsx`.
- Desktop had NO visible COMMS button (only buried terminal menu + `C` key);
  mobile already had a CHAT quick-action. Added a persistent top-right COMMS
  pill (left of the global AudioControl, which now sits top-right in-game).
