# SALARYMAN Godot art development

This is the Godot 4 animation and spatial-art review project for the shared
SALARYMAN game-asset contracts. It is deliberately separate from gameplay
authority:

- Godot previews and reviews character animation, floor tiles, wall atlases,
  and furniture/object sprites.
- The web app remains the live game runtime.
- The API remains the source of truth for art prompts, asset records, QA, and
  provider selection.
- Godot publishes rendered PNG frames to the existing API bridge so Art Factory
  can review the same output.

## Run locally

Start the existing web and API workflows, then open this directory in Godot 4:

```bash
godot --editor --path godot/art-dev
```

Run with the defaults:

```bash
godot --path godot/art-dev
```

The default asset host is the interview-helper Vite server at
`http://127.0.0.1:21129/`. Override it when the web server uses another host:

```bash
godot --path godot/art-dev \
  --asset-base=https://your-salaryman-host/ \
  --bridge-url=wss://your-salaryman-host/ws/godot/render
```

Production publishers must also provide `GODOT_RENDER_TOKEN`. Development is
allowed without a token when the API has no token configured.

## Controls

- `1`: walk cycle
- `2`: typing cycle
- `3`: reading cycle
- Left/right: direction
- Up/down: character palette
- Space: pause
- `+` / `-`: preview scale
- `R`: reload the sprite and reconnect the bridge

## Sprite contract

Character sheets are PNGs with 7 columns × 3 rows:

- Each frame is 16 × 32 pixels.
- Rows are down, up, right.
- Frames 0–2 are the walk poses.
- Frames 3–4 are typing.
- Frames 5–6 are reading.
- Left-facing output is derived by horizontal flip in the web runtime.

## Spatial review contract

The same scene also checks the current office spatial assets:

- Floor tiles: 16×16 PNG.
- Wall atlas: 64×128 PNG containing 16 bitmask pieces, each 16×32.
- Furniture/object sprites: dimensions and footprints come from
  `furniture-catalog.json`.

Godot is the review/blocking tool for these 2D spatial assets. Unreal remains
the explicit production renderer for realistic character templates, 3D
landscapes, and cinematics through the API's remote render-node contract.

This project intentionally previews the same sheet directly, so art changes are
visible in Godot before they are promoted into the web runtime.