# SALARYMAN Office (Linux / x86_64)

## Run the desktop app

No Docker is required. Extract the archive, open its folder,
and double-click `START-SALARYMAN`. If your Linux file manager asks, choose
**Run** or **Allow Launching**.

You can also launch it from a terminal opened in this directory:

```bash
./launch-salaryman-office.sh
```

SALARYMAN OS opens the Godot game as its player-facing window and runs the
Python simulation as its hidden, authoritative companion for finance, workers,
interactions, and persistent state. Both runtimes are bundled and shut down
together; no separate Godot installation is required.

## Add a branded desktop launcher (Linux)

From this directory:

```bash
./install-desktop.sh
```

This installs a SALARYMAN Office application shortcut and icon into your
user-local desktop applications folder. Keep this extracted directory in place
after installing the shortcut.


## Runtime layout

`pygame/` contains the launcher and simulation, `godot-runtime/` contains the
matching Godot engine, and `godot-office-client/` contains the game client. Start
SALARYMAN OS using the launcher above; it opens both components and shuts down
the pair together.

Godot is distributed under the MIT license; see `godot-runtime/LICENSE.txt`.
