---
name: Gas / fuel system
description: How vehicle gas meters, refueling, and home-stove cooking work in SALARYMAN
---

# Gas / fuel economy (SALARYMAN, artifacts/interview-helper)

Vehicles have a power class (helpers near VEHICLE_POWER ~WorldPlay line 2587):
`vehiclePower(id)` / `vehicleNeedsGas(id)` — electric (hover_scooter, battery),
manual (cargo_bike, pedal), gas (everything else). Only gas vehicles burn fuel.

- Gas meters live in CLIENT save state `g.vehicleGas` (Record<id,units>) +
  `g.homeGas` (number); both persisted in the save blob. Caps via
  `vehicleGasCap(id)` (per-category) and `HOME_GAS_CAP=100`.
- Burn while driving: `GAS_BURN_PER_PX` per px traveled in the movement loop.
  Empty tank → `gasOut` forces walking speed (no vehicle multiplier) + floaters.
- Refuel is RAW UNITS, not an inventory item. `POST /api/utility/refuel`
  (artifacts/api-server/src/routes/utility.ts) charges
  `units*GAS_UNIT_PRICE_FIAT` via `spendEarnedFiat` (402 on short), books
  `recordUtilityRevenue({kind:"gas"})`, capped at MAX_REFUEL_UNITS=200. The
  server only collects money + books revenue; the client credits its own meter
  from the returned `units` (UtilityStation refuel callbacks → doSaveRef).
- UI: UtilityStation gas mode renders `<RefuelSection>` — vehicle tank bar +
  home gas bar, with explicit ELECTRIC/PEDAL "no gas needed" notices.

Home cooking: apartment kitchenette has a `stove` interior object (new type in
worldInteriorData.ts InteriorObject union + a renderer case in WorldPlay).
Stove interaction needs `g.homeGas >= HOME_GAS_PER_COOK`, consumes it, grants
`HOME_COOK_ENERGY` to **g.energy** (the survival stamina — NOT combat
g.stamina), and upgrades a held raw cookable (ANIMAL_DROPS_BY_ID→COOKED_FOODS)
to a cooked meal.

**Why g.energy:** task spec mandated reusing the existing survival stamina stat,
matching the bed/camp restore precedent; combat g.stamina is a separate pool.
