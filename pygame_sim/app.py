"""Pygame desktop entry point for the SALARYMAN office simulation."""

from __future__ import annotations

import argparse
import os
import sys

import pygame

from .state import OfficeState
from .ui import SolarPunkRenderer


WINDOW_SIZE = (1180, 720)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SALARYMAN solar-punk office simulation")
    parser.add_argument("--headless", action="store_true", help="Use SDL's dummy video driver.")
    parser.add_argument("--frames", type=int, default=0, help="Exit after N frames; useful for smoke tests.")
    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.headless:
        os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

    pygame.init()
    pygame.font.init()
    screen = pygame.display.set_mode(WINDOW_SIZE)
    pygame.display.set_caption("SALARYMAN · Office Ecology")
    clock = pygame.time.Clock()
    state = OfficeState.with_default_roster()
    renderer = SolarPunkRenderer(screen)
    coffee_rects: dict[int, pygame.Rect] = {}

    running = True
    frame_count = 0
    while running:
        delta_seconds = clock.tick(60) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    state.toggle_running()
                elif event.key == pygame.K_r:
                    state.reset()
                elif event.key == pygame.K_ESCAPE and state.drawer_open:
                    state.toggle_drawer()
                elif event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    state.select_worker(event.key - pygame.K_1)
                elif event.key == pygame.K_c and state.selected_worker is not None:
                    state.buy_coffee(state.selected_worker)
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if state.drawer_open:
                    if renderer.record_close_rect.collidepoint(event.pos) or not renderer.record_rect.collidepoint(event.pos):
                        state.toggle_drawer()
                    continue
                if renderer.drawer_rect.collidepoint(event.pos):
                    state.toggle_drawer()
                elif renderer.run_rect.collidepoint(event.pos):
                    state.toggle_running()
                else:
                    for index, rect in coffee_rects.items():
                        if rect.collidepoint(event.pos) and index < len(state.roster.workers):
                            state.buy_coffee(index)
                            break
                    else:
                        for index, rect in renderer.worker_rects.items():
                            if rect.collidepoint(event.pos):
                                state.select_worker(index)
                                break

        state.update(delta_seconds)
        renderer.draw(state, coffee_rects)
        pygame.display.flip()
        frame_count += 1
        if args.frames and frame_count >= args.frames:
            running = False

    pygame.quit()
    return 0


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()