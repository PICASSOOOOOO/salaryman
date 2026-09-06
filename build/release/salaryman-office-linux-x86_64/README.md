# SALARYMAN Office (Linux / x86_64)

## Run the desktop app

From this directory:

```bash
./pygame/SALARYMAN Office
```

The Pygame office simulation is authoritative and works without Godot.

## Optional Godot renderer

Start the Pygame app with its bridge enabled, then open
`godot-office-client` in Godot 4:

```bash
./pygame/SALARYMAN Office --bridge-port 4242
godot --path godot-office-client
```

The Godot client is an optional renderer and input surface. It does not own
FIAT, workers, persistence, or office rules.
