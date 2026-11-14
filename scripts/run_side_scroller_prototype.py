"""Run the isolated pixel-art side-view scene with the live Python simulation."""

from __future__ import annotations

import subprocess
import sys
import tempfile
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
    # elevator transition without inventing data for unfinished levels. The
    # object cluster is a compact, walkable showcase of native Godot props.
    if not scene.select_floor(6):
        raise RuntimeError("The side-view prototype could not start on Floor 06.")
    scene.player_position = (31_500, 1_500)
    return scene


if __name__ == "__main__":
    app.launch_godot = launch_side_scroller
    app.build_tower_scene = build_side_scroller_scene
    if any(
        arg == "--save-file" or arg.startswith("--save-file=")
        for arg in sys.argv[1:]
    ):
        raise SystemExit("The side-view prototype always uses a temporary save file.")
    with tempfile.TemporaryDirectory(prefix="salaryman-side-view-") as temp_dir:
        save_path = str(Path(temp_dir) / "office.json")
        raise SystemExit(app.run(["--save-file", save_path, *sys.argv[1:]]))
