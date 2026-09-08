"""Record a deterministic clip from the real SALARYMAN Pygame renderer.

The capture drives the same OfficeState, TowerScene movement, interactions, and
SolarPunkRenderer used by the packaged desktop client. It is intended for visual
review before any footage is approved for public marketing.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pygame

from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState
from pygame_sim.ui import SolarPunkRenderer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture authentic SALARYMAN Pygame footage")
    parser.add_argument("--output", type=Path, default=ROOT / "screenshots" / "salaryman-pygame-gameplay.mp4")
    parser.add_argument("--seconds", type=float, default=8.0)
    parser.add_argument("--fps", type=int, default=30)
    return parser.parse_args()


def input_for_frame(frame: int, fps: int) -> tuple[float, float]:
    """Walk a short loop that demonstrates continuous authoritative movement."""
    second = frame / fps
    if second < 1.5:
        return (1.0, 0.0)
    if second < 3.0:
        return (0.0, 1.0)
    if second < 4.5:
        return (-1.0, 0.0)
    if second < 6.0:
        return (0.0, -1.0)
    return (0.0, 0.0)


def main() -> int:
    args = parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise SystemExit("ffmpeg is required to create the gameplay clip")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    pygame.init()
    pygame.font.init()
    screen = pygame.display.set_mode((1180, 720))
    state = OfficeState(real_time=True)
    scene = build_tower_scene()
    renderer = SolarPunkRenderer(screen)
    frame_count = max(1, int(args.seconds * args.fps))
    delta = 1.0 / args.fps

    with tempfile.TemporaryDirectory(prefix="salaryman-capture-") as temp_dir:
        frames = Path(temp_dir)
        for frame in range(frame_count):
            scene.set_motion_input(*input_for_frame(frame, args.fps))
            scene.update_motion(delta)
            state.update(delta)
            if frame == int(6.5 * args.fps) and scene.nearby_object:
                scene.interact(state)
            renderer.draw_tower(state, scene)
            pygame.image.save(screen, frames / f"frame-{frame:05d}.png")

        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-loglevel",
                "error",
                "-framerate",
                str(args.fps),
                "-i",
                str(frames / "frame-%05d.png"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                "veryfast",
                str(args.output),
            ],
            check=True,
        )

    pygame.quit()
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())