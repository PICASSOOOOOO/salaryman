---
name: SALARYMAN art pipeline (Nano Banana)
description: How in-game art is generated/served, and the Pro-API aspect/format limits that break tiles & transparency.
---

# Art kit pipeline
- All in-game art is generated server-side and lazily baked. To add art: append an entry to
  `SALARYMAN_ART_KIT` in `artifacts/api-server/src/lib/salaryman-art.ts` (key/category/subject/aspectRatio).
  One shared style suffix (`SALARYMAN_STYLE`) is auto-appended to every prompt.
- Served via `GET /api/art/asset/:key` (public; creates the row + kicks off generation on first hit).
  Client consumes with `useArtAsset(key)` from `artifacts/interview-helper/src/lib/art.ts`.
- Boot seeder only kicks off the first ~8 missing entries; new entries near the end of the kit won't
  auto-bake at boot — hit their `/api/art/asset/:key` once (or POST `/api/art/seed`, admin) to bake.

# Nano Banana Pro (apipass) hard limits — IMPORTANT
**Why:** discovered while generating world-rebuild tiles — "1:1" tiles came back 16:9, not square.
- `createImageTask` only sends `prompt` + `aspect_ratio` (+ optional ref `images`). It maps ANY ratio to
  just `LANDSCAPE` or `PORTRAIT` (w>=h ⇒ LANDSCAPE). So **there is no true 1:1/square output** and
  requesting "1:1" yields a landscape image.
- `outputFormat` in GenerateImageOptions is **never sent** to the API → output is effectively the model
  default (jpg-like), and **transparent backgrounds are NOT reliable**. The kit works around this by
  baking subjects on a flat "dark navy void" that blends with the world's dark ambient.
**How to apply:** for seamless square tiles or alpha-cutout sprites, do NOT rely on this pipeline as-is.
Options: generate landscape then crop/slice client-side, chroma-key the navy at draw time, or extend
the pipeline to pass a real square size + format. Isometric buildings on dark navy void DO work well.
