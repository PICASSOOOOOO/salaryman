import json
import socket
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from pygame_sim.bridge import (
    OfficeBridge,
    PROTOCOL_VERSION,
    apply_command,
    build_snapshot,
    validate_command,
)
from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState


class PygameBridgeTests(unittest.TestCase):
    def setUp(self):
        self.state = OfficeState.with_default_roster()
        self.scene = build_tower_scene()

    def test_snapshot_is_versioned_and_json_safe(self):
        snapshot = build_snapshot(self.state, self.scene, sequence=7)
        encoded = json.dumps(snapshot)
        decoded = json.loads(encoded)
        self.assertEqual(decoded["type"], "snapshot")
        self.assertEqual(decoded["version"], PROTOCOL_VERSION)
        self.assertEqual(decoded["sequence"], 7)
        self.assertEqual(len(decoded["scene"]["objects"]), len(self.scene.objects.objects))
        self.assertEqual(decoded["scene"]["navigation"]["room"], "lobby")
        self.assertIn("mission", decoded["scene"]["navigation"])
        self.assertIsInstance(decoded["scene"]["navigation"]["exits"], list)
        self.assertFalse(decoded["office"]["musicEnabled"])

    def test_basement_cannot_be_left_by_room_or_floor_selection(self):
        self.assertTrue(self.scene.select_basement_level(1))
        self.assertFalse(self.scene.select_room("lobby"))
        self.assertFalse(self.scene.select_floor(1))
        self.assertEqual(self.scene.current_room, "basement_b1")
        self.assertEqual(self.scene.basement_level, 1)

    def test_basement_stair_registry_has_one_valid_exit_per_landing(self):
        for level in range(1, 7):
            room_id = f"basement_b{level}"
            up_stairs = [
                item for item in self.scene.objects.objects
                if item.room == room_id and item.id == f"basement-stairs-up-b{level}"
            ]
            down_stairs = [
                item for item in self.scene.objects.objects
                if item.room == room_id and item.id == f"basement-stairs-down-b{level}"
            ]
            self.assertEqual(len(up_stairs), 1)
            self.assertEqual(len(down_stairs), 1 if level < 6 else 0)

    def test_music_toggle_is_in_the_bridge_snapshot_and_is_opt_in(self):
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "music-1",
                "name": "toggle_music",
                "payload": {},
            },
            self.state,
            self.scene,
        )
        self.assertTrue(result.ok)
        self.assertTrue(build_snapshot(self.state, self.scene, sequence=8)["office"]["musicEnabled"])

    def test_validated_move_routes_through_tower_scene(self):
        before = self.scene.player_position
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "move-1",
                "name": "move",
                "payload": {"dx": 350, "dy": 0},
            },
            self.state,
            self.scene,
        )
        self.assertTrue(result.ok)
        self.assertNotEqual(self.scene.player_position, before)

    def test_continuous_input_uses_normalized_acceleration_and_friction(self):
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "input-1",
                "name": "set_input",
                "payload": {"x": 1, "y": 1},
            },
            self.state,
            self.scene,
        )
        self.assertTrue(result.ok)
        for _ in range(30):
            self.scene.update_motion(1 / 60)
        diagonal_speed = (self.scene.velocity[0] ** 2 + self.scene.velocity[1] ** 2) ** 0.5
        self.assertAlmostEqual(diagonal_speed, self.scene.MAX_SPEED, delta=1.0)
        self.scene.set_motion_input(0, 0)
        for _ in range(30):
            self.scene.update_motion(1 / 60)
        self.assertLess((self.scene.velocity[0] ** 2 + self.scene.velocity[1] ** 2) ** 0.5, 1.0)

    def test_sprint_input_uses_the_higher_authoritative_speed(self):
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "sprint-1",
                "name": "set_input",
                "payload": {"x": 1, "y": 0, "sprint": True},
            },
            self.state,
            self.scene,
        )
        self.assertTrue(result.ok)
        for _ in range(30):
            self.scene.update_motion(1 / 60)
        self.assertAlmostEqual(abs(self.scene.velocity[0]), self.scene.SPRINT_SPEED, delta=1.0)

    def test_godot_action_commands_reach_python_state(self):
        for action in ("jump", "fight", "sweep"):
            result = apply_command(
                {
                    "type": "command",
                    "version": PROTOCOL_VERSION,
                    "id": f"action-{action}",
                    "name": "set_action",
                    "payload": {"action": action},
                },
                self.state,
                self.scene,
            )
            self.assertTrue(result.ok)
            self.assertEqual(self.scene.player_action, action)
        self.assertGreater(self.scene.player_action_remaining, 0.0)

    def test_invalid_sprint_flag_is_rejected(self):
        valid, reason = validate_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "sprint-invalid",
                "name": "set_input",
                "payload": {"x": 1, "y": 0, "sprint": "yes"},
            }
        )
        self.assertFalse(valid)
        self.assertEqual(reason, "SPRINT MUST BE A BOOLEAN")

    def test_oversized_move_is_rejected_without_mutating_scene(self):
        before = self.scene.player_position
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "move-2",
            "name": "move",
            "payload": {"dx": 10000, "dy": 0},
        }
        valid, reason = validate_command(command)
        result = apply_command(command, self.state, self.scene)
        self.assertFalse(valid)
        self.assertIn("TOO LARGE", reason)
        self.assertFalse(result.ok)
        self.assertEqual(self.scene.player_position, before)

    def test_interaction_uses_existing_object_authority(self):
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "interact-1",
                "name": "interact",
                "payload": {"object_id": "lobby-reception-desk"},
            },
            self.state,
            self.scene,
        )
        self.assertTrue(result.ok)
        self.assertIn("RECEPTION", result.message)

    def test_mila_reception_opens_a_unified_services_menu(self):
        receptionist = self.scene.objects.get("lobby-receptionist")
        self.assertIsNotNone(receptionist)
        self.scene.player_position = receptionist.position
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "mila-interact",
                "name": "interact",
                "payload": {"object_id": "lobby-receptionist"},
            },
            self.state,
            self.scene,
        )
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "reception")
        self.assertEqual(self.state.page_source, "MILA / RECEPTION")

    def test_floor_seven_marketplace_counter_opens_business_directory(self):
        self.assertTrue(self.scene.select_floor(7))
        counter = self.scene.objects.get("floor07-marketplace-counter")
        self.assertIsNotNone(counter)
        self.scene.player_position = counter.position
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "floor07-marketplace",
                "name": "interact",
                "payload": {"object_id": counter.id},
            },
            self.state,
            self.scene,
        )
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "marketplace")
        self.assertEqual(self.state.active_object_id, "floor07-marketplace-counter")

    def test_floors_eight_through_sixty_seven_remain_under_construction(self):
        self.assertFalse(self.scene.select_floor(8))
        self.assertFalse(self.scene.select_floor(67))
        self.assertEqual(self.scene.floor_status(8), "under_construction")
        self.assertEqual(self.scene.floor_status(67), "under_construction")

    def test_godot_vending_purchase_uses_linked_server_stock(self):
        vending = self.scene.objects.get("lobby-vending")
        self.assertIsNotNone(vending)
        self.scene.player_position = vending.position
        self.state.vending_catalog = [{"id": "vend_coffee"}]
        self.state.open_page(
            "vending",
            from_object=True,
            source="TOWER VENDING",
            source_object_id=vending.id,
        )
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id=None: requests.append((action, item_id)) or True,
        )
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "godot-vending-purchase",
                "name": "buy_vending",
                "payload": {"item_id": "vend_coffee"},
            },
            self.state,
            self.scene,
            building_sync,
        )
        self.assertTrue(result.ok)
        self.assertEqual(requests, [("buy_vending", "vend_coffee")])

    def test_mila_menu_opens_only_the_selected_existing_service(self):
        self.scene.player_position = (49_978_250, 49_998_600)
        self.state.open_page(
            "reception",
            from_object=True,
            source="MILA / RECEPTION",
            source_object_id="lobby-receptionist",
        )
        building_sync = SimpleNamespace(
            link=SimpleNamespace(server_url="https://salaryman.example")
        )
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "mila-business-market",
            "name": "reception_choice",
            "payload": {"choice": 1},
        }
        with patch("pygame_sim.bridge.webbrowser.open", return_value=True) as open_browser:
            result = apply_command(command, self.state, self.scene, building_sync)
        self.assertTrue(result.ok)
        open_browser.assert_called_once_with(
            "https://salaryman.example/business/marketplace"
        )
        self.assertIsNone(self.state.active_page)

    def test_mila_menu_rejects_invalid_choice_and_requires_link(self):
        self.scene.player_position = (49_978_250, 49_998_600)
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "mila-invalid",
            "name": "reception_choice",
            "payload": {"choice": 5},
        }
        self.assertFalse(validate_command(command)[0])
        self.state.open_page(
            "reception",
            from_object=True,
            source="MILA / RECEPTION",
            source_object_id="lobby-receptionist",
        )
        command["payload"]["choice"] = 2
        result = apply_command(command, self.state, self.scene)
        self.assertFalse(result.ok)
        self.assertIn("LINK A GAME ACCOUNT", result.message)

    def test_systems_terminal_numbered_choices_open_only_existing_game_panels(self):
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "terminal-1",
            "name": "terminal_choice",
            "payload": {"choice": 1},
        }
        valid, reason = validate_command(command)
        self.assertTrue(valid, reason)

        command["payload"]["choice"] = True
        self.assertFalse(validate_command(command)[0])
        command["payload"]["choice"] = 10
        self.assertFalse(validate_command(command)[0])

        self.state.open_page(
            "systems",
            from_object=True,
            source="SYSTEMS TERMINAL",
            source_object_id="test-terminal",
        )
        command["payload"]["choice"] = 1
        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "automation")
        self.assertEqual(self.scene.selected_automation_domain, "business_ops")

        self.state.open_page("systems", from_object=True, source="SYSTEMS TERMINAL")
        command["payload"]["choice"] = 7
        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "bank")

        self.state.open_page("systems", from_object=True, source="SYSTEMS TERMINAL")
        command["payload"]["choice"] = 8
        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "phone")

        self.state.open_page("systems", from_object=True, source="SYSTEMS TERMINAL")
        command["payload"]["choice"] = 9
        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertIsNone(self.state.active_page)

        result = apply_command(command, self.state, self.scene)
        self.assertFalse(result.ok)

    def test_unknown_or_wrong_version_commands_do_not_mutate_state(self):
        before = self.state.running
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION + 1,
                "id": "bad-1",
                "name": "toggle_running",
                "payload": {},
            },
            self.state,
            self.scene,
        )
        self.assertFalse(result.ok)
        self.assertEqual(self.state.running, before)

    def test_malformed_payload_types_are_rejected_without_crashing(self):
        malformed = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "bad-types",
            "name": ["toggle_running"],
            "payload": {"kind": ["lunch"]},
        }
        valid, reason = validate_command(malformed)
        self.assertFalse(valid)
        self.assertEqual(reason, "COMMAND NOT ALLOWED")

    def test_socket_bridge_reassembles_split_json_lines(self):
        bridge = OfficeBridge(port=0)
        self.assertTrue(bridge.start())
        client = socket.create_connection((bridge.host, bridge.port), timeout=1)
        try:
            message = json.dumps(
                {
                    "type": "command",
                    "version": PROTOCOL_VERSION,
                    "id": "split-1",
                    "name": "toggle_running",
                    "payload": {},
                }
            ).encode("utf-8") + b"\n"
            split_at = len(message) // 2
            client.sendall(message[:split_at])
            self.assertEqual(bridge.poll_commands(), [])
            client.sendall(message[split_at:])
            commands = bridge.poll_commands()
            self.assertEqual(commands[0]["id"], "split-1")
        finally:
            client.close()
            bridge.close()


if __name__ == "__main__":
    unittest.main()