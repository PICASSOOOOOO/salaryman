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
CAPTURE_KEYS = [
    key.strip().lower()
    for key in os.environ.get("SALARYMAN_CAPTURE_KEYS", "space").split(",")
    if key.strip()
]
OUTPUT_NAME = os.environ.get("SALARYMAN_CAPTURE_OUTPUT", "godot-gameplay.avi")
if Path(OUTPUT_NAME).name != OUTPUT_NAME or not OUTPUT_NAME.endswith(".avi"):
    raise ValueError("SALARYMAN_CAPTURE_OUTPUT must be a simple .avi filename.")
if not 1 <= CAPTURE_FPS <= 30 or not 1 <= CAPTURE_SECONDS <= 30:
    raise ValueError("Gameplay capture must be 1–30 fps and 1–30 seconds.")
if CAPTURE_FLOOR not in {1, 6, 7, *range(8, 13)}:
    raise ValueError("Capture floor must be a current playable Tower floor.")
if not CAPTURE_KEYS or any(key not in {"w", "a", "s", "d", "space"} for key in CAPTURE_KEYS):
    raise ValueError("Gameplay capture keys must be a comma-separated list of W, A, S, D, or SPACE.")
OUTPUT = ROOT / "generated-artifacts" / OUTPUT_NAME
OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def steer(process):
    """Send enough real input to appear in Godot Movie Maker's slow capture."""
    # The Replit llvmpipe renderer can record at only a few percent of real time.
    # Wait for the window, then hold movement long enough to span visible frames.
    window_deadline = time.monotonic() + min(45.0, max(15.0, CAPTURE_SECONDS * 5.0))
    found = []
    while process.poll() is None and time.monotonic() < window_deadline:
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
    time.sleep(min(24.0, max(10.0, CAPTURE_SECONDS * 3.0)))
    if process.poll() is not None:
        return
    key_duration = min(30.0, max(1.0, CAPTURE_SECONDS * 5.0))
    print("Sending movement input to the Godot capture window.", flush=True)
    for key in CAPTURE_KEYS:
        try:
            subprocess.run(["xdotool", "keydown", key], check=True)
            time.sleep(min(5.0, max(1.0, float(CAPTURE_SECONDS))) if key == "space" else key_duration)
            subprocess.run(["xdotool", "keyup", key], check=True)
        except subprocess.CalledProcessError:
            print("Godot closed before movement capture finished.", flush=True)
            return
    print("Gameplay movement input finished.", flush=True)


def capture(runtime, *, headless=False):
    env = os.environ.copy()
    env.pop("SDL_VIDEODRIVER", None)
    process = subprocess.Popen(
        runtime.command() + [
            "--display-driver", "x11", "--resolution", "1180x720",
            "--write-movie", str(OUTPUT), "--fixed-fps", str(CAPTURE_FPS),
            "--quit-after", str(CAPTURE_FPS * CAPTURE_SECONDS),
        ],
        cwd=runtime.project_dir, env=env,
    )
    threading.Thread(target=steer, args=(process,), daemon=True).start()
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
