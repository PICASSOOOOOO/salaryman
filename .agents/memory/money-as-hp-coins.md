---
name: Money-as-HP coin spill
description: How taking damage converts to money loss + the spilled-coin visual in SALARYMAN WorldPlay.
---
# Money-as-HP coin spill

Taking damage spills gold coins that equal the ACTUAL money the player loses.
The drain is gated on an HP-delta watch (`g.coinPrevHp`) in the update loop: any
frame where `g.hp` drops by >0.5 since last frame triggers it, so it covers ALL
damage sources (combat, poison, hunger, radiation, gas, hypothermia) without
per-hook edits.

**Mapping (the convention to keep consistent):**
- `COIN_VALUE_FIAT = FIAT_PER_GOLD / 10` → 10 coins per gold bar.
- `MONEY_PER_HP = COIN_VALUE_FIAT` → 1 HP of damage = 1 coin = 10,000 fiat (FIAT_PER_GOLD is 100000).
- Money comes from CASH (`g.salary`) first, then GOLD (`g.goldBalance`, in bars). PROPERTY is never touched by damage — property is only mortgaged/sold to pay debt (separate, not yet built).

**Why these choices:**
- `cashHeld = Math.max(0, g.salary)` for both the avail cap and the cash deduction — a negative salary is debt, not spendable cash, and would otherwise corrupt the math.
- `Math.floor` (not round) on coin count so fractional passive ticks never over-charge; the dropped <1-coin remainder errs in the player's favor.
- Coins lost are capped to what the player actually holds (`avail`).
- Visual: 1 particle per coin (no per-spill cap beyond a 200 safety loop); the only real ceiling is the 160-entry `g.coins` array splice. Coins deteriorate near end of life (shrink + fade + flicker + vibrate via decay = 1 - life/maxLife). SFX: `sfxCoin()`.

**How to apply:** when building the full money-as-HP death=bankruptcy step or the WORLD REBUILD economy, reuse this mapping. Don't introduce a second fiat↔coin rate. Tune `MONEY_PER_HP` if passive-tick drain feels too harsh (it's a one-line change).
