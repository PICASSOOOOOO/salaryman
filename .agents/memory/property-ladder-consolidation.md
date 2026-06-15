---
name: Property ladder + realty surface consolidation
description: Single-source property catalog, the live realty route, the retired homebase fork, and the ƒ renovate flow.
---

# Property ladder is one registry

`artifacts/interview-helper/src/lib/property-catalog.ts` is the single source of truth for every property template (artKey, kind, tier, rent, perks, `pledgeSku`) plus `tierForArtKey`, `TIER_LABOR_COST`, `renovationLaborCost`. Both the ƒ realty showroom and pledge coherence derive from it. `owned-office.ts` sources its tier map from the registry.

**Why:** the task brief was explicit — "do NOT fork a parallel system." There used to be three hand-copied catalogs.

# The live realty surface is RealtyStore (homebase picker was a fork)

`/store/realty` renders **RealtyStore** (real buy/rent + ƒ renovate). It previously rendered `VendingMachine initialTab="homebase"`, whose `HomebaseTab` was a **duplicate** catalog with a stub "CHOOSE AS HOMEBASE" button that only `console.log`'d (V1, no persistence). That homebase tab + its `HOMES`/`OFFICES`/`PropertyTemplate`/`useMarketIndex`/`PropertySection`/`PropertyCard`/`Stat` block was deleted; **VendingMachine is now cosmetics-only** (`/vending`). In-app links to realty live in Game Hub and Economy (`to="/store/realty"`).

**Why:** user chose "repoint" and said "don't make any new pages, combine, keep it simple."

# ƒ renovate (labor-cost customization)

`POST /api/real-estate/customize` (real-estate.ts) does an atomic FOR UPDATE ƒ debit; cost by tier via `TIER_LABOR_COST`; **no-op change = 0 cost**, insufficient ƒ = 402. Pure helpers `planRenovation` + `sanitizeCustomization` are unit-tested. The interior render already applies `data.propertyCustomization[buildingId]` (themeColor accent + signage); home is keyed by `hamletBuildingId`. **Drift:** the `/office` PixelOffice is NOT wired to customization (deed-only) — left as follow-up.

**How to apply:** when adding a property tier or art, edit property-catalog.ts ONLY; never re-introduce an inline catalog in a page.
