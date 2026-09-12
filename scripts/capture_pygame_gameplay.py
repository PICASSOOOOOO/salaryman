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
from math import hypot
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
    parser.add_argument(
        "--executive-office",
        action="store_true",
        help="Hold on the single executive workstation and window for a focused clip",
    )
    parser.add_argument(
        "--fast-trailer",
        action="store_true",
        help="Use six-second gameplay beats for a quick trailer cut",
    )
    return parser.parse_args()


def move_toward_target(
    scene,
    target: tuple[int, int],
    *,
    stop_radius: float = 90.0,
) -> bool:
    """Drive the real movement loop toward a shot target without teleporting."""
    dx = target[0] - scene.player_position[0]
    dy = target[1] - scene.player_position[1]
    distance = hypot(dx, dy)
    if distance <= stop_radius:
        scene.set_motion_input(0.0, 0.0)
        return True
    scene.set_motion_input(dx / distance, dy / distance)
    return False


def draw_trailer_action(
    screen: pygame.Surface,
    renderer: SolarPunkRenderer,
    phase: int,
    *,
    executive_focus: bool = False,
    fast_trailer: bool = False,
) -> None:
    """Add a restrained shot label so each real interaction reads in a trailer."""
    if executive_focus:
        labels = (
            ("EXECUTIVE OFFICE", "WINDOW / SINGLE WORKSTATION"),
            ("TERMINAL ACCESS", "OFFICE RECORD / TOOLS INTERFACE"),
        )
    elif fast_trailer:
        labels = (
            ("EXECUTIVE OFFICE", "FOUR CENTER WORKSTATIONS"),
            ("TERMINAL ACCESS", "OFFICE RECORD / TOOLS"),
            ("WORKSTATION TWO", "DESK / COMPUTER / CHAIR"),
            ("BREAK / REST", "CHAIR / RECOVERING"),
            ("TEAM HUDDLE", "LIVE NPC ROUTE"),
            ("WORKSTATION FOUR", "DESK / COMPUTER / CHAIR"),
        )
    else:
        labels = (
            ("EXECUTIVE OFFICE", "WINDOW / SINGLE WORKSTATION"),
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
    phase_targets = (
        (
            ("executive", (1_800, 6_550), "EXECUTIVE OFFICE / FOUR WORKSTATIONS", None),
            ("executive", (1_750, 6_350), "TERMINAL ACCESS / OFFICE RECORD", "executive-crt"),
        )
        if args.executive_office
        else (
            ("executive", (1_800, 6_550), "EXECUTIVE OFFICE / FOUR WORKSTATIONS", None),
            ("executive", (1_750, 6_350), "TERMINAL / OFFICE RECORD", "executive-crt"),
            ("executive", (2_600, 6_400), "MOVE / WORKSTATION 02", None),
            ("executive", (1_000, 7_100), "BREAK / REST POSITION", "executive-chair"),
            ("executive", (1_800, 6_550), "NPC HUDDLE / MARA VOSS", None),
            ("executive", (2_600, 7_100), "SLEEP / RECOVERING", "executive-chair"),
        )
        if args.fast_trailer
        else (
            ("executive", (1_800, 6_250), "SHIFT START / OFFICE LIVE", None),
            ("executive", (1_400, 6_250), "TELEPHONE / CALLL HOME", "executive-telephone"),
            ("executive", (1_750, 6_350), "CRT TERMINAL / OFFICE RECORD", "executive-crt"),
            ("executive", (1_300, 6_400), "BREAK / REST POSITION", "executive-chair"),
            ("executive", (1_350, 6_850), "TEAM HUDDLE / MARA VOSS", None),
            ("executive", (1_300, 6_400), "SLEEP MODE / RECOVERING", "executive-chair"),
        )
    )
    phase_seconds = 6.0 if args.fast_trailer else 7.0
    active_phase = -1
    action_done = False

    with tempfile.TemporaryDirectory(prefix="salaryman-capture-") as temp_dir:
        frames = Path(temp_dir)
        for frame in range(frame_count):
            second = frame / args.fps
            # Keep the trailer inside the furnished office slice. Each phase
            # centers the real player on a live object or teammate, then lets
            # the renderer show the interaction prompt and office context.
            phase = min(len(phase_targets) - 1, int(second // phase_seconds))
            room_id, target, notice, object_id = phase_targets[phase]
            if phase != active_phase:
                active_phase = phase
                action_done = False
                if scene.current_room != room_id:
                    scene.select_room(room_id)
                scene.set_motion_input(0.0, 0.0)
                if state.active_page is not None:
                    state.close_page()
                state.notice = notice
            arrived = move_toward_target(scene, target)
            scene.update_motion(delta)
            scene.update_npc_motion(delta)
            state.update(delta)
            if arrived and not action_done:
                if phase == 3:
                    state.start_break("short")
                elif phase == 4:
                    state.notice = "TEAM HUDDLE / MARA VOSS"
                elif phase == 5:
                    state.notice = "SLEEP MODE / RECOVERING"
                elif object_id is not None:
                    scene.interact(state, object_id=object_id)
                action_done = True
            renderer.draw_tower(state, scene)
            draw_trailer_action(
                screen,
                renderer,
                phase,
                executive_focus=args.executive_office,
                fast_trailer=args.fast_trailer,
            )
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