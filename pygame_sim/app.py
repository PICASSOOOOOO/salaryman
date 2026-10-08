"""Headless Python simulation entry point paired with the Godot desktop client."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

import pygame

from .bridge import OfficeBridge, PROTOCOL_VERSION, apply_command
from .automation import (
    AUTOMATION_CHARACTERS,
    AutopilotPoller,
    AutopilotSnapshot,
    load_desktop_link,
)
from .building_sync import DesktopBuildingSync
from .basement_sync import DesktopBasementSync
from .godot_runtime import (
    GodotRuntime,
    godot_process_exited,
    launch_godot,
    resolve_godot_runtime,
    stop_process,
)
from .state import OfficeState
from .scene import build_tower_scene
from .ui import SolarPunkRenderer


WINDOW_SIZE = (1180, 720)


def _initialize_hidden_python_renderer() -> SolarPunkRenderer:
    """Keep legacy event/UI helpers offscreen; Godot is the only visible client."""
    os.environ["SDL_VIDEODRIVER"] = "dummy"
    pygame.init()
    pygame.font.init()
    return SolarPunkRenderer(pygame.Surface(WINDOW_SIZE))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SALARYMAN solar-punk office simulation")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Godot without a window (the Python simulation is always hidden).",
    )
    parser.add_argument("--frames", type=int, default=0, help="Exit after N frames; useful for smoke tests.")
    parser.add_argument(
        "--paired-smoke",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--save-file",
        default="~/.salaryman/office.json",
        help="Persistent office record path.",
    )
    parser.add_argument("--bridge-host", default="127.0.0.1", help="Godot bridge bind address.")
    parser.add_argument("--bridge-port", type=int, default=4242, help="Godot bridge TCP port.")
    parser.add_argument("--no-bridge", action="store_true", help="Disable the local Godot bridge (tests only).")
    parser.add_argument("--godot-executable", help="Godot 4 executable (normally resolved from the paired release).")
    parser.add_argument("--godot-project", help="Godot office-client project directory.")
    parser.add_argument(
        "--server-url",
        default=os.environ.get("SALARYMAN_SERVER_URL", ""),
        help="Optional SALARYMAN API URL for the shared Pablo capability check.",
    )
    parser.add_argument(
        "--desktop-link-file",
        default=os.environ.get("SALARYMAN_DESKTOP_LINK_FILE"),
        help="Private linked-device JSON file for read-only automation status.",
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
    if args.paired_smoke and (not args.headless or args.no_bridge or args.frames < 1):
        raise SystemExit("--paired-smoke requires --headless, --frames N, and the local bridge.")

    renderer = _initialize_hidden_python_renderer()
    clock = pygame.time.Clock()
    state = OfficeState.load_from_file(args.save_file, real_time=True, role=args.role)
    scene = build_tower_scene()
    desktop_link = None
    try:
        desktop_link = load_desktop_link(
            args.desktop_link_file,
            fallback_server_url=args.server_url,
        )
        autopilot_poller = AutopilotPoller(desktop_link)
    except ValueError:
        autopilot_poller = AutopilotPoller(None)
        scene.set_autopilot_snapshot(AutopilotSnapshot("error", {}, "INVALID GAME LINK FILE", 1))
    autopilot_poller.start()
    building_sync = DesktopBuildingSync(desktop_link)
    building_sync.start()
    basement_sync = DesktopBasementSync(desktop_link)
    basement_sync.start()
    if scene.autopilot_snapshot.state != "error":
        scene.set_autopilot_snapshot(autopilot_poller.current())
    last_autopilot_revision = scene.autopilot_snapshot.revision

    def request_page_data(page: str | None) -> None:
        if page == "inventory":
            state.game_inventory = None
            if building_sync.queue_game_request("inventory"):
                state.game_service_loading.add("inventory")
            else:
                state.notice = "LINK A GAME ACCOUNT TO LOAD INVENTORY"
        elif page == "vending":
            state.vending_catalog = None
            state.business_stock_lines = None
            state.ghost_listing = None
            state.fiat_balance = None
            state.fiat_spendable = None
            if building_sync.queue_game_request("vending_catalog"):
                state.game_service_loading.add("vending_catalog")
            else:
                state.notice = "LINK A GAME ACCOUNT TO USE VENDING"
            if building_sync.queue_game_request("bank"):
                state.game_service_loading.add("bank")
        elif page == "business_stock":
            if state.business_stock_lines is None:
                if building_sync.queue_game_request("vending_catalog"):
                    state.game_service_loading.add("vending_catalog")
                else:
                    state.notice = "LINK A GAME ACCOUNT TO LOAD BUSINESS STOCK"
        elif page == "bank":
            state.fiat_balance = None
            state.fiat_spendable = None
            if building_sync.queue_game_request("bank"):
                state.game_service_loading.add("bank")
            else:
                state.notice = "LINK A GAME ACCOUNT TO VIEW BANCO OMBRA"

    def dispatch_game_command(name: str, payload: dict[str, object] | None = None) -> None:
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": name,
            "payload": payload or {},
        }
        result = apply_command(command, state, scene, building_sync, basement_sync)
        state.notice = result.message

    def process_basement_events() -> None:
        for event in basement_sync.drain_events():
            data = event.data or {}
            if event.source == "basement_snapshot":
                if not event.ok:
                    state.notice = event.message.upper()
                continue
            if not event.ok:
                if event.source in {"basement_work_start", "basement_work_complete"}:
                    state.utility_work_active = False
                    state.utility_work_target = None
                    if state.active_page == "utility_work":
                        state.close_page()
                    scene.set_player_action("stand", duration=0.0)
                state.notice = event.message.upper()
                continue

            if event.source == "basement_enter":
                if scene.select_basement_level(1):
                    x, y = data.get("x"), data.get("y")
                    if isinstance(x, int) and isinstance(y, int):
                        scene.player_position = (x, y)
                    state.notice = (
                        "REAR ENTRANCE / ENTERED B1"
                        if data.get("accessMode") == "back_entrance"
                        else "BASEMENT ACCESS / ENTERED B1"
                    )
            elif event.source == "basement_level":
                level = data.get("level")
                if isinstance(level, int) and scene.select_basement_level(level):
                    state.notice = f"STAIRS / ENTERED B{level}"
            elif event.source == "basement_exit":
                if scene.leave_basement():
                    x, y = data.get("x"), data.get("y")
                    if isinstance(x, int) and isinstance(y, int):
                        scene.player_position = (x, y)
                    state.notice = (
                        "REAR ENTRANCE / ENTERED THE TOWER LOBBY"
                        if data.get("exitVia") == "back_entrance"
                        else "STAIRS / RETURNED TO THE TOWER LOBBY"
                    )
            elif event.source == "basement_uniform":
                state.pest_uniform_worn = data.get("uniformWorn") is True
                state.notice = "PEST RESPONSE UNIFORM / " + (
                    "WORN" if state.pest_uniform_worn else "REMOVED"
                )
                state.save_to_file(args.save_file)
            elif event.source == "basement_attack":
                pest = data.get("pest")
                if isinstance(pest, dict):
                    stamina = data.get("stamina")
                    if isinstance(stamina, int):
                        state.pest_stamina = max(0, min(100, stamina))
                    if pest.get("status") == "carcass" and pest.get("defeatedByYou") is True:
                        if state.record_pest_work_progress("defeat"):
                            state.save_to_file(args.save_file)
                scene.set_player_action("fight", duration=0.65)
                state.notice = event.message.upper()
            elif event.source == "basement_sell":
                state.record_pest_work_progress("sale")
                state.save_to_file(args.save_file)
                state.fiat_balance = None
                state.fiat_spendable = None
                request_page_data("bank")
                state.game_inventory = None
                request_page_data("inventory")
                state.notice = event.message.upper()
            elif event.source == "basement_work_start":
                state.utility_work_active = True
                state.utility_work_target = str(data.get("target", state.utility_work_target or ""))
                state.utility_work_started_at = __import__("time").monotonic()
                state.notice = event.message.upper()
            elif event.source == "basement_work_complete":
                state.utility_work_active = False
                state.utility_work_target = None
                if state.active_page == "utility_work":
                    state.close_page()
                scene.set_player_action("stand", duration=0.0)
                state.notice = event.message.upper()
            else:
                state.notice = event.message.upper()

    def open_player_page(page: str) -> None:
        if state.open_page(page, source="PLAYER MENU"):
            request_page_data(page)

    def activate_game_page_action(action: str) -> None:
        if action.startswith("pest_job:"):
            dispatch_game_command("start_pest_job", {"job_id": action.split(":", 1)[1]})
        elif action.startswith("pest_move:"):
            dispatch_game_command("basement_attack", {"move_id": action.split(":", 1)[1]})
        elif action == "pest_uniform:toggle":
            dispatch_game_command("toggle_pest_uniform")
        elif action.startswith("supply:"):
            dispatch_game_command("use_pest_supply", {"item_id": action.split(":", 1)[1]})
        elif action.startswith("reception:"):
            try:
                choice = int(action.split(":", 1)[1])
            except ValueError:
                state.notice = "RECEPTION SERVICE NOT AVAILABLE"
                return
            dispatch_game_command("reception_choice", {"choice": choice})
        elif action == "vending:business-stock":
            dispatch_game_command("toggle_business_stock")
        elif action.startswith("business:"):
            service = action.split(":", 1)[1]
            service_pages = {
                "bank_balance": "bank",
                "read_only_stock": "business_stock",
                "phone": "phone",
            }
            if service == "gold_exchange":
                state.open_page(
                    "economy",
                    from_object=True,
                    source="BANCO OMBRA / FIAT + GOLD",
                    source_object_id=state.active_object_id,
                )
            elif service == "real_estate":
                dispatch_game_command("reception_choice", {"choice": 3})
            elif service in service_pages:
                open_player_page(service_pages[service])
            else:
                state.notice = "BUSINESS SERVICE NOT AVAILABLE"
        elif action.startswith("nav:"):
            open_player_page(action.split(":", 1)[1])
        elif action.startswith("action:"):
            character_action = action.split(":", 1)[1]
            if character_action == "fight" and scene.is_basement:
                dispatch_game_command("open_melee_menu")
                return
            duration = {"jump": 0.9, "fight": 0.7, "sweep": 0.85}.get(character_action, 0.0)
            scene.set_player_action(character_action, duration=duration)
            state.notice = character_action.upper()
            state.close_page()
        elif action == "setting:sprint":
            state.sprint_toggle_mode = not state.sprint_toggle_mode
            state.sprint_toggled = False
            state.notice = "SPRINT / TOGGLE" if state.sprint_toggle_mode else "SPRINT / HOLD"
            state.save_to_file(args.save_file)
        elif action == "setting:speed":
            state.movement_speed_preset = (state.movement_speed_preset + 1) % 3
            speed_label = ("RELAXED", "STANDARD", "QUICK")[state.movement_speed_preset]
            state.notice = f"MOVEMENT / {speed_label}"
            state.save_to_file(args.save_file)
        elif action == "setting:hints":
            state.show_control_hints = not state.show_control_hints
            state.notice = f"CONTROL HINTS / {'ON' if state.show_control_hints else 'OFF'}"
            state.save_to_file(args.save_file)
        elif action == "setting:music":
            state.music_enabled = not state.music_enabled
            state.notice = f"MUSIC / {'ON' if state.music_enabled else 'OFF'}"
            state.save_to_file(args.save_file)
        elif action.startswith("buy:"):
            item_id = action.split(":", 1)[1]
            if building_sync.queue_game_request("buy_vending", item_id):
                state.notice = "PURCHASE SENT / WAITING FOR SERVER"
            else:
                state.notice = "PURCHASE UNAVAILABLE / CHECK GAME LINK"
        elif action == "phone:call-home" or action == "phone:comms":
            link = building_sync.link
            if link is None:
                state.notice = "LINK A GAME ACCOUNT TO OPEN THIS SERVICE"
                return
            route = "/phone" if action == "phone:call-home" else "/comms"
            try:
                opened = __import__("webbrowser").open(link.server_url.rstrip("/") + route)
                state.notice = "CALLL HOME OPENED" if opened and route == "/phone" else (
                    "COMMS OPENED" if opened else "COULD NOT OPEN SERVICE"
                )
            except Exception:
                state.notice = "COULD NOT OPEN SERVICE"

    def handle_page_key(key: int) -> bool:
        if key == pygame.K_ESCAPE:
            if state.utility_work_active or state.relocation_cutscene_pending:
                return True
            if state.active_page != "player" and state.page_source == "PLAYER MENU":
                open_player_page("player")
            else:
                state.close_page()
            return True
        page = state.active_page
        if page == "player":
            destinations = {
                pygame.K_1: "nav:inventory",
                pygame.K_2: "nav:settings",
                pygame.K_3: "nav:bank",
                pygame.K_4: "nav:phone",
                pygame.K_5: "action:jump",
                pygame.K_6: "action:sit",
                pygame.K_7: "action:fight",
                pygame.K_8: "action:sweep",
            }
            if key in destinations:
                activate_game_page_action(destinations[key])
                return True
        elif page == "settings":
            actions = {
                pygame.K_1: "setting:sprint",
                pygame.K_2: "setting:speed",
                pygame.K_3: "setting:hints",
                pygame.K_4: "setting:music",
            }
            if key in actions:
                activate_game_page_action(actions[key])
                return True
        elif page == "vending":
            items = state.vending_catalog or []
            if key in (pygame.K_UP, pygame.K_DOWN) and items:
                delta = -1 if key == pygame.K_UP else 1
                state.selected_vending_index = (state.selected_vending_index + delta) % len(items)
                return True
            if key in (pygame.K_RETURN, pygame.K_KP_ENTER) and items:
                state.selected_vending_index = max(0, min(state.selected_vending_index, len(items) - 1))
                item_id = str(items[state.selected_vending_index].get("id", ""))
                if item_id:
                    activate_game_page_action(f"buy:{item_id}")
                return True
            if pygame.K_1 <= key <= pygame.K_6 and key - pygame.K_1 < len(items):
                item_id = str(items[key - pygame.K_1].get("id", ""))
                if item_id:
                    activate_game_page_action(f"buy:{item_id}")
                return True
            if key == pygame.K_b:
                activate_game_page_action("vending:business-stock")
                return True
        elif page == "business_stock" and key == pygame.K_b:
            activate_game_page_action("vending:business-stock")
            return True
        elif page == "phone":
            if key == pygame.K_1:
                activate_game_page_action("phone:call-home")
                return True
            if key == pygame.K_2:
                activate_game_page_action("phone:comms")
                return True
        elif page == "reception" and pygame.K_1 <= key <= pygame.K_3:
            activate_game_page_action(f"reception:{key - pygame.K_0}")
            return True
        elif page == "pest_jobs":
            if key in (pygame.K_1, pygame.K_2):
                job_id = ("pest_w2", "pest_1099")[key - pygame.K_1]
                activate_game_page_action(f"pest_job:{job_id}")
                return True
        elif page == "pest_uniform" and key == pygame.K_1:
            activate_game_page_action("pest_uniform:toggle")
            return True
        elif page == "melee" and pygame.K_1 <= key <= pygame.K_9:
            from .pest_work import MELEE_MOVES
            activate_game_page_action(f"pest_move:{MELEE_MOVES[key - pygame.K_1]['id']}")
            return True
        return False

    coffee_rects: dict[int, pygame.Rect] = {}
    # The packaged client opens directly into the playable office. The business
    # dashboard remains one Tab press away.
    spatial_mode = True
    previous_day = state.day
    bridge = OfficeBridge(args.bridge_host, args.bridge_port)
    launch_error = ""
    if not args.no_bridge:
        if not bridge.start():
            launch_error = bridge.status
            print(launch_error, file=sys.stderr)
    bridge_elapsed = 0.0
    godot_process: subprocess.Popen[bytes] | None = None
    if not args.no_bridge and not launch_error:
        try:
            godot_runtime: GodotRuntime = resolve_godot_runtime(
                godot_executable=args.godot_executable,
                project_dir=args.godot_project,
                module_file=__file__,
            )
            godot_process = launch_godot(godot_runtime, headless=args.headless)
        except (FileNotFoundError, ValueError, RuntimeError) as error:
            launch_error = str(error)
            print(launch_error, file=sys.stderr)

    running = not launch_error
    frame_count = 0
    pair_connected = False
    godot_exited_early = False
    while running:
        if godot_process is not None and godot_process_exited(godot_process):
            godot_exited_early = True
            running = False
            continue
        delta_seconds = clock.tick(60) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_m and not (
                    state.utility_work_active or state.relocation_cutscene_pending
                ):
                    state.toggle_tool_menu()
                elif state.active_page is not None:
                    if handle_page_key(event.key):
                        pass
                    elif event.key == pygame.K_r and state.active_page == "tools":
                        state.repair_decay()
                elif spatial_mode and event.key == pygame.K_p:
                    open_player_page("player")
                elif spatial_mode and event.key == pygame.K_i:
                    open_player_page("inventory")
                elif event.key == pygame.K_TAB:
                    spatial_mode = not spatial_mode
                elif spatial_mode and event.key == pygame.K_b:
                    state.open_page("customize", source="ROOM CUSTOMIZATION")
                elif spatial_mode and event.key in (pygame.K_LSHIFT, pygame.K_RSHIFT) and state.sprint_toggle_mode:
                    state.sprint_toggled = not state.sprint_toggled
                    state.notice = "SPRINT ON" if state.sprint_toggled else "SPRINT OFF"
                elif spatial_mode and event.key == pygame.K_e:
                    dispatch_game_command("interact")
                    request_page_data(state.active_page)
                elif spatial_mode and event.key == pygame.K_SPACE:
                    scene.set_player_action("jump", duration=0.9)
                    state.notice = "JUMP"
                elif spatial_mode and event.key == pygame.K_f:
                    if scene.is_basement:
                        dispatch_game_command("open_melee_menu")
                    else:
                        scene.set_player_action("fight", duration=0.7)
                        state.notice = "FIGHT"
                elif spatial_mode and event.key == pygame.K_g:
                    scene.set_player_action("sweep", duration=0.85)
                    state.notice = "SWEEP"
                elif spatial_mode and event.key in (pygame.K_h, pygame.K_j):
                    nearby = scene.nearby_object
                    maintenance_action = "clean" if event.key == pygame.K_h else "repair"
                    if nearby is not None and building_sync.queue_action(nearby.id, maintenance_action):
                        scene.set_player_action("maintenance", duration=1.0)
                        state.notice = f"{maintenance_action.upper()} REQUESTED"
                    else:
                        state.notice = f"NO SERVER MAINTENANCE TARGET FOR {maintenance_action.upper()}"
                elif spatial_mode and event.key == pygame.K_c:
                    state.notice = "SIT" if scene.set_player_action("sit") else "NO CHAIR IN RANGE"
                elif spatial_mode and event.key == pygame.K_l:
                    scene.set_player_action("sleep", duration=4.0)
                    state.notice = "SLEEP"
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
                elif event.key == pygame.K_b and not spatial_mode and not state.drawer_open:
                    state.start_break()
                elif event.key == pygame.K_t:
                    state.toggle_auto_breaks()
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if state.active_page is not None:
                    if renderer.overlay_close_rect.collidepoint(event.pos):
                        if state.utility_work_active or state.relocation_cutscene_pending:
                            state.notice = "WAIT FOR THE CURRENT SEQUENCE TO FINISH"
                        elif state.active_page != "player" and state.page_source == "PLAYER MENU":
                            open_player_page("player")
                        else:
                            state.close_page()
                    else:
                        for action, rect in renderer.game_page_actions.items():
                            if rect.collidepoint(event.pos):
                                activate_game_page_action(action)
                                break
                    if state.active_page == "systems":
                        for domain, rect in renderer.system_module_rects.items():
                            if rect.collidepoint(event.pos):
                                profile = next(
                                    (
                                        candidate
                                        for candidate in AUTOMATION_CHARACTERS
                                        if candidate.domain == domain
                                    ),
                                    None,
                                )
                                if profile is not None:
                                    scene.selected_automation_domain = domain
                                    state.open_page(
                                        "automation",
                                        from_object=True,
                                        source=f"{profile.name} / {profile.app_label}",
                                        source_object_id=state.active_object_id,
                                    )
                                break
                    elif renderer.repair_rect.collidepoint(event.pos) and state.active_page == "tools":
                        state.repair_decay()
                    elif state.active_page == "customize":
                        for wall_style, rect in renderer.customize_wall_rects.items():
                            if rect.collidepoint(event.pos):
                                if state.set_room_customization(
                                    scene.current_room,
                                    wall_style=wall_style,
                                ):
                                    state.save_to_file(args.save_file)
                                break
                        else:
                            for decor_style, rect in renderer.customize_decor_rects.items():
                                if rect.collidepoint(event.pos):
                                    if state.set_room_customization(
                                        scene.current_room,
                                        decor_style=decor_style,
                                    ):
                                        state.save_to_file(args.save_file)
                                    break
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
                result = apply_command(command, state, scene, building_sync, basement_sync)
                if isinstance(command, dict) and command.get("name") == "toggle_music":
                    state.save_to_file(args.save_file)
                bridge.send_result(command, result)
            if bridge.connected:
                pair_connected = True
            if not bridge.connected:
                scene.set_motion_input(0.0, 0.0)

        # Pygame uses the same continuous movement path as the Godot client.
        # Only the focused Pygame window writes keyboard input, so a connected
        # Godot renderer remains free to drive the authoritative scene.
        if spatial_mode and pygame.key.get_focused() and state.active_page is None and not state.tool_menu_open:
            pressed = pygame.key.get_pressed()
            move_x = int(pressed[pygame.K_d] or pressed[pygame.K_RIGHT]) - int(
                pressed[pygame.K_a] or pressed[pygame.K_LEFT]
            )
            move_y = int(pressed[pygame.K_s] or pressed[pygame.K_DOWN]) - int(
                pressed[pygame.K_w] or pressed[pygame.K_UP]
            )
            scene.set_motion_input(
                move_x,
                move_y,
                sprint=(
                    state.sprint_toggled
                    if state.sprint_toggle_mode
                    else bool(pressed[pygame.K_LSHIFT] or pressed[pygame.K_RSHIFT])
                ),
            )
            scene.player_speed_scale = (0.8, 1.0, 1.2)[state.movement_speed_preset]
        elif args.no_bridge or not bridge.connected:
            scene.set_motion_input(0.0, 0.0)
        elif state.active_page is not None or state.tool_menu_open:
            scene.set_motion_input(0.0, 0.0)
        scene.update_motion(delta_seconds)
        scene.update_npc_motion(delta_seconds)
        basement_sync.update_scene(scene)
        basement_snapshot = basement_sync.latest_snapshot()
        scene.set_basement_snapshot(basement_snapshot)
        if isinstance(basement_snapshot, dict):
            player_snapshot = basement_snapshot.get("player")
            if isinstance(player_snapshot, dict):
                stamina = player_snapshot.get("stamina")
                if isinstance(stamina, int):
                    state.pest_stamina = max(0, min(100, stamina))
                state.pest_uniform_worn = player_snapshot.get("uniformWorn") is True
        process_basement_events()
        building_sync.update_scene(scene)
        scene.set_building_object_states(building_sync.object_states())
        scene.set_construction_plans(building_sync.construction_plans())
        for sync_event in building_sync.drain_events():
            if sync_event.source == "game_service":
                data = sync_event.data or {}
                action = data.get("action")
                payload = data.get("payload")
                if isinstance(action, str):
                    state.game_service_loading.discard(action)
                if sync_event.ok and isinstance(payload, dict):
                    if action == "inventory":
                        rows = payload.get("rows", [])
                        state.game_inventory = [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
                        state.notice = f"INVENTORY LOADED / {len(state.game_inventory)} ENTRIES"
                    elif action == "vending_catalog":
                        items = payload.get("items", [])
                        state.vending_catalog = [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []
                        stock = payload.get("businessStock", {})
                        lines = stock.get("lines", []) if isinstance(stock, dict) else []
                        state.business_stock_lines = (
                            [line for line in lines if isinstance(line, dict)]
                            if isinstance(lines, list)
                            else []
                        )
                        ghost = payload.get("ghost")
                        state.ghost_listing = ghost if isinstance(ghost, dict) else None
                        state.selected_vending_index = max(
                            0,
                            min(state.selected_vending_index, max(0, len(state.vending_catalog) - 1)),
                        )
                        state.notice = (
                            f"BUSINESS STOCK LOADED / {len(state.business_stock_lines)} LINES"
                            if state.active_page == "business_stock"
                            else f"VENDING STOCK LOADED / {len(state.vending_catalog)} ITEMS"
                        )
                    elif action == "bank":
                        balance = payload.get("balance")
                        spendable = payload.get("spendable")
                        if isinstance(balance, (int, float)) and isinstance(spendable, (int, float)):
                            state.fiat_balance = int(balance)
                            state.fiat_spendable = int(spendable)
                            state.notice = "BANCO OMBRA / READ ONLY"
                        else:
                            state.notice = "FIAT WALLET RESPONSE INVALID"
                    elif action == "buy_vending":
                        if payload.get("alreadyOwned"):
                            state.notice = "ITEM ALREADY OWNED"
                        else:
                            state.notice = f"PURCHASE COMPLETE / ƒ{int(payload.get('fiat', 0) or 0):,}"
                        state.game_inventory = None
                        state.fiat_balance = None
                        state.fiat_spendable = None
                        request_page_data("inventory")
                        request_page_data("bank")
                    elif action == "consume_supply":
                        energy = payload.get("energy")
                        if isinstance(energy, int):
                            state.pest_stamina = max(0, min(100, energy))
                        state.notice = "SUPPLY USED / STAMINA UPDATED"
                        state.game_inventory = None
                        request_page_data("inventory")
                else:
                    error_payload = data.get("errorPayload")
                    if sync_event.code == "HTTP_402" and isinstance(error_payload, dict):
                        required = error_payload.get("requiredFiat", error_payload.get("required"))
                        spendable = error_payload.get("spendableFiat", error_payload.get("spendable"))
                        if isinstance(required, (int, float)) and isinstance(spendable, (int, float)):
                            state.notice = f"NOT ENOUGH FIAT / ƒ{int(spendable):,} AVAILABLE / ƒ{int(required):,} REQUIRED"
                        else:
                            state.notice = "NOT ENOUGH FIAT"
                    else:
                        state.notice = sync_event.message.upper()
                continue
            if sync_event.source == "construction_snapshot":
                if not sync_event.ok:
                    state.notice = sync_event.message.upper()
                continue
            if sync_event.source == "construction":
                state.notice = sync_event.message.upper()
                if sync_event.ok:
                    data = sync_event.data or {}
                    if isinstance(data.get("rewardFiat"), int):
                        state.fiat_balance = None
                        state.fiat_spendable = None
                        request_page_data("bank")
                        scene.set_player_action("stand", duration=0.0)
                else:
                    scene.set_player_action("stand", duration=0.0)
                continue
            if sync_event.source in {"elevator", "stairs"}:
                if sync_event.ok and sync_event.destination_floor is not None:
                    if scene.select_floor(sync_event.destination_floor):
                        travel_type = "STAIRS" if sync_event.source == "stairs" else "ELEVATOR"
                        state.notice = f"{travel_type} ARRIVED / FLOOR {scene.current_floor:02d}"
                    else:
                        state.notice = f"FLOOR {sync_event.destination_floor:02d} IS UNDER CONSTRUCTION"
                else:
                    if sync_event.code == "HTTP_403" and scene.current_floor == 6:
                        scene.select_floor(1)
                        state.notice = "ELEVATOR ACCESS DENIED / RETURNED TO LOBBY"
                    else:
                        state.notice = sync_event.message.upper()
                scene.set_player_action("stand", duration=0.0)
                continue
            if sync_event.code == "HTTP_403" and scene.return_from_denied_executive_suite():
                state.notice = "EXECUTIVE SUITE ACCESS DENIED"
                continue
            if sync_event.source == "presence" and sync_event.code == "HTTP_403" and scene.current_floor == 6:
                scene.select_floor(1)
                state.notice = "FLOOR ACCESS DENIED / RETURNED TO LOBBY"
                continue
            if sync_event.state is not None:
                state_floor = sync_event.state.get("floorNumber")
                object_id = sync_event.state.get("objectId")
                if isinstance(state_floor, int) and not isinstance(state_floor, bool) and isinstance(object_id, str):
                    state_key = f"{state_floor}:{object_id}"
                    scene.set_building_object_states({
                        **scene.building_object_states,
                        state_key: sync_event.state,
                    })
            state.notice = sync_event.message.upper()
            if sync_event.message.startswith("WORKING /"):
                scene.set_player_action("maintenance", duration=12.0)
            elif "WAITING FOR" in sync_event.message.upper():
                scene.set_player_action("stand", duration=0.0)
            elif not sync_event.ok or "PAID" in sync_event.message.upper() or "CLEANED" in sync_event.message.upper() or "REPAIRED" in sync_event.message.upper():
                scene.set_player_action("stand", duration=0.0)
        autopilot_snapshot = autopilot_poller.current()
        if autopilot_snapshot.revision > last_autopilot_revision:
            scene.set_autopilot_snapshot(autopilot_snapshot)
            last_autopilot_revision = autopilot_snapshot.revision
        state.update(delta_seconds)
        state.advance_relocation_cutscene(delta_seconds)
        if not args.no_bridge:
            bridge_elapsed += delta_seconds
            if bridge.connected and bridge_elapsed >= 0.1:
                bridge_elapsed = 0.0
                bridge.send_snapshot(state, scene)
            bridge.flush()
        if state.day != previous_day:
            state.save_to_file(args.save_file)
            previous_day = state.day
        frame_count += 1
        if args.frames and frame_count >= args.frames:
            running = False

    try:
        state.save_to_file(args.save_file)
    finally:
        if godot_process is not None:
            stop_process(godot_process)
        basement_sync.close()
        building_sync.close()
        autopilot_poller.close()
        bridge.close()
        pygame.quit()
    paired_smoke_failed = args.paired_smoke and (
        not pair_connected or godot_exited_early or godot_process is None
    )
    if paired_smoke_failed:
        print("The Python simulation and Godot game client did not stay connected.", file=sys.stderr)
    return 1 if launch_error or paired_smoke_failed else 0


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()