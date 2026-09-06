# SALARYMAN Godot office client

This is the optional polished renderer for the standalone Pygame office
simulation. It is intentionally separate from `godot/art-dev`.

## Runtime boundary

- Pygame owns `OfficeState`, `TowerScene`, FIAT, workers, wages, persistence,
  and all interaction validation.
- Godot receives versioned newline-delimited JSON snapshots over localhost TCP.
- Godot sends commands back over the same connection.
- Godot never writes finance, worker, or save data directly.

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
- `1`, `2`, `3`: move to the lobby, recreation room, or executive room
- `Space`: pause/resume the shift
- `N`: open/close the hiring desk
- `B`: start a short break
- `T`: toggle automatic breaks
- `R`: reconnect to Pygame