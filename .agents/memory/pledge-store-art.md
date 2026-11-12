---
name: Pledge store product art
description: Why /pledge cards use static glob PNGs instead of the runtime art kit, and how to add/replace one.
---

# Pledge store product images
Each /pledge catalog item shows a baked-in PNG resolved by `item.id`, NOT the runtime
Salaryman art kit (`useArtAsset`/`/api/art/asset/:key`).

**Why:** the runtime Nano Banana pipeline is credit-exhausted (api logs `402 Insufficient
credit`), so any new `SALARYMAN_ART_KIT` entry just stays `failed` and falls back to the emoji
forever. Static assets generated once via the media-generation `generateImage` skill (a
different, working generator) are reliable and ship in the bundle.

**How to apply:**
- Images live in `artifacts/interview-helper/src/assets/pledge/<catalog_id>.png`, loaded by an
  eager `import.meta.glob("../assets/pledge/*.png")` → `PLEDGE_IMAGE_BY_ID` map in
  `PledgeStore.tsx`. Filename stem MUST equal the server `PLEDGE_CATALOG` item `id`.
- To add/replace art: regenerate the PNG with the SALARYMAN style (isometric pixel-art
  neon-noir, deep navy bg, pink #f472b6 + cyan #22d3ee rim light) into that folder under the
  matching id — no server/catalog change needed.
- Always keep the emoji (`item.icon`) fallback path: render emoji when no PNG matches OR the
  `<img>` `onError` fires (card uses an `imgFailed` map, modal uses local `heroFailed`).
