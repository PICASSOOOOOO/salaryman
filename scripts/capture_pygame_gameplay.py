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
    parser.add_argument("--seconds", type=float, default=42.0)
    parser.add_argument("--fps", type=int, default=30)
    return parser.parse_args()


def input_for_frame(frame: int, fps: int) -> tuple[float, float]:
    """Walk short, readable paths between the office's live objects."""
    second = frame / fps
    if second < 4.0:
        return (1.0, 0.0)
    if second < 8.0:
        return (0.0, 1.0)
    if second < 12.0:
        return (-1.0, 0.0)
    if second < 16.0:
        return (0.0, -1.0)
    return (0.0, 0.0)


def draw_trailer_action(screen: pygame.Surface, renderer: SolarPunkRenderer, phase: int) -> None:
    """Add a restrained shot label so each real interaction reads in a trailer."""
    labels = (
        ("OFFICE LIVE", "FLOOR 01 / OFFICE 01"),
        ("PHONE / CALLL HOME", "TELEPHONE READY / PHONE CENTER"),
        ("TERMINAL / OFFICE RECORD", "CRT TERMINAL / LIVE OBJECT"),
        ("BREAK / REST", "SHORT BREAK / RECOVERING"),
        ("NPC HUDDLE / MARA VOSS", "TEAM CONVERSATION / SHIFT READY"),
        ("SLEEP / RECOVER", "REST POSITION / SLEEP MODE"),
    )
    title, subtitle = labels[phase]
    card = pygame.Rect(38, 88, 360, 56)
    veil = pygame.Surface(card.size, pygame.SRCALPHA)
    pygame.draw.rect(veil, (3, 17, 20, 238), veil.get_rect(), border_radius=4)
    pygame.draw.rect(veil, (164, 201, 158, 220), veil.get_rect(), width=1, border_radius=4)
    screen.blit(veil, card.topleft)
    renderer.text(title, (card.x + 12, card.y + 9), renderer.font_md, (234, 242, 215))
    renderer.text(subtitle, (card.x + 12, card.y + 32), renderer.font_mono, (124, 196, 164))
    if phase == 4:
        bubble = pygame.Rect(405, 132, 230, 34)
        pygame.draw.rect(screen, (239, 226, 180), bubble, border_radius=4)
        renderer.text("MARA: SHIFT READY", (bubble.x + 10, bubble.y + 9), renderer.font_mono, (12, 42, 45))
    elif phase == 5:
        renderer.text("Z", (530, 205), renderer.font_lg, (234, 242, 215))
        renderer.text("Z", (550, 181), renderer.font_md, (164, 201, 158))


def main() -> int:
    args = parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise SystemExit("ffmpeg is required to create the gameplay clip")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    pygame.init()
    pygame.font.init()
    screen = pygame.display.set_mode((1180, 720))
    state = OfficeState.with_default_roster(real_time=False)
    state.running = False
    scene = build_tower_scene()
    scene.select_room("executive")
    renderer = SolarPunkRenderer(screen)
    frame_count = max(1, int(args.seconds * args.fps))
    delta = 1.0 / args.fps

    with tempfile.TemporaryDirectory(prefix="salaryman-capture-") as temp_dir:
        frames = Path(temp_dir)
        for frame in range(frame_count):
            second = frame / args.fps
            # Keep the trailer inside the furnished office slice. Each phase
            # centers the real player on a live object or teammate, then lets
            # the renderer show the interaction prompt and office context.
            phase = int(second // 7) % 6
            phase_targets = (
                ("executive", (1_800, 6_650), "SHIFT START / OFFICE LIVE"),
                ("executive", (1_400, 6_250), "TELEPHONE / CALLL HOME"),
                ("executive", (2_100, 6_250), "CRT TERMINAL / OFFICE RECORD"),
                ("executive", (1_800, 6_950), "BREAK / REST POSITION"),
                ("executive", (1_350, 6_850), "TEAM HUDDLE / MARA VOSS"),
                ("executive", (2_150, 6_900), "SLEEP MODE / RECOVERING"),
            )
            room_id, target, notice = phase_targets[phase]
            if frame % int(7 * args.fps) == 0:
                scene.select_room(room_id)
                scene.player_position = target
                scene.set_motion_input(0.0, 0.0)
                if state.active_page is not None:
                    state.close_page()
                state.notice = notice
                if phase == 1:
                    scene.interact(state, object_id="executive-telephone")
                elif phase == 2:
                    scene.interact(state, object_id="executive-crt")
                elif phase == 3:
                    state.start_break("short")
                elif phase == 5:
                    state.notice = "SLEEP MODE / RECOVERING"
            scene.set_motion_input(0.0, 0.0)
            scene.update_motion(delta)
            state.update(delta)
            renderer.draw_tower(state, scene)
            draw_trailer_action(screen, renderer, phase)
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