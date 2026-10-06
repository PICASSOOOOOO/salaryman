# SALARYMAN Godot game client

Godot is the native, player-facing game runtime for the downloadable SALARYMAN
OS application: it renders the building and owns real-time movement, collision,
and animation. It is not an optional renderer or a separate product. The Python
office simulation runs with it and remains authoritative for interaction rules,
finance, workers, and persistent state.

This game client is intentionally separate from `godot/art-dev`.

## Runtime boundary

- Pygame owns `OfficeState`, `TowerScene`, FIAT, workers, wages, persistence,
  and authoritative interaction validation.
- Godot receives versioned newline-delimited JSON snapshots over localhost TCP.
- Godot sends commands back over the same connection.
- Godot never writes finance, worker, or save data directly.
- Godot movement and animation are essential game features; requests and shared
  outcomes are validated by the Python simulation through the bridge.
- A complete downloadable SALARYMAN OS game runs both runtimes together. Neither
  the Godot client without its simulation nor a Python-only desktop bundle
  represents the complete game.

## Run in development

Install Godot 4 for your development OS and make `godot` available on `PATH`.
Run the Python launcher once; it starts the simulation and Godot game client as
a pair:

```bash
python -m pygame_sim
```

`--no-bridge` is reserved for isolated tests and is not the complete game
experience.

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

## Native office prop review

`office_prop.gd` authors the desk, reception counter, rotary telephone, pedestal
phone, and task lamp directly in Godot. `office_service_prop.gd` extends the same
material and surface-state family to the chair, ATM, and vending machine.
Parts have local pivots for later action
animations. Surface wear reflects the Python snapshot's condition/cleanliness;
the renderer does not advance decay or change interaction outcomes.

Run the focused native checks. Headless tests validate scripts and object
assembly, but a complete interactive build must run Godot with the Python
simulation connected:

```bash
godot --headless --path godot/office-client --script res://tests/office_props_test.gd
```

Render an isolated asset-review image with a graphics display available:

```bash
godot --path godot/office-client --resolution 1600x1000 \
  --script res://review/office_props_review.gd -- /absolute/path/office-props.png
```

The review scene is not gameplay footage or a published desktop build. Release
packages include the matching Godot runtime and launch it with the Python
simulation as one coordinated app.