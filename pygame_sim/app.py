"""Pygame desktop entry point for the SALARYMAN office simulation."""

from __future__ import annotations

import argparse
import os
import sys

import pygame

from .bridge import OfficeBridge, apply_command
from .pablo import fetch_pablo_status
from .state import OfficeState
from .scene import build_tower_scene
from .ui import SolarPunkRenderer


WINDOW_SIZE = (1180, 720)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SALARYMAN solar-punk office simulation")
    parser.add_argument("--headless", action="store_true", help="Use SDL's dummy video driver.")
    parser.add_argument("--frames", type=int, default=0, help="Exit after N frames; useful for smoke tests.")
    parser.add_argument(
        "--save-file",
        default="~/.salaryman/office.json",
        help="Persistent office record path.",
    )
    parser.add_argument("--bridge-host", default="127.0.0.1", help="Godot bridge bind address.")
    parser.add_argument("--bridge-port", type=int, default=4242, help="Godot bridge TCP port.")
    parser.add_argument("--no-bridge", action="store_true", help="Disable the optional Godot bridge.")
    parser.add_argument(
        "--server-url",
        default=os.environ.get("SALARYMAN_SERVER_URL", ""),
        help="Optional SALARYMAN API URL for the shared Pablo capability check.",
    )
    parser.add_argument(
        "--role",
        choices=("player", "moderator", "admin"),
        default=os.environ.get("SALARYMAN_OPERATOR_ROLE", "player"),
        help="Runtime role supplied by the launcher for operator tools.",
    )
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
    state = OfficeState.load_from_file(args.save_file, real_time=True, role=args.role)
    renderer = SolarPunkRenderer(screen)
    renderer.set_pablo_status(fetch_pablo_status(args.server_url))
    scene = build_tower_scene()
    coffee_rects: dict[int, pygame.Rect] = {}
    # The packaged client opens directly into the playable office. The business
    # dashboard remains one Tab press away.
    spatial_mode = True
    previous_day = state.day
    bridge = OfficeBridge(args.bridge_host, args.bridge_port)
    if not args.no_bridge:
        bridge.start()
    bridge_elapsed = 0.0

    running = True
    frame_count = 0
    while running:
        delta_seconds = clock.tick(60) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_m:
                    state.toggle_tool_menu()
                elif state.active_page is not None:
                    if event.key == pygame.K_ESCAPE:
                        state.close_page()
                    elif event.key == pygame.K_r and state.active_page == "tools":
                        state.repair_decay()
                elif event.key == pygame.K_TAB:
                    spatial_mode = not spatial_mode
                elif spatial_mode and event.key == pygame.K_e:
                    scene.interact(state)
                elif spatial_mode and event.key == pygame.K_1:
                    scene.select_room("lobby")
                    state.notice = "ROOM / TOWER LOBBY"
                elif spatial_mode and event.key == pygame.K_2:
                    scene.select_room("recreation")
                    state.notice = "ROOM / RECREATION ARCADE"
                elif spatial_mode and event.key == pygame.K_3:
                    scene.select_room("executive")
                    state.notice = "ROOM / OFFICE 03"
                elif spatial_mode and event.key == pygame.K_4:
                    scene.select_room("public")
                    state.notice = "ROOM / OFFICE 04"
                elif spatial_mode and event.key == pygame.K_5:
                    scene.select_room("office_03")
                    state.notice = "ROOM / OFFICE 03"
                elif spatial_mode and event.key == pygame.K_6:
                    scene.select_room("office_04")
                    state.notice = "ROOM / OFFICE 04"
                elif event.key == pygame.K_SPACE:
                    state.toggle_running()
                elif event.key == pygame.K_r:
                    state.reset()
                elif event.key == pygame.K_n and not spatial_mode:
                    state.toggle_recruitment()
                elif event.key == pygame.K_ESCAPE and state.drawer_open:
                    state.toggle_drawer()
                elif event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                    state.select_worker(event.key - pygame.K_1)
                elif event.key == pygame.K_c and state.selected_worker is not None:
                    state.buy_coffee(state.selected_worker)
                elif event.key == pygame.K_b and not state.drawer_open:
                    state.start_break()
                elif event.key == pygame.K_t:
                    state.toggle_auto_breaks()
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if state.active_page is not None:
                    if renderer.overlay_close_rect.collidepoint(event.pos):
                        state.close_page()
                    elif renderer.repair_rect.collidepoint(event.pos) and state.active_page == "tools":
                        state.repair_decay()
                    continue
                if renderer.admin_tools_rect.collidepoint(event.pos):
                    state.toggle_tool_menu()
                elif state.tool_menu_open:
                    if renderer.admin_economy_rect.collidepoint(event.pos):
                        state.open_page("economy", source="OPERATOR MENU")
                    elif renderer.admin_maintenance_rect.collidepoint(event.pos):
                        state.open_page("tools", source="OPERATOR MENU")
                    else:
                        state.tool_menu_open = False
                elif state.drawer_open:
                    if renderer.record_close_rect.collidepoint(event.pos) or not renderer.record_rect.collidepoint(event.pos):
                        state.toggle_drawer()
                    continue
                if renderer.drawer_rect.collidepoint(event.pos):
                    state.toggle_drawer()
                elif renderer.run_rect.collidepoint(event.pos):
                    state.toggle_running()
                elif renderer.reset_rect.collidepoint(event.pos):
                    state.reset()
                elif renderer.recruitment_rect.collidepoint(event.pos):
                    state.toggle_recruitment()
                elif state.recruitment_open and renderer.refresh_rect.collidepoint(event.pos):
                    state.refresh_recruitment_candidates()
                elif state.recruitment_open:
                    for index, rect in renderer.candidate_rects.items():
                        if rect.collidepoint(event.pos):
                            state.hire_candidate(index)
                            break
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

        if not args.no_bridge:
            for command in bridge.poll_commands():
                result = apply_command(command, state, scene)
                bridge.send_result(command, result)
            if not bridge.connected:
                scene.set_motion_input(0.0, 0.0)

        # Pygame uses the same continuous movement path as the Godot client.
        # Only the focused Pygame window writes keyboard input, so a connected
        # Godot renderer remains free to drive the authoritative scene.
        if spatial_mode and pygame.key.get_focused():
            pressed = pygame.key.get_pressed()
            move_x = int(pressed[pygame.K_d] or pressed[pygame.K_RIGHT]) - int(
                pressed[pygame.K_a] or pressed[pygame.K_LEFT]
            )
            move_y = int(pressed[pygame.K_s] or pressed[pygame.K_DOWN]) - int(
                pressed[pygame.K_w] or pressed[pygame.K_UP]
            )
            scene.set_motion_input(move_x, move_y)
        elif args.no_bridge or not bridge.connected:
            scene.set_motion_input(0.0, 0.0)
        scene.update_motion(delta_seconds)
        state.update(delta_seconds)
        if not args.no_bridge:
            bridge_elapsed += delta_seconds
            if bridge.connected and bridge_elapsed >= 0.1:
                bridge_elapsed = 0.0
                bridge.send_snapshot(state, scene)
            bridge.flush()
        if state.day != previous_day:
            state.save_to_file(args.save_file)
            previous_day = state.day
        if spatial_mode:
            renderer.draw_tower(state, scene)
        else:
            renderer.draw(state, coffee_rects)
        pygame.display.flip()
        frame_count += 1
        if args.frames and frame_count >= args.frames:
            running = False

    state.save_to_file(args.save_file)
    bridge.close()
    pygame.quit()
    return 0


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()