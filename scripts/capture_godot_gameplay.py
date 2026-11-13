"""Capture the real Godot client paired with the authoritative Python simulation."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pygame_sim import app

CAPTURE_FPS = int(os.environ.get("SALARYMAN_CAPTURE_FPS", "12"))
CAPTURE_SECONDS = int(os.environ.get("SALARYMAN_CAPTURE_SECONDS", "6"))
CAPTURE_FLOOR = int(os.environ.get("SALARYMAN_CAPTURE_FLOOR", "1"))
OUTPUT_NAME = os.environ.get("SALARYMAN_CAPTURE_OUTPUT", "godot-gameplay.avi")
if Path(OUTPUT_NAME).name != OUTPUT_NAME or not OUTPUT_NAME.endswith(".avi"):
    raise ValueError("SALARYMAN_CAPTURE_OUTPUT must be a simple .avi filename.")
if not 1 <= CAPTURE_FPS <= 30 or not 1 <= CAPTURE_SECONDS <= 30:
    raise ValueError("Gameplay capture must be 1–30 fps and 1–30 seconds.")
if CAPTURE_FLOOR not in {1, 6, 7, *range(8, 13)}:
    raise ValueError("Capture floor must be a current playable Tower floor.")
OUTPUT = ROOT / "generated-artifacts" / OUTPUT_NAME
OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def steer(capture_started_at):
    """Send real input while the short gameplay capture is still running."""
    window_deadline = time.monotonic() + min(4.0, max(1.0, CAPTURE_SECONDS * 0.55))
    found = []
    while time.monotonic() < window_deadline:
        found = subprocess.run(
            ["xdotool", "search", "--name", "SALARYMAN Office Client"],
            capture_output=True, text=True,
        ).stdout.splitlines()
        if found:
            break
        time.sleep(0.1)
    if not found:
        print("No Godot window found for movement capture.", flush=True)
        return
    window = found[-1]
    subprocess.run(["xdotool", "windowfocus", "--sync", window], check=True)
    movement_seconds = (
        CAPTURE_SECONDS - (time.monotonic() - capture_started_at) - 0.2
    )
    if movement_seconds <= 0.2:
        print("Godot opened too late for the movement portion of the capture.", flush=True)
        return
    key_duration = movement_seconds / 4.0
    for key in ["d", "s", "a", "w"]:
        try:
            subprocess.run(["xdotool", "keydown", key], check=True)
            time.sleep(key_duration)
            subprocess.run(["xdotool", "keyup", key], check=True)
        except subprocess.CalledProcessError:
            print("Godot closed before movement capture finished.", flush=True)
            return


def capture(runtime, *, headless=False):
    env = os.environ.copy()
    env.pop("SDL_VIDEODRIVER", None)
    capture_started_at = time.monotonic()
    process = subprocess.Popen(
        runtime.command() + [
            "--display-driver", "x11", "--resolution", "1180x720",
            "--write-movie", str(OUTPUT), "--fixed-fps", str(CAPTURE_FPS),
            "--quit-after", str(CAPTURE_FPS * CAPTURE_SECONDS),
        ],
        cwd=runtime.project_dir, env=env,
    )
    threading.Thread(target=steer, args=(capture_started_at,), daemon=True).start()
    return process


if __name__ == "__main__":
    app.launch_godot = capture
    if CAPTURE_FLOOR != 1:
        original_build_scene = app.build_tower_scene

        def build_capture_scene():
            scene = original_build_scene()
            if not scene.select_floor(CAPTURE_FLOOR):
                raise RuntimeError(f"Floor {CAPTURE_FLOOR} is not playable in the current Tower.")
            return scene

        app.build_tower_scene = build_capture_scene
    with tempfile.TemporaryDirectory(prefix="salaryman-capture-") as temp:
        raise SystemExit(app.run(["--save-file", str(Path(temp) / "office.json")]))
