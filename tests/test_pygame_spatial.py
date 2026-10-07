import os
import unittest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

import pygame

from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState
from pygame_sim.ui import SolarPunkRenderer
from pygame_sim.world_layout import FLOOR_PLAN


class PygameSpatialTests(unittest.TestCase):
    def setUp(self):
        pygame.init()

    def tearDown(self):
        pygame.quit()

    def test_registry_contains_requested_physical_objects(self):
        scene = build_tower_scene()
        kinds = {item.kind for item in scene.objects.objects}
        self.assertTrue(
            {
                "telephone",
                "pay_phone",
                "crt_terminal",
                "atm",
                "vending_machine",
                "elevator",
                "stairs",
                "arcade",
                "desk",
                "chair",
            }.issubset(kinds)
        )
        self.assertNotIn("tv", kinds)
        self.assertEqual((scene.width, scene.height), (100_000_000, 100_000_000))

    def test_floor_plan_is_continuous_and_office_doors_land_on_boundary(self):
        scene = build_tower_scene()
        rooms = {room.id: room for room in scene.rooms}
        lobby = rooms["lobby"].bounds
        hallway = rooms["recreation"].bounds
        first_office = rooms["executive"].bounds
        office_04 = rooms["office_04"].bounds
        base_layout = FLOOR_PLAN["baseLayout"]
        lobby_bounds = base_layout["elevatorLobby"]["bounds"]
        main_hall, west_cross, _east_cross = base_layout["hallways"]
        opening = int(FLOOR_PLAN["lobbyHallwayOpening"])
        lobby_origin_x = lobby_bounds[0] + opening - (
            main_hall[0] + main_hall[2] // 2
        )
        lobby_origin_y = lobby_bounds[1] + lobby_bounds[3]

        self.assertEqual(list(lobby), lobby_bounds)
        self.assertEqual(hallway, (0, 0, 62_225, 70_711))
        self.assertEqual(
            lobby_bounds[0] + opening - lobby_origin_x,
            main_hall[0] + main_hall[2] // 2,
        )
        self.assertEqual(lobby_bounds[1] + lobby_bounds[3] - lobby_origin_y, 0)
        self.assertEqual(base_layout["clearEnvelopeUnits"], [62_225, 70_711])
        expanded_area_ratio = (62_225 * 70_711) / (22_000 * 25_000)
        self.assertAlmostEqual(expanded_area_ratio, 8.0, places=4)
        self.assertEqual(main_hall[2], 1_200)
        self.assertEqual(west_cross[3], 800)
        self.assertEqual(FLOOR_PLAN["rooms"][-1]["mazeCellUnits"], 2_828)
        self.assertEqual(first_office[1] + first_office[3], west_cross[1])
        self.assertEqual(office_04[1], west_cross[1] + west_cross[3])

        lobby_hallway_center = main_hall[0] + main_hall[2] // 2
        elevator_y = lobby_bounds[1] + lobby_bounds[3] - 800
        expected_passenger_positions = {
            (
                lobby_bounds[0] + opening + int(position[0]) - lobby_hallway_center,
                elevator_y,
            )
            for position in base_layout["passengerElevators"]["positions"]
        }
        passenger_ids = {
            "lobby-elevator-1",
            "lobby-elevator-2",
            "lobby-elevator",
            "lobby-elevator-4",
        }
        self.assertEqual(
            {
                scene.objects.get(object_id).position
                for object_id in passenger_ids
            },
            expected_passenger_positions,
        )
        service_x = (
            lobby_bounds[0]
            + opening
            + int(base_layout["serviceElevator"]["position"][0])
            - lobby_hallway_center
        )
        self.assertEqual(
            scene.objects.get("lobby-service-elevator").position,
            (service_x, elevator_y),
        )

        office_doors = [
            item for item in scene.objects.objects
            if item.kind == "door" and item.room == "recreation"
        ]
        self.assertEqual(len(office_doors), 4)
        expected_doors = {
            tuple(int(value) for value in office["entrance"])
            for office in base_layout["offices"]
        }
        self.assertEqual({item.position for item in office_doors}, expected_doors)

    def test_nearby_interactions_route_without_renderer_logic(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.select_room("recreation")
        arcade = scene.objects.get("arcade-cyber-serpent")
        scene.player_position = arcade.position

        result = scene.interact(state)

        self.assertTrue(result.success)
        self.assertEqual(result.route, "/arcade/cyber_serpent")
        self.assertEqual(state.last_arcade_game, "cyber_serpent")

    def test_movement_inside_office_does_not_snap_back_to_lobby(self):
        scene = build_tower_scene()
        scene.select_room("executive")

        scene.set_motion_input(1.0, 0.0)
        scene.update_motion(1 / 30)

        self.assertEqual(scene.current_room, "executive")

    def test_executive_desk_blocks_crossing_but_terminal_stays_reachable(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.select_room("executive")
        desk = scene.objects.get("executive-desk")
        scene.player_position = (
            desk.position[0],
            desk.position[1] - desk.collision_half_extents[1] - 91,
        )

        scene.move(0, 50)

        self.assertEqual(
            scene.player_position,
            (
                desk.position[0],
                desk.position[1] - desk.collision_half_extents[1] - 91,
            ),
        )
        scene.player_position = scene.objects.get("executive-chair").position
        self.assertTrue(scene.set_player_action("sit"))
        result = scene.interact(state)
        self.assertTrue(result.success)
        self.assertEqual(result.route, "systems-terminal")
        self.assertEqual(state.active_page, "systems")

    def test_executive_workstation_children_belong_to_their_desk(self):
        scene = build_tower_scene()
        workstation_ids = ("", "-2", "-3", "-4")

        for suffix in workstation_ids:
            desk_id = f"executive-desk{suffix}"
            desk = scene.objects.get(desk_id)
            chair = scene.objects.get(f"executive-chair{suffix}")
            computer = scene.objects.get(f"executive-crt{suffix}")
            lamp = scene.objects.get(
                "executive-desk-lamp" if not suffix else f"executive-desk-lamp{suffix}"
            )

            self.assertIsNotNone(desk)
            self.assertEqual(chair.parent_id, desk_id)
            self.assertEqual(computer.parent_id, desk_id)
            self.assertEqual(lamp.parent_id, desk_id)
            self.assertGreater(chair.position[1], desk.position[1])
            self.assertEqual(
                chair.position[1] - desk.position[1],
                desk.collision_half_extents[1] + chair.collision_half_extents[1],
            )
            self.assertTrue(chair.interactive)
            self.assertTrue(computer.interactive)

    def test_player_actions_stay_grounded_and_sit_on_a_nearby_chair(self):
        scene = build_tower_scene()
        scene.select_room("executive")
        chair = scene.objects.get("executive-chair-3")
        scene.player_position = (chair.position[0] - 300, chair.position[1] + 20)

        self.assertTrue(scene.set_player_action("sit", duration=1.0))
        self.assertEqual(scene.player_position, chair.position)
        self.assertEqual(scene.player_action, "sit")
        self.assertEqual(scene.seated_workstation_id, "executive-desk-3")

        scene.update_motion(1.1)
        self.assertEqual(scene.player_action, "stand")
        self.assertIsNone(scene.seated_workstation_id)

        self.assertTrue(scene.set_player_action("jump", duration=0.9))
        self.assertEqual(scene.player_action, "jump")
        self.assertTrue(scene.set_player_action("sleep", duration=1.0))
        self.assertEqual(scene.player_action, "sleep")

    def test_player_auto_sleeps_after_five_minutes_and_wakes_on_input(self):
        scene = build_tower_scene()

        scene.update_motion(scene.AUTO_SLEEP_AFTER_SECONDS - 0.1)
        self.assertEqual(scene.player_action, "stand")
        scene.update_motion(0.1)
        self.assertEqual(scene.player_action, "sleep")

        scene.set_motion_input(1.0, 0.0)
        self.assertEqual(scene.player_action, "stand")
        self.assertEqual(scene.idle_seconds, 0.0)

    def test_npc_routes_advance_without_player_input(self):
        scene = build_tower_scene()
        scene.select_room("executive")

        before = scene.npc_pose("executive", 0)
        scene.update_npc_motion(1.0)
        after = scene.npc_pose("executive", 0)

        self.assertIsNotNone(before)
        self.assertIsNotNone(after)
        self.assertNotEqual(before[0], after[0])
        self.assertIn(after[1], {"up", "down", "left", "right"})

    def test_operator_pages_require_role_access_or_a_live_object(self):
        player = OfficeState.with_default_roster()
        self.assertFalse(player.open_page("tools"))
        self.assertIsNone(player.active_page)

        moderator = OfficeState.with_default_roster(role="moderator")
        self.assertTrue(moderator.open_page("tools", source="OPERATOR MENU"))
        self.assertEqual(moderator.active_page, "tools")

        scene = build_tower_scene()
        scene.select_room("executive")
        scene.player_position = scene.objects.get("executive-chair").position
        self.assertTrue(scene.set_player_action("sit"))
        atm_result = scene.objects.interact("lobby-atm", player, scene)
        self.assertTrue(atm_result.success)
        self.assertEqual(player.active_page, "economy")
        player.close_page()
        crt_result = scene.objects.interact("executive-crt", player, scene)
        self.assertTrue(crt_result.success)
        self.assertEqual(player.active_page, "systems")

    def test_vending_purchase_uses_the_existing_ledger_boundary(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.select_room("executive")
        vending = scene.objects.get("executive-vending")
        scene.player_position = vending.position
        funds_before = state.funds

        result = scene.interact(state, vending_item="desk_lamp")

        self.assertTrue(result.success)
        self.assertEqual(state.office_inventory["desk_lamp"], 1)
        self.assertEqual(state.funds, funds_before - 80.0)

    def test_vending_coffee_reuses_selected_worker_recovery(self):
        state = OfficeState.with_default_roster()
        state.select_worker(0)
        worker = state.roster.workers[0]
        worker.stamina = 30.0
        scene = build_tower_scene()
        scene.select_room("executive")
        vending = scene.objects.get("executive-vending")
        scene.player_position = vending.position

        result = scene.interact(state)

        self.assertTrue(result.success)
        self.assertEqual(result.route, "coffee-break")
        self.assertGreater(worker.stamina, 30.0)
        self.assertNotIn("coffee", state.office_inventory)

    def test_physical_service_objects_open_native_game_panels_and_decor_is_not_interactive(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        self.assertIsNone(scene.objects.get("lobby-tv"))

        phone_result = scene.interact(state, "lobby-pay-phone")
        self.assertTrue(phone_result.success)
        self.assertEqual(state.active_page, "phone")
        self.assertEqual(state.active_object_id, "lobby-pay-phone")
        self.assertEqual(scene.camera_focus_object_id, "lobby-pay-phone")

        state.close_page()
        atm_result = scene.interact(state, "lobby-atm")
        self.assertTrue(atm_result.success)
        self.assertEqual(state.active_page, "bank")
        self.assertEqual(state.active_object_id, "lobby-atm")

        state.close_page()
        scene.select_room("executive")
        scene.player_position = scene.objects.get("executive-chair").position
        self.assertTrue(scene.set_player_action("sit"))
        crt_result = scene.interact(state, "executive-crt")
        self.assertTrue(crt_result.success)
        self.assertEqual(state.active_page, "systems")
        self.assertEqual(state.active_object_id, "executive-crt")

        state.close_page()
        result = scene.interact(state, "executive-desk-lamp")
        self.assertFalse(result.success)
        self.assertIn("DECORATIVE", result.message)

    def test_terminal_requires_sitting_at_the_matching_workstation(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.select_room("executive")

        standing = scene.interact(state, "executive-crt")
        self.assertFalse(standing.success)
        self.assertEqual(standing.message, "SIT TO USE COMPUTER")
        self.assertIsNone(state.active_page)

        scene.player_position = scene.objects.get("executive-chair").position
        self.assertTrue(scene.set_player_action("sit"))
        wrong_station = scene.interact(state, "executive-crt-2")
        self.assertFalse(wrong_station.success)
        self.assertEqual(wrong_station.message, "WRONG WORKSTATION / SIT AT MATCHING CHAIR")
        self.assertIsNone(state.active_page)

        matching = scene.interact(state, "executive-crt")
        self.assertTrue(matching.success)
        self.assertEqual(matching.route, "systems-terminal")
        self.assertEqual(state.active_page, "systems")
        self.assertEqual(state.active_object_id, "executive-crt")

    def test_device_camera_focus_is_timed_and_denied_terminal_use_does_not_focus(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.select_room("executive")

        denied = scene.interact(state, "executive-crt")
        self.assertFalse(denied.success)
        self.assertIsNone(scene.camera_focus_object_id)

        terminal = scene.objects.get("executive-crt")
        scene.focus_on_interaction(terminal)
        self.assertEqual(scene.camera_focus_object_id, "executive-crt")
        scene.update_motion(1.0)
        self.assertGreater(scene.camera_focus_seconds, 0)
        scene.update_motion(2.0)
        self.assertIsNone(scene.camera_focus_object_id)
        self.assertEqual(scene.camera_focus_seconds, 0)

    def test_elevator_and_stairs_update_physical_floor(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        elevator = scene.objects.get("lobby-elevator")
        result = scene.interact(state, elevator.id)
        self.assertEqual(result.destination, "floor:1")
        self.assertEqual(scene.current_room, "recreation")

        scene.current_floor = 3
        stairs = scene.objects.get("floor-03-stairwell-2")
        result = scene.interact(state, stairs.id)
        self.assertEqual(result.destination, "floor:4")
        self.assertEqual(scene.current_room, "construction_f04")

    def test_tower_office_doors_toggle_and_b1_yard_fence_has_one_open_gate(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        door = scene.objects.get("floor-02-business-01-door")
        scene.select_room(door.room)
        scene.player_position = door.position

        opened = scene.interact(state, door.id)
        self.assertTrue(opened.success)
        self.assertIn(door.id, scene.opened_door_ids)
        closed = scene.interact(state, door.id)
        self.assertTrue(closed.success)
        self.assertNotIn(door.id, scene.opened_door_ids)

        b1 = FLOOR_PLAN["businessSuiteLayout"]["b1"]
        divider_x = int(b1["interiorBusinessHalf"][0]) + int(b1["interiorBusinessHalf"][2])
        access_y = int(b1["yardAccess"][1])
        scene.current_room = "basement_b1"
        self.assertTrue(scene._collides_with_object((divider_x, access_y + 1_000)))
        self.assertFalse(scene._collides_with_object((divider_x, access_y)))

    def test_headless_spatial_scene_renders(self):
        screen = pygame.display.set_mode((1180, 720))
        renderer = SolarPunkRenderer(screen)
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        renderer.draw_tower(state, scene)
        state.open_page("tools", from_object=True, source="CRT TERMINAL")
        renderer.draw_tower(state, scene)
        pygame.display.flip()
        self.assertEqual(screen.get_size(), (1180, 720))

    def test_player_walk_pose_tracks_actual_movement_not_velocity(self):
        screen = pygame.display.set_mode((1180, 720))
        renderer = SolarPunkRenderer(screen)
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.velocity = (300.0, 0.0)

        renderer.draw_tower(state, scene)
        renderer.draw_tower(state, scene)
        self.assertEqual(renderer._anim_tick, 0)

        scene.player_position = (scene.player_position[0] + 1, scene.player_position[1])
        renderer.draw_tower(state, scene)
        self.assertEqual(renderer._anim_tick, 1)

    def test_character_frames_use_full_sprite_cells(self):
        screen = pygame.display.set_mode((1180, 720))
        renderer = SolarPunkRenderer(screen)

        rendered, bounds, _ = renderer._character_sprite("left", 0, 0.32)

        self.assertIsNotNone(rendered)
        self.assertIsNotNone(bounds)
        self.assertGreater(bounds.height, bounds.width)

    def test_roster_character_assets_are_visually_distinct(self):
        screen = pygame.display.set_mode((1180, 720))
        renderer = SolarPunkRenderer(screen)

        first, _, _ = renderer._character_sprite(
            "down",
            0,
            0.32,
            npc=True,
            character_asset="characters/char_1.png",
        )
        second, _, _ = renderer._character_sprite(
            "down",
            0,
            0.32,
            npc=True,
            character_asset="characters/char_2.png",
        )

        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertNotEqual(
            pygame.image.tostring(first, "RGBA"),
            pygame.image.tostring(second, "RGBA"),
        )


if __name__ == "__main__":
    unittest.main()