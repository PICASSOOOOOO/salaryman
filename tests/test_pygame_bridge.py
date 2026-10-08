import json
import socket
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from pygame_sim.bridge import (
    MAX_OUTBOUND_LINE_BYTES,
    OfficeBridge,
    PROTOCOL_VERSION,
    apply_command,
    build_snapshot,
    validate_command,
)
from pygame_sim.scene import FLOOR_PLAN, build_tower_scene
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
        self.assertLessEqual(len(encoded.encode("utf-8")), MAX_OUTBOUND_LINE_BYTES)

    def test_full_default_snapshot_is_delivered_to_connected_client(self):
        bridge = OfficeBridge(port=0)
        self.assertTrue(bridge.start())
        client = socket.create_connection((bridge.host, bridge.port), timeout=1)
        try:
            bridge.poll_commands()
            bridge.send_snapshot(self.state, self.scene)
            bridge.flush()

            client.settimeout(2)
            received = bytearray()
            while b"\n" not in received:
                received.extend(client.recv(64 * 1024))
            payload = json.loads(received.partition(b"\n")[0])
            self.assertEqual(payload["type"], "snapshot")
            self.assertEqual(payload["sequence"], 1)
            self.assertEqual(payload["scene"]["navigation"]["room"], "lobby")
            self.assertIn("mission", payload["scene"]["navigation"])
        finally:
            client.close()
            bridge.close()

    def test_slow_client_keeps_only_the_latest_unsent_snapshot(self):
        class BlockedClient:
            def send(self, _data):
                raise BlockingIOError

            def close(self):
                pass

        class CollectingClient:
            def __init__(self):
                self.received = bytearray()

            def send(self, data):
                self.received.extend(data)
                return len(data)

            def close(self):
                pass

        bridge = OfficeBridge()
        bridge.client = BlockedClient()
        for _ in range(6):
            bridge.send_snapshot(self.state, self.scene)
            bridge.flush()

        collector = CollectingClient()
        bridge.client = collector
        bridge.flush()
        payload = json.loads(collector.received)
        self.assertEqual(payload["sequence"], 6)
        self.assertEqual(payload["scene"]["navigation"]["room"], "lobby")
        bridge.close()

    def test_oversized_outbound_message_fails_instead_of_being_silently_dropped(self):
        bridge = OfficeBridge()
        with self.assertRaisesRegex(ValueError, "outbound limit"):
            bridge.queue({"payload": "x" * MAX_OUTBOUND_LINE_BYTES})

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

    def test_business_rosters_have_one_suite_per_assignment_and_shared_hallway_machines(self):
        for floor in (2, 3, 4, 5, 6, 7):
            floor_data = FLOOR_PLAN["playableFloors"][str(floor)]
            rooms = (
                {str(business["officeRoom"]) for business in floor_data.get("businesses", [])}
                if floor == 6
                else {str(floor_data["room"])}
            )
            expected = [
                str(business["businessKey"])
                for business in floor_data.get("businesses", [])
            ]
            actual = [
                item.business_key
                for item in self.scene.objects.objects
                if item.room in rooms and item.kind == "business_suite"
            ]
            self.assertCountEqual(actual, expected, f"floor {floor} roster")
            if floor in (2, 3, 4, 5, 7):
                hallway_machines = [
                    item for item in self.scene.objects.objects
                    if item.room in rooms and item.kind in {"atm", "vending_machine"}
                ]
                self.assertEqual(
                    sum(item.kind == "atm" for item in hallway_machines),
                    1,
                    f"floor {floor} hallway ATM count",
                )
                self.assertEqual(
                    sum(item.kind == "vending_machine" for item in hallway_machines),
                    1,
                    f"floor {floor} hallway vending count",
                )

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

    def test_rear_entrance_interactions_request_authoritative_b1_transitions(self):
        calls = []
        basement_sync = SimpleNamespace(
            queue_enter=lambda _scene: calls.append("enter") or True,
            queue_exit=lambda _scene: calls.append("exit") or True,
        )
        lobby_entry = self.scene.objects.get("lobby-back-entrance")
        self.assertIsNotNone(lobby_entry)
        self.scene.player_position = lobby_entry.position
        enter = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "rear-enter",
                "name": "interact",
                "payload": {"object_id": "lobby-back-entrance"},
            },
            self.state,
            self.scene,
            basement_sync=basement_sync,
        )
        self.assertTrue(enter.ok)
        self.assertEqual(calls, ["enter"])

        self.assertTrue(self.scene.select_basement_level(1))
        b1_entry = self.scene.objects.get("basement-b1-back-entrance")
        self.assertIsNotNone(b1_entry)
        self.scene.player_position = b1_entry.position
        exit_result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "rear-exit",
                "name": "interact",
                "payload": {"object_id": "basement-b1-back-entrance"},
            },
            self.state,
            self.scene,
            basement_sync=basement_sync,
        )
        self.assertTrue(exit_result.ok)
        self.assertEqual(calls, ["enter", "exit"])

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

    def test_floor_seven_is_a_pablo_business_floor_without_a_directory_counter(self):
        self.assertTrue(self.scene.select_floor(7))
        self.assertEqual(self.scene.current_room, "floor07_business")
        self.assertIsNotNone(self.scene.objects.get("floor07-elevator"))
        self.assertIsNotNone(self.scene.objects.get("floor07-stairs"))
        self.assertIsNone(self.scene.objects.get("floor07-marketplace-counter"))

    def test_vending_page_switches_to_read_only_business_stock_and_back(self):
        vending = self.scene.objects.get("lobby-vending")
        self.assertIsNotNone(vending)
        self.state.open_page(
            "vending",
            from_object=True,
            source="TOWER VENDING",
            source_object_id=vending.id,
        )

        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "business-stock-from-vending",
            "name": "toggle_business_stock",
            "payload": {},
        }
        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "business_stock")
        self.assertEqual(self.state.active_object_id, vending.id)

        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "vending")

    def test_tower_floor_plan_keeps_capacity_rules_and_wall_cavity_routes_mapped(self):
        rules = FLOOR_PLAN["businessOpportunityRules"]
        self.assertEqual(rules["defaultBusinessesPerFloor"], 4)
        self.assertEqual(rules["maximumBusinessesOnLowerFloors"], 8)
        self.assertTrue(rules["higherFloorCapacityDecreasesWithAvailableRoom"])
        self.assertTrue(rules["capacityDependsOnFloorSizeAndLocation"])
        self.assertEqual(rules["minimumBusinessesWhenConsolidated"], 1)
        self.assertNotIn("floorBusinessCounts", FLOOR_PLAN)
        self.assertNotIn("businessUnits", FLOOR_PLAN)
        business_area = FLOOR_PLAN["floorProgram"]["pabloCorpBusinessArea"]
        self.assertEqual(business_area["floors"], list(range(1, 8)))
        self.assertEqual(business_area["basementFloors"], [f"B{level}" for level in range(1, 7)])
        self.assertEqual(business_area["rearShipping"]["floor"], "B1")
        known_floor_six = FLOOR_PLAN["playableFloors"]["6"]["businesses"]
        self.assertEqual(
            [entry["businessKey"] for entry in known_floor_six],
            [
                "radio_station",
                "music_studio",
                "school",
                "art_supply_store",
                "meeting_room",
                "public_workspace",
                "study_hall",
                "flower_shop",
            ],
        )

        infra = FLOOR_PLAN["infrastructureMap"]
        self.assertEqual(infra["standardFloor"]["clearEnvelopeMeters"], [220, 250])
        self.assertEqual(infra["wallServiceCavityMeters"], 0.12)
        self.assertEqual(infra["lobby"]["bounds"][2:], [4000, 6000])
        self.assertEqual(infra["lobby"]["clearEnvelopeMeters"], [40, 60])
        self.assertEqual(infra["basements"]["clearEnvelopeMeters"], [100, 100])
        systems = infra["systems"]
        route_ids = {route["id"] for route in infra["standardFloor"]["wallRoutes"]}
        self.assertTrue(systems)
        for system in systems:
            self.assertTrue(set(system["wallRouteIds"]).issubset(route_ids))
            self.assertIsNotNone(self.scene.objects.get(system["source"]["objectId"]))
            self.assertIsNotNone(self.scene.objects.get(system["repairStation"]["objectId"]))
        for route in infra["standardFloor"]["wallRoutes"]:
            for x, y in route["points"]:
                self.assertGreaterEqual(x, 0)
                self.assertGreaterEqual(y, 0)
                self.assertLessEqual(x, 22_000)
                self.assertLessEqual(y, 25_000)
        lobby_x, lobby_y, lobby_w, lobby_h = infra["lobby"]["bounds"]
        for route in infra["lobby"]["wallRoutes"]:
            for x, y in route["points"]:
                self.assertTrue(lobby_x <= x <= lobby_x + lobby_w)
                self.assertTrue(lobby_y <= y <= lobby_y + lobby_h)
        for route in infra["basements"]["wallRoutes"]:
            for x, y in route["points"]:
                self.assertTrue(0 <= x <= 10_000)
                self.assertTrue(0 <= y <= 10_000)
        for object_id in infra["lobby"]["branchAccessObjectIds"]:
            self.assertIsNotNone(self.scene.objects.get(object_id))

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
            "id": "mila-job-service",
            "name": "reception_choice",
            "payload": {"choice": 1},
        }
        with patch("pygame_sim.bridge.webbrowser.open", return_value=True) as open_browser:
            result = apply_command(command, self.state, self.scene, building_sync)
        self.assertTrue(result.ok)
        open_browser.assert_called_once_with(
            "https://salaryman.example/business/jobs"
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