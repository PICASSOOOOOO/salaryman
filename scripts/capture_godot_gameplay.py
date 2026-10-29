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

OUTPUT = ROOT / "generated-artifacts" / "godot-gameplay.avi"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def steer():
    """Send real window input; do not fabricate scene snapshots."""
    time.sleep(15)
    found = subprocess.run(
        ["xdotool", "search", "--name", "SALARYMAN Office Client"],
        capture_output=True, text=True,
    ).stdout.splitlines()
    if not found:
        print("No Godot window found for movement capture.", flush=True)
        return
    window = found[-1]
    subprocess.run(["xdotool", "windowfocus", window], check=True)
    for key in ["d", "s", "a", "w"]:
        subprocess.run(["xdotool", "keydown", key], check=True)
        time.sleep(2)
        subprocess.run(["xdotool", "keyup", key], check=True)
        time.sleep(4)


def capture(runtime, *, headless=False):
    env = os.environ.copy()
    env.pop("SDL_VIDEODRIVER", None)
    process = subprocess.Popen(
        runtime.command() + [
            "--display-driver", "x11", "--resolution", "1180x720",
            "--write-movie", str(OUTPUT), "--fixed-fps", "15",
            "--quit-after", "450",
        ],
        cwd=runtime.project_dir, env=env,
    )
    threading.Thread(target=steer, daemon=True).start()
    return process


if __name__ == "__main__":
    app.launch_godot = capture
    with tempfile.TemporaryDirectory(prefix="salaryman-capture-") as temp:
        raise SystemExit(app.run(["--save-file", str(Path(temp) / "office.json")]))
