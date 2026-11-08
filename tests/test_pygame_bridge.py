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
        self.state.collections_case_stage = 2
        self.state.business_shelf_stock = {
            "fish-store": [{
                "itemId": "fish_goldfish",
                "name": "Goldfish",
                "itemType": "pet",
                "shelfQuantity": 2,
            }],
        }
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
        self.assertEqual(decoded["office"]["collectionsCaseStage"], 2)
        self.assertEqual(
            decoded["office"]["businessShelfStock"]["fish-store"][0]["shelfQuantity"],
            2,
        )
        self.assertLessEqual(len(encoded.encode("utf-8")), MAX_OUTBOUND_LINE_BYTES)

    def test_business_door_snapshot_tracks_open_hours_for_godot(self):
        door = self.scene.objects.get("floor-02-business-01-door")
        self.assertIsNotNone(door)

        with patch(
            "pygame_sim.bridge.business_hours_status",
            return_value=(True, "MON–SAT 06:00–22:00"),
        ):
            open_snapshot = build_snapshot(self.state, self.scene, sequence=8)
        open_door = next(item for item in open_snapshot["scene"]["objects"] if item["id"] == door.id)
        self.assertTrue(open_door["businessOpen"])
        self.assertTrue(open_door["doorOpen"])
        self.assertEqual(open_door["businessHours"], "MON–SAT 06:00–22:00")

        with patch(
            "pygame_sim.bridge.business_hours_status",
            return_value=(False, "MON–SAT 06:00–22:00"),
        ):
            closed_snapshot = build_snapshot(self.state, self.scene, sequence=9)
        closed_door = next(item for item in closed_snapshot["scene"]["objects"] if item["id"] == door.id)
        self.assertFalse(closed_door["businessOpen"])
        self.assertFalse(closed_door["doorOpen"])

    def test_vehicle_dealership_kiosk_opens_its_shop_screen(self):
        dealership = self.scene.objects.get("lobby-kiosk-vehicle_dealership")
        self.assertIsNotNone(dealership)
        self.assertEqual(dealership.business_key, "vehicle_dealership")

        with patch(
            "pygame_sim.objects.business_hours_status",
            return_value=(True, "EVERY DAY 00:00–24:00"),
        ):
            result = self.scene.objects.interact(dealership.id, self.state, self.scene)

        self.assertTrue(result.success)
        self.assertEqual(self.state.active_page, "business_shop")
        self.assertEqual(self.state.active_object_id, dealership.id)

    def test_business_shop_screen_offers_a_server_backed_shelf_restock_action(self):
        import pygame
        from pygame_sim.ui import SolarPunkRenderer

        shop = self.scene.objects.get("lobby-kiosk-vehicle_dealership")
        self.assertIsNotNone(shop)
        self.scene.player_position = shop.position
        self.state.open_page(
            "business_shop",
            from_object=True,
            source="VEHICLE DEALERSHIP",
            source_object_id=shop.id,
        )
        self.state.business_stock_lines = [{
            "sellerBusinessKey": "vehicle_dealership",
            "items": [{"id": "veh_car", "name": "City Sedan", "priceFiat": 120_000}],
        }]
        self.state.business_shelf_stock = {"vehicle_dealership": [{
            "itemId": "veh_car",
            "name": "City Sedan",
            "shelfQuantity": 2,
        }]}

        renderer = object.__new__(SolarPunkRenderer)
        renderer.font_lg = renderer.font_mono = renderer.font_md = renderer.font_sm = None
        renderer.game_page_actions = {}
        renderer.text = lambda *_args, **_kwargs: None
        renderer.panel = lambda *_args, **_kwargs: None
        renderer._draw_business_page(self.state, self.scene, pygame.Rect(42, 76, 816, 514))

        self.assertIn("shopbuy:vehicle_dealership:veh_car", renderer.game_page_actions)
        self.assertIn("shoprestock:vehicle_dealership:veh_car", renderer.game_page_actions)

    def test_gold_exchange_is_a_dedicated_lobby_kiosk_and_banco_ombra_stays_bank_only(self):
        exchange = self.scene.objects.get("lobby-kiosk-tower_gold_exchange")
        self.assertIsNotNone(exchange)
        self.assertEqual(exchange.service_actions, ("gold_exchange",))
        bank = next(
            item for item in self.scene.objects.objects
            if item.business_key == "banco_ombra" and item.kind == "business_suite"
        )
        self.assertEqual(bank.service_actions, ("bank_balance",))

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

    def test_native_menu_can_open_settings_without_visible_hud_prompts(self):
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": "open_settings_menu",
            "payload": {},
        }
        self.assertTrue(validate_command(command)[0])
        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "settings")
        self.assertEqual(self.state.page_source, "SETTINGS MENU")

    def test_phone_choice_opens_only_the_selected_linked_service(self):
        self.state.open_page("phone", source="PLAYER MENU")
        building_sync = SimpleNamespace(
            link=SimpleNamespace(server_url="https://salaryman.example/")
        )
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": "phone_choice",
            "payload": {"choice": 2},
        }
        with patch("pygame_sim.bridge.webbrowser.open", return_value=True) as open_url:
            result = apply_command(command, self.state, self.scene, building_sync)

        self.assertTrue(result.ok)
        self.assertEqual(result.message, "OPENING COMMS")
        open_url.assert_called_once_with("https://salaryman.example/comms")

    def test_phone_choice_requires_link_and_phone_page(self):
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": "phone_choice",
            "payload": {"choice": 1},
        }
        invalid_choice = {**command, "payload": {"choice": 3}}
        self.assertFalse(validate_command(invalid_choice)[0])

        not_open = apply_command(command, self.state, self.scene)
        self.assertFalse(not_open.ok)

        self.state.open_page("phone", source="PLAYER MENU")
        no_link = apply_command(command, self.state, self.scene)
        self.assertFalse(no_link.ok)
        self.assertIn("LINK A GAME ACCOUNT", no_link.message)

    def test_desk_telephone_opens_phone_page_and_enforces_proximity(self):
        telephone = self.scene.objects.get("lobby-reception-desk-phone")
        self.assertIsNotNone(telephone)
        self.scene.player_position = telephone.position
        interact = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": "interact",
            "payload": {"object_id": telephone.id},
        }
        opened = apply_command(interact, self.state, self.scene)
        self.assertTrue(opened.ok)
        self.assertEqual(self.state.active_page, "phone")
        self.assertEqual(self.state.page_source, "DESK PHONE")

        self.scene.player_position = (
            telephone.position[0] + 5_000,
            telephone.position[1],
        )
        service = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": "phone_choice",
            "payload": {"choice": 1},
        }
        too_far = apply_command(
            service,
            self.state,
            self.scene,
            SimpleNamespace(link=SimpleNamespace(server_url="https://salaryman.example")),
        )
        self.assertFalse(too_far.ok)
        self.assertIn("MOVE BACK TO THE PHONE", too_far.message)

        self.scene.player_position = telephone.position
        building_sync = SimpleNamespace(
            link=SimpleNamespace(server_url="https://salaryman.example")
        )
        with patch("pygame_sim.bridge.webbrowser.open", return_value=True) as open_url:
            selected = apply_command(service, self.state, self.scene, building_sync)
        self.assertTrue(selected.ok)
        open_url.assert_called_once_with("https://salaryman.example/phone")

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

    def test_b4_supply_counter_queues_a_server_authorized_issue_request(self):
        self.assertTrue(self.scene.select_basement_level(4))
        supply_store = self.scene.objects.get("basement-b4-supply-store")
        self.assertIsNotNone(supply_store)
        self.assertTrue(supply_store.interactive)
        self.assertIn("TRIAGE KIT", supply_store.label)
        self.scene.player_position = supply_store.position
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id=None: requests.append((action, item_id)) or True,
        )

        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "b4-issue-supplies",
                "name": "interact",
                "payload": {"object_id": supply_store.id},
            },
            self.state,
            self.scene,
            building_sync,
        )

        self.assertTrue(result.ok)
        self.assertEqual(requests, [("supply_issue", None)])

    def test_b1_shop_freight_dock_opens_the_manifest_page_and_refreshes(self):
        self.assertTrue(self.scene.select_basement_level(1))
        dock = self.scene.objects.get("basement-b1-shop-freight-dock")
        self.assertIsNotNone(dock)
        assert dock is not None
        self.scene.player_position = dock.position
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id=None: requests.append((action, item_id)) or True,
        )

        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "b1-freight-dock",
                "name": "interact",
                "payload": {"object_id": dock.id},
            },
            self.state,
            self.scene,
            building_sync,
        )

        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "shop_freight_dock")
        self.assertEqual(requests, [("shop_freight_snapshot", None)])

    def test_b1_freight_pickup_and_shop_delivery_use_physical_interactions(self):
        shipment_id = "12345678-1234-1234-1234-123456789abc"
        self.assertTrue(self.scene.select_basement_level(1))
        self.state.open_page("shop_freight_dock", from_object=True, source="B1 DOCK")
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id=None: requests.append((action, item_id)) or True,
        )
        pickup = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "name": "shop_freight_pickup",
                "payload": {"shipment_id": shipment_id},
            },
            self.state,
            self.scene,
            building_sync,
        )
        self.assertTrue(pickup.ok)
        self.assertEqual(requests, [("shop_freight_pickup", shipment_id)])

        delivery_scene = build_tower_scene()
        self.assertTrue(delivery_scene.select_floor(2))
        shop = next(
            item for item in delivery_scene.objects.objects
            if item.kind == "business_suite" and item.room == delivery_scene.current_room
        )
        delivery_scene.player_position = shop.position
        self.state.shop_freight_shipments_in_delivery = [{
            "id": shipment_id,
            "businessKey": shop.business_key,
            "status": "in_delivery",
        }]
        delivery = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "name": "interact",
                "payload": {"object_id": shop.id},
            },
            self.state,
            delivery_scene,
            building_sync,
        )
        self.assertTrue(delivery.ok)
        self.assertEqual(requests[-1], ("shop_freight_receive", shipment_id))

    def test_b4_supply_counter_opens_quarantine_instead_of_issuing_during_contamination(self):
        self.assertTrue(self.scene.select_basement_level(4))
        supply_store = self.scene.objects.get("basement-b4-supply-store")
        self.assertIsNotNone(supply_store)
        assert supply_store is not None
        self.scene.player_position = supply_store.position
        self.scene.set_basement_snapshot({
            "level": 4,
            "alarms": [{
                "id": "b4-poison",
                "type": "poison",
                "floor": "B4",
                "mode": "quiet",
                "status": "active",
                "summary": "Supply contamination sensor activated",
            }],
        })
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id=None: requests.append((action, item_id)) or True,
        )

        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "b4-quarantine",
                "name": "interact",
                "payload": {"object_id": supply_store.id},
            },
            self.state,
            self.scene,
            building_sync,
        )

        self.assertTrue(result.ok)
        self.assertEqual(self.state.active_page, "b4_supply_response")
        self.assertEqual(requests, [])

    def test_native_disaster_response_commands_queue_only_allowlisted_server_actions(self):
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id=None: requests.append((action, item_id)) or True,
        )
        cases = (
            (3, "disaster_response", "respond_b3_alarm", "alarm_response"),
            (4, "b4_supply_response", "quarantine_b4_supplies", "supply_quarantine"),
        )
        for level, page, command_name, expected_action in cases:
            self.assertTrue(self.scene.select_basement_level(level))
            self.state.open_page(page, from_object=True, source="TEST RESPONSE STATION")
            alarm_id = "12345678-1234-1234-1234-123456789abc"
            result = apply_command(
                {
                    "type": "command",
                    "version": PROTOCOL_VERSION,
                    "id": f"native-response-b{level}",
                    "name": command_name,
                    "payload": {"alarm_id": alarm_id},
                },
                self.state,
                self.scene,
                building_sync,
            )
            self.assertTrue(result.ok)
            self.assertEqual(requests[-1], (expected_action, alarm_id))

        invalid = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "name": "quarantine_b4_supplies",
                "payload": {"alarm_id": "not-a-uuid"},
            },
            self.state,
            self.scene,
            building_sync,
        )
        self.assertFalse(invalid.ok)

    def test_b2_collections_case_requires_each_physical_station_in_order(self):
        self.assertTrue(self.scene.select_basement_level(2))
        stations = (
            ("basement-b2-collections-clerk", 1),
            ("basement-b2-collections-desk-01", 2),
            ("basement-b2-security-desk", 3),
            ("basement-b2-investigations-desk", 4),
            ("basement-b2-collections-clerk", 5),
        )

        # Investigations cannot be filed before the clerk opens the case.
        evidence_desk = self.scene.objects.get("basement-b2-investigations-desk")
        self.assertIsNotNone(evidence_desk)
        self.scene.player_position = evidence_desk.position
        denied = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "b2-case-out-of-order",
                "name": "interact",
                "payload": {"object_id": evidence_desk.id},
            },
            self.state,
            self.scene,
        )
        self.assertFalse(denied.ok)
        self.assertEqual(self.state.collections_case_stage, 0)

        for index, (object_id, expected_stage) in enumerate(stations):
            station = self.scene.objects.get(object_id)
            self.assertIsNotNone(station, object_id)
            self.assertTrue(station.interactive, object_id)
            self.assertTrue(self.scene._room_position_is_walkable(station.position), object_id)
            self.scene.player_position = station.position
            result = apply_command(
                {
                    "type": "command",
                    "version": PROTOCOL_VERSION,
                    "id": f"b2-case-step-{index}",
                    "name": "interact",
                    "payload": {"object_id": object_id},
                },
                self.state,
                self.scene,
            )
            self.assertTrue(result.ok, result.message)
            self.assertEqual(self.state.collections_case_stage, expected_stage)
            self.assertEqual(self.state.active_page, "collections_case")

    def test_b3_disaster_response_board_opens_the_live_status_page(self):
        self.assertTrue(self.scene.select_basement_level(3))
        board = self.scene.objects.get("basement-b3-disaster-response")
        self.assertIsNotNone(board)
        assert board is not None
        self.scene.player_position = board.position

        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "b3-response-board",
                "name": "interact",
                "payload": {"object_id": board.id},
            },
            self.state,
            self.scene,
        )

        self.assertTrue(result.ok, result.message)
        self.assertEqual(self.state.active_page, "disaster_response")
        self.assertEqual(self.state.active_object_id, board.id)

    def test_b3_fire_station_opens_the_response_page(self):
        self.assertTrue(self.scene.select_basement_level(3))
        station = self.scene.objects.get("basement-b3-fire-station")
        self.assertIsNotNone(station)
        assert station is not None
        self.assertTrue(station.interactive)
        self.scene.player_position = station.position

        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "b3-fire-station-response",
                "name": "interact",
                "payload": {"object_id": station.id},
            },
            self.state,
            self.scene,
        )

        self.assertTrue(result.ok, result.message)
        self.assertEqual(self.state.active_page, "disaster_response")
        self.assertEqual(self.state.active_object_id, station.id)

    def test_b3_response_page_exposes_the_server_prioritized_work_action(self):
        import pygame
        from pygame_sim.ui import SolarPunkRenderer

        renderer = object.__new__(SolarPunkRenderer)
        renderer.font_mono = None
        renderer.font_sm = None
        renderer.screen = pygame.Surface((900, 700))
        renderer.game_page_actions = {}
        rendered_text = []
        renderer.text = lambda text, *_args, **_kwargs: rendered_text.append(text)
        renderer.panel = lambda *_args, **_kwargs: None
        page = pygame.Rect(42, 76, 816, 514)
        scene = SimpleNamespace(basement_snapshot={
            "building": {"powerCondition": 42, "plumbingCondition": 88, "upkeepCondition": 65},
            "towerOperations": {"storedSupplyCrates": 2, "backupInfrastructureUnitsPowered": 1},
            "alarms": [{
                "floor": "B4",
                "type": "fire",
                "status": "active",
                "summary": "Smoke near the supply storage.",
            }],
        })
        state = SimpleNamespace(
            active_page="disaster_response",
            tower_work_advice="The generator is the top approved maintenance priority.",
        )

        renderer._draw_basement_page(state, scene, page)

        action = renderer.game_page_actions["tower:ask_work_advice"]
        self.assertTrue(page.contains(action))
        self.assertTrue(any(
            "TOWER ADVISER / The generator is the top approved maintenance priority." in line
            for line in rendered_text
        ))
        self.assertTrue(any(
            "ACTIVE INCIDENTS / 1 / B4 FIRE" in line
            for line in rendered_text
        ))

    def test_b3_fire_station_shows_only_local_fire_or_smoke_response_actions(self):
        import pygame
        from pygame_sim.ui import SolarPunkRenderer

        renderer = object.__new__(SolarPunkRenderer)
        renderer.font_mono = None
        renderer.font_sm = None
        renderer.screen = pygame.Surface((900, 700))
        renderer.game_page_actions = {}
        renderer.text = lambda *_args, **_kwargs: None
        renderer.panel = lambda *_args, **_kwargs: None
        page = pygame.Rect(42, 76, 816, 514)
        scene = SimpleNamespace(basement_snapshot={
            "building": {},
            "towerOperations": {},
            "alarms": [
                {"id": "b3-smoke", "floor": "B3", "type": "smoke", "status": "active"},
                {"id": "b4-fire", "floor": "B4", "type": "fire", "status": "active"},
                {"id": "b3-crime", "floor": "B3", "type": "crime_scene", "status": "active"},
            ],
        })
        state = SimpleNamespace(
            active_page="disaster_response",
            active_object_id="basement-b3-fire-station",
            tower_work_advice="",
        )

        renderer._draw_basement_page(state, scene, page)

        self.assertIn("alarm_response:b3-smoke", renderer.game_page_actions)
        self.assertNotIn("alarm_response:b4-fire", renderer.game_page_actions)
        self.assertNotIn("alarm_response:b3-crime", renderer.game_page_actions)

    def test_b1_freight_page_lists_and_actions_only_shipments_waiting_at_the_dock(self):
        import pygame
        from pygame_sim.ui import SolarPunkRenderer

        renderer = object.__new__(SolarPunkRenderer)
        renderer.font_mono = None
        renderer.font_sm = None
        renderer.font_md = None
        renderer.screen = pygame.Surface((900, 700))
        renderer.game_page_actions = {}
        renderer.text = lambda *_args, **_kwargs: None
        renderer.panel = lambda *_args, **_kwargs: None
        page = pygame.Rect(42, 76, 816, 514)
        state = SimpleNamespace(
            active_page="shop_freight_dock",
            shop_freight_shipments_at_dock=[
                {
                    "id": "shipment-1",
                    "businessKey": "fish-store",
                    "lines": [{"itemId": "fish_goldfish", "quantity": 4}],
                },
                {
                    "id": "shipment-2",
                    "businessKey": "tower-clinic",
                    "lines": [{"itemId": "clinic_kit", "quantity": 2}],
                },
            ],
            shop_freight_shipments_in_delivery=[],
        )

        renderer._draw_basement_page(state, SimpleNamespace(), page)

        self.assertIn("shop_freight_pickup:shipment-1", renderer.game_page_actions)
        self.assertIn("shop_freight_pickup:shipment-2", renderer.game_page_actions)

    def test_b4_quarantine_page_exposes_only_active_poison_alarms(self):
        import pygame
        from pygame_sim.ui import SolarPunkRenderer

        renderer = object.__new__(SolarPunkRenderer)
        renderer.font_mono = None
        renderer.font_sm = None
        renderer.screen = pygame.Surface((900, 700))
        renderer.game_page_actions = {}
        renderer.text = lambda *_args, **_kwargs: None
        renderer.panel = lambda *_args, **_kwargs: None
        page = pygame.Rect(42, 76, 816, 514)
        scene = SimpleNamespace(basement_snapshot={
            "alarms": [
                {"id": "b4-poison", "floor": "B4", "type": "poison", "status": "active"},
                {"id": "b4-flood", "floor": "B4", "type": "flood", "status": "active"},
                {"id": "b3-poison", "floor": "B3", "type": "poison", "status": "active"},
            ],
        })
        state = SimpleNamespace(active_page="b4_supply_response")

        renderer._draw_basement_page(state, scene, page)

        self.assertIn("supply_quarantine:b4-poison", renderer.game_page_actions)
        self.assertNotIn("supply_quarantine:b4-flood", renderer.game_page_actions)
        self.assertNotIn("supply_quarantine:b3-poison", renderer.game_page_actions)

    def test_tower_food_water_and_triage_items_appear_as_usable_stamina_supplies(self):
        self.state.game_inventory = [{
            "itemId": "tower_clinic_triage_kit",
            "quantity": 2,
        }, {
            "itemId": "tower_food_supply_crate",
            "quantity": 1,
        }, {
            "itemId": "tower_water_ration",
            "quantity": 3,
        }]

        snapshot = build_snapshot(self.state, self.scene, sequence=9)

        self.assertEqual(
            snapshot["office"]["staminaSupplies"],
            [
                {"itemId": "tower_clinic_triage_kit", "quantity": 2},
                {"itemId": "tower_food_supply_crate", "quantity": 1},
                {"itemId": "tower_water_ration", "quantity": 3},
            ],
        )

    def test_b1_work_bonus_items_can_be_used_from_the_inventory(self):
        self.state.active_page = "inventory"
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id=None: requests.append((action, item_id)) or True,
        )
        item_ids = (
            "tower_admin_pass",
            "tower_construction_starter_kit",
            "tower_priority_manifest",
            "tower_waste_sorting_kit",
            "tower_materials_bundle",
        )
        for item_id in item_ids:
            command = {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": f"use-{item_id}",
                "name": "use_pest_supply",
                "payload": {"item_id": item_id},
            }
            self.assertTrue(validate_command(command)[0], item_id)
            result = apply_command(command, self.state, self.scene, building_sync)
            self.assertTrue(result.ok, item_id)
        self.assertEqual(
            requests,
            [("consume_supply", item_id) for item_id in item_ids],
        )

    def test_tower_work_advice_is_a_read_only_basement_command(self):
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": "ask_tower_work_advice",
            "payload": {},
        }
        self.assertTrue(validate_command(command)[0])

        class AdviceQueue:
            def __init__(self):
                self.requests = 0

            def queue_work_advice(self):
                self.requests += 1
                return True

        advice_queue = AdviceQueue()
        self.assertTrue(self.scene.select_basement_level(4))
        result = apply_command(command, self.state, self.scene, basement_sync=advice_queue)
        self.assertTrue(result.ok)
        self.assertEqual(advice_queue.requests, 1)
        self.assertTrue(self.state.tower_work_advice.startswith("Checking"))
        self.state.tower_work_advice = "The generator is the top approved maintenance priority."
        snapshot = build_snapshot(self.state, self.scene, sequence=2)
        self.assertEqual(
            snapshot["office"]["towerWorkAdvice"],
            "The generator is the top approved maintenance priority.",
        )

        lobby_scene = build_tower_scene()
        denied = apply_command(command, self.state, lobby_scene, basement_sync=advice_queue)
        self.assertFalse(denied.ok)
        self.assertEqual(advice_queue.requests, 1)

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
        self.assertIn("OPEN MIC", result.message)

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
        self.assertEqual(business_area["floors"], list(range(1, 13)))
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
        expected_business_keys = {
            business["businessKey"]
            for floor in FLOOR_PLAN["playableFloors"].values()
            for business in floor.get("businesses", [])
        }
        expected_business_keys.update(
            business["businessKey"] for business in FLOOR_PLAN["businessSuiteLayout"]["lobbyKiosks"]
        )
        expected_business_keys.update(business["businessKey"] for business in business_area["b1Businesses"])
        registered_business_keys = {
            item.business_key for item in self.scene.objects.objects if item.business_key
        }
        self.assertTrue(expected_business_keys.issubset(registered_business_keys))

        infra = FLOOR_PLAN["infrastructureMap"]
        self.assertEqual(infra["standardFloor"]["clearEnvelopeMeters"], [622.25, 707.11])
        self.assertEqual(infra["wallServiceCavityMeters"], 0.12)
        self.assertEqual(infra["lobby"]["bounds"][2:], [11_314, 16_971])
        self.assertEqual(infra["lobby"]["clearEnvelopeMeters"], [113, 170])
        self.assertEqual(infra["basements"]["clearEnvelopeMeters"], [283, 283])
        systems = infra["systems"]
        route_ids = {route["id"] for route in infra["standardFloor"]["wallRoutes"]}
        self.assertTrue(systems)
        for system in systems:
            self.assertTrue(set(system["wallRouteIds"]).issubset(route_ids))
            self.assertIsNotNone(self.scene.objects.get(system["source"]["objectId"]))
            self.assertIsNotNone(self.scene.objects.get(system["repairStation"]["objectId"]))
        standard_width, standard_height = infra["standardFloor"]["clearEnvelopeUnits"]
        for route in infra["standardFloor"]["wallRoutes"]:
            for x, y in route["points"]:
                self.assertGreaterEqual(x, 0)
                self.assertGreaterEqual(y, 0)
                self.assertLessEqual(x, standard_width)
                self.assertLessEqual(y, standard_height)
        lobby_x, lobby_y, lobby_w, lobby_h = infra["lobby"]["bounds"]
        for route in infra["lobby"]["wallRoutes"]:
            for x, y in route["points"]:
                self.assertTrue(lobby_x <= x <= lobby_x + lobby_w)
                self.assertTrue(lobby_y <= y <= lobby_y + lobby_h)
        basement_width, basement_height = infra["basements"]["clearEnvelopeUnits"]
        for route in infra["basements"]["wallRoutes"]:
            for x, y in route["points"]:
                self.assertTrue(0 <= x <= basement_width)
                self.assertTrue(0 <= y <= basement_height)
        for object_id in infra["lobby"]["branchAccessObjectIds"]:
            self.assertIsNotNone(self.scene.objects.get(object_id))

    def test_named_floors_are_open_and_floors_thirteen_through_sixty_seven_remain_under_construction(self):
        self.assertTrue(self.scene.select_floor(8))
        self.assertTrue(self.scene.select_floor(12))
        self.assertFalse(self.scene.select_floor(13))
        self.assertFalse(self.scene.select_floor(67))
        self.assertEqual(self.scene.floor_status(8), "open")
        self.assertEqual(self.scene.floor_status(12), "open")
        self.assertEqual(self.scene.floor_status(13), "under_construction")
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

    def test_godot_vehicle_dealership_purchase_uses_listed_stock_at_lobby_kiosk(self):
        dealership = self.scene.objects.get("lobby-kiosk-vehicle_dealership")
        self.assertIsNotNone(dealership)
        self.scene.player_position = dealership.position
        with patch(
            "pygame_sim.objects.business_hours_status",
            return_value=(True, "EVERY DAY 00:00–24:00"),
        ):
            self.assertTrue(self.scene.objects.interact(dealership.id, self.state, self.scene).success)
        self.state.business_stock_lines = [{
            "sellerBusinessKey": "vehicle_dealership",
            "items": [{"id": "veh_car"}],
        }]
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id, business_key: (
                requests.append((action, item_id, business_key)) or True
            ),
        )

        with patch(
            "pygame_sim.bridge.business_hours_status",
            return_value=(True, "EVERY DAY 00:00–24:00"),
        ):
            result = apply_command(
                {
                    "type": "command",
                    "version": PROTOCOL_VERSION,
                    "id": "godot-vehicle-purchase",
                    "name": "buy_business_item",
                    "payload": {
                        "business_key": "vehicle_dealership",
                        "item_id": "veh_car",
                    },
                },
                self.state,
                self.scene,
                building_sync,
            )

        self.assertTrue(result.ok)
        self.assertEqual(
            requests,
            [("buy_business", "veh_car", "vehicle_dealership")],
        )

    def test_restock_command_requires_the_active_shop_and_queues_one_item(self):
        shop = self.scene.objects.get("lobby-kiosk-vehicle_dealership")
        self.assertIsNotNone(shop)
        self.scene.player_position = shop.position
        self.state.open_page(
            "business_shop",
            from_object=True,
            source="VEHICLE DEALERSHIP",
            source_object_id=shop.id,
        )
        self.state.business_stock_lines = [{
            "sellerBusinessKey": "vehicle_dealership",
            "items": [{"id": "veh_car"}],
        }]
        requests = []
        building_sync = SimpleNamespace(
            queue_game_request=lambda action, item_id, business_key: (
                requests.append((action, item_id, business_key)) or True
            ),
        )
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "id": "godot-vehicle-restock",
                "name": "restock_business_item",
                "payload": {
                    "business_key": "vehicle_dealership",
                    "item_id": "veh_car",
                },
            },
            self.state,
            self.scene,
            building_sync,
        )

        self.assertTrue(result.ok, result.message)
        self.assertEqual(
            requests,
            [("shop_restock_item", "veh_car", "vehicle_dealership")],
        )

    def test_mila_menu_opens_only_the_selected_existing_service(self):
        self.scene.player_position = self.scene.objects.get("lobby-receptionist").position
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
        self.scene.player_position = self.scene.objects.get("lobby-receptionist").position
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
        command["payload"]["choice"] = 9
        result = apply_command(command, self.state, self.scene)
        self.assertTrue(result.ok)
        self.assertIsNone(self.state.active_page)
        self.assertFalse(apply_command(command, self.state, self.scene).ok)

    def test_systems_terminal_choice_8_opens_browser_meeting_launcher(self):
        self.state.open_page(
            "systems",
            from_object=True,
            source="SYSTEMS TERMINAL",
            source_object_id="floor-06-crt",
        )
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "terminal-meeting",
            "name": "terminal_choice",
            "payload": {"choice": 8},
        }
        building_sync = SimpleNamespace(
            link=SimpleNamespace(server_url="https://salaryman.example/")
        )
        with patch("pygame_sim.bridge.webbrowser.open", return_value=True) as open_browser:
            result = apply_command(command, self.state, self.scene, building_sync)
        self.assertTrue(result.ok)
        open_browser.assert_called_once_with("https://salaryman.example/meet/new")
        self.assertIsNone(self.state.active_page)

    def test_video_meeting_table_opens_browser_meeting_launcher(self):
        table = self.scene.objects.get("floor-06-meeting-table")
        self.assertIsNotNone(table)
        self.scene.current_floor = 6
        self.scene.current_room = "office_03"
        self.scene.player_position = table.position
        command = {
            "type": "command",
            "version": PROTOCOL_VERSION,
            "id": "table-meeting",
            "name": "interact",
            "payload": {"object_id": table.id},
        }
        building_sync = SimpleNamespace(
            link=SimpleNamespace(server_url="https://salaryman.example")
        )
        with patch("pygame_sim.bridge.webbrowser.open", return_value=True) as open_browser:
            result = apply_command(command, self.state, self.scene, building_sync)
        self.assertTrue(result.ok)
        open_browser.assert_called_once_with("https://salaryman.example/meet/new")

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