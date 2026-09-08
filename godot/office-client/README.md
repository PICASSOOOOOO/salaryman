# SALARYMAN Godot office client

This is the optional high-resolution 2.5D isometric renderer for the standalone
Pygame office simulation. It keeps the pixel-art silhouette language while
using real 3D depth, shadows, and animation. It is intentionally separate from
`godot/art-dev`.

## Runtime boundary

- Pygame owns `OfficeState`, `TowerScene`, FIAT, workers, wages, persistence,
  and all interaction validation.
- Godot receives versioned newline-delimited JSON snapshots over localhost TCP.
- Godot sends commands back over the same connection.
- Godot never writes finance, worker, or save data directly.
- The 3D scene is presentation-only: room layout, movement, doors, and object
  outcomes still come from the Pygame snapshot/command protocol.

## Run

Start the authoritative simulation first:

```bash
python -m pygame_sim --bridge-port 4242
```

Then launch this project with Godot 4:

```bash
godot --path godot/office-client
```

The existing Pygame dashboard continues to work if Godot is closed. Use
`--no-bridge` when the bridge is not needed.

## Controls

- `WASD` / arrows: move
- `E`: interact with the nearby physical object
- `1`–`6`: move to the lobby, hallway, or one of the four offices
- `+` / `-` or mouse wheel: zoom the orthographic isometric camera
- `Space`: pause/resume the shift
- `N`: open/close the hiring desk
- `B`: start a short break
- `T`: toggle automatic breaks
- `R`: reconnect to Pygame

## Reference and asset notices

- The room observation/mission shape is an original adaptation of MiniGrid's
  discrete observation pattern. MiniGrid is Apache License 2.0; no MiniGrid
  source code is bundled here.
- The 3D camera/building presentation is informed by Agentshire, which is MIT
  licensed. The low-poly model files under `agentshire-assets/` are bundled
  CC0 assets from KayKit and Kenney as documented in
  `THIRD_PARTY_NOTICES.md`.
- Small Ambitions is GPL-3.0 and is used only as a visual reference; no code or
  assets from it are included.