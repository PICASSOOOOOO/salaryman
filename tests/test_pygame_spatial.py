import os
import unittest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

import pygame

from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState
from pygame_sim.ui import SolarPunkRenderer


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
                "tv",
                "atm",
                "vending_machine",
                "elevator",
                "stairs",
                "arcade",
                "desk",
                "chair",
            }.issubset(kinds)
        )
        self.assertEqual((scene.width, scene.height), (10_000, 10_000))

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

    def test_physical_service_objects_return_shared_routes_and_decor_is_not_interactive(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()

        expected_routes = {
            "lobby-pay-phone": "phone-center",
            "executive-telephone": "phone-center",
            "executive-crt": "office-record",
            "lobby-tv": "shadow-radio",
            "lobby-atm": "banking",
        }
        for object_id, route in expected_routes.items():
            result = scene.interact(state, object_id)
            self.assertTrue(result.success, object_id)
            self.assertEqual(result.route, route)

        result = scene.interact(state, "executive-desk-lamp")
        self.assertFalse(result.success)
        self.assertIn("DECORATIVE", result.message)

    def test_elevator_and_stairs_update_physical_floor(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        elevator = scene.objects.get("lobby-elevator")
        result = scene.interact(state, elevator.id)
        self.assertEqual(result.destination, "floor:1")
        self.assertEqual(scene.current_room, "recreation")

        scene.current_floor = 3
        stairs = scene.objects.get("executive-stairs")
        result = scene.interact(state, stairs.id)
        self.assertEqual(result.destination, "floor:2")
        self.assertEqual(scene.current_room, "public")

    def test_headless_spatial_scene_renders(self):
        screen = pygame.display.set_mode((1180, 720))
        renderer = SolarPunkRenderer(screen)
        renderer.draw_tower(OfficeState.with_default_roster(), build_tower_scene())
        pygame.display.flip()
        self.assertEqual(screen.get_size(), (1180, 720))


if __name__ == "__main__":
    unittest.main()