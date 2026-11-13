"""Run the isolated pixel-art side-view scene with the live Python simulation."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pygame_sim import app


def launch_side_scroller(runtime, *, headless: bool = False) -> subprocess.Popen[bytes]:
    command = runtime.command()
    command.extend(["--resolution", "1180x720"])
    if headless:
        command.append("--headless")
    command.append("res://SideScrollerPrototype.tscn")
    return subprocess.Popen(
        command,
        cwd=runtime.project_dir,
        stdin=subprocess.DEVNULL,
    )


original_build_tower_scene = app.build_tower_scene


def build_side_scroller_scene():
    scene = original_build_tower_scene()
    # Floors 06 and 07 are consecutive playable floors and provide a real
    # elevator transition without inventing data for unfinished levels.
    if not scene.select_floor(6):
        raise RuntimeError("The side-view prototype could not start on Floor 06.")
    return scene


if __name__ == "__main__":
    app.launch_godot = launch_side_scroller
    app.build_tower_scene = build_side_scroller_scene
    raise SystemExit(app.run(sys.argv[1:]))
