# SALARYMAN Office (Linux / x86_64)

## Run the desktop app

From this directory:

```bash
./launch-salaryman-office.sh
```

The Pygame office simulation is authoritative and works without Godot.

## Add a branded desktop launcher (Linux)

From this directory:

```bash
./install-desktop.sh
```

This installs a SALARYMAN Office application shortcut and icon into your
user-local desktop applications folder. Keep this extracted directory in place
after installing the shortcut.

## Optional Godot renderer

Start the Pygame app with its bridge enabled, then open
`godot-office-client` in Godot 4:

```bash
./pygame/SALARYMAN Office --bridge-port 4242
godot --path godot-office-client
```

The Godot client is an optional renderer and input surface. It does not own
FIAT, workers, persistence, or office rules.
