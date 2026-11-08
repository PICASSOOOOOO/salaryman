import json
import time
import unittest

from pygame_sim.automation import DesktopLink
from pygame_sim.building_sync import DesktopBuildingSync
from pygame_sim.scene import build_tower_scene


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, _exception_type, _exception, _traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class BuildingSyncTests(unittest.TestCase):
    def test_construction_markers_show_status_and_block_unpowered_site_work(self):
        scene = build_tower_scene()
        scene.set_construction_plans([{
            "id": 7,
            "floorNumber": 2,
            "powered": False,
            "tasks": [
                {
                    "id": "power", "kind": "power_export", "x": 10_000, "y": 9_000,
                    "label": "EXPORT POWER",
                },
                {
                    "id": "frame", "kind": "building", "x": 12_000, "y": 10_000,
                    "label": "RAISE FRAME",
                },
                {
                    "id": "active", "kind": "building", "x": 14_000, "y": 11_000,
                    "label": "ROUTE CONDUIT", "working": True, "workingByYou": True,
                },
                {
                    "id": "other", "kind": "building", "x": 16_000, "y": 12_000,
                    "label": "FINISH SHELL", "working": True,
                },
                {
                    "id": "done", "kind": "building", "x": 18_000, "y": 13_000,
                    "label": "COMPLETE SHELL", "completed": True,
                },
            ],
        }])

        markers = {
            item.construction_task_id: item
            for item in scene.objects.objects
            if item.kind == "construction_task"
        }
        self.assertEqual(markers["power"].construction_status, "ready")
        self.assertTrue(markers["power"].interactive)
        self.assertEqual(markers["frame"].construction_status, "power_required")
        self.assertFalse(markers["frame"].interactive)
        self.assertIn("EXPORT POWER FROM B5", markers["frame"].prompt)
        self.assertEqual(markers["active"].construction_status, "working_you")
        self.assertFalse(markers["active"].interactive)
        self.assertIn("YOUR WORK IS IN PROGRESS", markers["active"].prompt)
        self.assertEqual(markers["other"].construction_status, "working")
        self.assertIn("ANOTHER WORKER", markers["other"].prompt)
        self.assertEqual(markers["done"].construction_status, "complete")
        self.assertIn("COMPLETE", markers["done"].prompt)

    def test_linked_game_requests_are_allowlisted_and_vending_uses_primary_slot(self):
        requests = []

        def opener(request, timeout):
            del timeout
            path = request.full_url.rsplit("/api", 1)[-1]
            body = json.loads(request.data.decode("utf-8")) if request.data else None
            requests.append((request.get_method(), path, body))
            if path == "/desktop-game/bank":
                return FakeResponse({"currency": "FIAT", "balance": 1250, "spendable": 1200})
            return FakeResponse({"owned": True, "fiat": 50, "newBalance": 1200})

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        self.assertTrue(sync.queue_game_request("bank"))
        self.assertFalse(sync.queue_game_request("arbitrary_path"))
        sync._sync_once()
        event = sync.drain_events()[0]
        self.assertTrue(event.ok)
        self.assertEqual(event.source, "game_service")
        self.assertEqual(event.data["action"], "bank")

        self.assertTrue(sync.queue_game_request("buy_vending", "water_bottle"))
        sync._sync_once()
        self.assertEqual(
            requests[1],
            (
                "POST",
                "/items/buy",
                {"slot": 0, "itemId": "water_bottle", "qty": 1, "source": "tower_vending"},
            ),
        )

    def test_b3_fire_response_uses_the_allowlisted_server_route(self):
        requests = []

        def opener(request, timeout):
            del timeout
            body = json.loads(request.data.decode("utf-8")) if request.data else None
            requests.append((request.get_method(), request.full_url.rsplit("/api", 1)[-1], body))
            return FakeResponse({"ok": True, "status": "resolved"})

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        alarm_id = "12345678-1234-1234-1234-123456789abc"
        self.assertFalse(sync.queue_game_request("alarm_response", "../alarms"))
        self.assertTrue(sync.queue_game_request("alarm_response", alarm_id))
        sync._sync_once()

        event = sync.drain_events()[0]
        self.assertTrue(event.ok)
        self.assertEqual(
            requests,
            [("POST", "/desktop-building/alarms/respond", {"alarmId": alarm_id})],
        )

    def test_shelf_stock_request_is_authenticated_read_only_and_rejects_invalid_keys(self):
        requests = []

        def opener(request, timeout):
            del timeout
            requests.append((request.get_method(), request.full_url.rsplit("/api", 1)[-1], request.data))
            return FakeResponse({
                "businessKey": "fish-store",
                "items": [{
                    "itemId": "fish_goldfish",
                    "name": "Goldfish",
                    "itemType": "pet",
                    "shelfQuantity": 2,
                }],
            })

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        self.assertFalse(sync.queue_game_request("shop_shelf_stock", business_key="../items"))
        self.assertTrue(sync.queue_game_request("shop_shelf_stock", business_key="fish-store"))
        sync._sync_once()
        event = sync.drain_events()[0]

        self.assertEqual(requests, [("GET", "/items/tower-business/fish-store/shelf-stock", None)])
        self.assertTrue(event.ok)
        self.assertEqual(event.data["payload"]["businessKey"], "fish-store")

    def test_shop_floor_stock_loads_on_arrival_and_refreshes_at_a_bounded_interval(self):
        requests = []

        def opener(request, timeout):
            del timeout
            requests.append((request.get_method(), request.full_url.rsplit("/api", 1)[-1]))
            return FakeResponse({"floorNumber": 2, "shops": [{"businessKey": "fish-store", "items": []}]})

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        scene = build_tower_scene()
        self.assertTrue(scene.select_floor(2))
        sync.update_scene(scene)
        sync._sync_once()
        first_event = sync.drain_events()[0]
        self.assertTrue(first_event.ok)
        self.assertEqual(first_event.data["action"], "shop_floor_shelf_stock:2")
        self.assertEqual(
            requests,
            [("GET", "/items/tower-business/floor/2/shelf-stock")],
        )
        sync.update_scene(scene)
        self.assertTrue(sync._game_requests.empty())
        sync._last_shop_shelf_poll = time.monotonic() - 16.0
        sync.update_scene(scene)
        sync._sync_once()
        self.assertEqual(len(requests), 2)
        self.assertFalse(sync.queue_game_request("shop_floor_shelf_stock:7"))

    def test_shop_restock_uses_the_server_checked_restocks_endpoint(self):
        requests = []

        def opener(request, timeout):
            del timeout
            requests.append((
                request.get_method(),
                request.full_url.rsplit("/api", 1)[-1],
                request.data,
            ))
            return FakeResponse({"ok": True, "stock": {"storedQuantity": 2, "shelfQuantity": 3}})

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        self.assertFalse(sync.queue_game_request("shop_restock_item", "../fish", "fish-store"))
        self.assertTrue(sync.queue_game_request("shop_restock_item", "fish_goldfish", "fish-store"))
        sync._sync_once()
        event = sync.drain_events()[0]

        self.assertEqual(requests, [(
            "POST",
            "/items/tower-business/restock",
            b'{"businessKey": "fish-store", "itemId": "fish_goldfish", "quantity": 1}',
        )])
        self.assertTrue(event.ok)
        self.assertEqual(event.data["action"], "shop_restock_item")

    def test_restroom_trash_and_supply_interactions_use_only_the_expected_server_routes(self):
        requests = []

        def opener(request, timeout):
            del timeout
            path = request.full_url.rsplit("/api", 1)[-1]
            body = json.loads(request.data.decode("utf-8")) if request.data else None
            requests.append((request.get_method(), path, body))
            if path == "/desktop-building/restroom/start":
                return FakeResponse({"ok": True, "sessionId": "restroom-session"})
            return FakeResponse({"ok": True})

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        self.assertTrue(sync.queue_game_request("restroom", "lobby-restroom-stall-1"))
        sync._sync_once()
        self.assertTrue(sync.drain_events()[0].ok)
        self.assertTrue(sync.queue_game_request("restroom", "lobby-restroom-stall-1"))
        sync._sync_once()
        self.assertTrue(sync.drain_events()[0].ok)
        self.assertTrue(sync.queue_game_request("waste_pickup", "recreation-trash-can"))
        sync._sync_once()
        self.assertTrue(sync.drain_events()[0].ok)
        self.assertTrue(sync.queue_game_request("waste_deliver"))
        sync._sync_once()
        self.assertTrue(sync.drain_events()[0].ok)
        self.assertTrue(sync.queue_game_request("supply_receive"))
        sync._sync_once()
        self.assertTrue(sync.drain_events()[0].ok)
        self.assertTrue(sync.queue_game_request("supply_issue"))
        sync._sync_once()
        self.assertTrue(sync.drain_events()[0].ok)
        self.assertTrue(sync.queue_game_request("consume_supply", "tower_clinic_triage_kit"))
        sync._sync_once()
        self.assertTrue(sync.drain_events()[0].ok)
        for item_id in ("tower_food_supply_crate", "tower_water_ration"):
            self.assertTrue(sync.queue_game_request("consume_supply", item_id))
            sync._sync_once()
            self.assertTrue(sync.drain_events()[0].ok)
        for item_id in (
            "tower_admin_pass",
            "tower_construction_starter_kit",
            "tower_priority_manifest",
            "tower_waste_sorting_kit",
            "tower_materials_bundle",
        ):
            self.assertTrue(sync.queue_game_request("consume_supply", item_id))
            sync._sync_once()
            self.assertTrue(sync.drain_events()[0].ok)

        self.assertEqual(
            requests,
            [
                ("POST", "/desktop-building/restroom/start", {"stallKey": "lobby-restroom-stall-1"}),
                ("POST", "/desktop-building/restroom/complete", {
                    "stallKey": "lobby-restroom-stall-1",
                    "sessionId": "restroom-session",
                }),
                ("POST", "/desktop-building/waste/pickup", {"binId": "recreation-trash-can"}),
                ("POST", "/desktop-building/waste/deliver", {}),
                ("POST", "/desktop-building/supplies/receive", {}),
                ("POST", "/desktop-building/supplies/issue", {}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_clinic_triage_kit", "qty": 1}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_food_supply_crate", "qty": 1}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_water_ration", "qty": 1}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_admin_pass", "qty": 1}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_construction_starter_kit", "qty": 1}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_priority_manifest", "qty": 1}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_waste_sorting_kit", "qty": 1}),
                ("POST", "/items/consume", {"slot": 0, "itemId": "tower_materials_bundle", "qty": 1}),
            ],
        )

    def test_shop_freight_uses_the_persisted_dock_pickup_and_delivery_routes(self):
        requests = []

        def opener(request, timeout):
            del timeout
            path = request.full_url.rsplit("/api", 1)[-1]
            requests.append((request.get_method(), path))
            return FakeResponse({"ok": True})

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        for action, shipment_id in (
            ("shop_freight_snapshot", None),
            ("shop_freight_pickup", "12345678-1234-1234-1234-123456789abc"),
            ("shop_freight_receive", "12345678-1234-1234-1234-123456789abc"),
        ):
            self.assertTrue(sync.queue_game_request(action, shipment_id))
            sync._sync_once()
            self.assertTrue(sync.drain_events()[0].ok)

        self.assertEqual(
            requests,
            [
                ("GET", "/items/tower-business/shipments/dock"),
                ("POST", "/items/tower-business/shipments/12345678-1234-1234-1234-123456789abc/pickup"),
                ("POST", "/items/tower-business/shipments/12345678-1234-1234-1234-123456789abc/receive"),
            ],
        )

    def test_floor_state_is_scoped_and_queued_maintenance_cannot_follow_player(self):
        requests = []

        def opener(request, timeout):
            del timeout
            path = request.full_url.rsplit("/api", 1)[-1]
            requests.append((request.get_method(), path))
            if path == "/desktop-building/presence":
                return FakeResponse({"ok": True})
            if path == "/desktop-building/objects":
                return FakeResponse({
                    "objects": [{
                        "floorNumber": 4,
                        "objectId": "hall-office-2-door",
                        "cleanliness": 80,
                        "condition": 85,
                    }],
                })
            if path == "/desktop-building/construction":
                return FakeResponse({"plans": []})
            return FakeResponse({
                "ok": True,
                "message": "Object cleaned",
                "state": {
                    "floorNumber": 4,
                    "objectId": "hall-office-2-door",
                    "cleanliness": 100,
                    "condition": 85,
                },
            })

        sync = DesktopBuildingSync(
            DesktopLink("https://salaryman.test", "desktop-test-123", "credential"),
            opener=opener,
        )
        scene = build_tower_scene()
        scene.current_floor = 3
        sync._last_shop_shelf_poll_floor = 3
        sync._last_shop_shelf_poll = time.monotonic()
        sync.update_scene(scene)
        self.assertTrue(sync.queue_action("hall-office-2-door", "clean"))

        scene.current_floor = 4
        sync._last_shop_shelf_poll_floor = 4
        sync._last_shop_shelf_poll = time.monotonic()
        sync.update_scene(scene)
        sync._sync_once()

        self.assertEqual(requests, [
            ("GET", "/desktop-building/construction"),
            ("POST", "/desktop-building/presence"),
            ("GET", "/desktop-building/objects"),
        ])
        self.assertEqual(
            sync.object_states()["4:hall-office-2-door"]["cleanliness"],
            80,
        )
        events = sync.drain_events()
        self.assertEqual(len(events), 1)
        self.assertFalse(events[0].ok)
        self.assertEqual(events[0].message, "PLAYER CHANGED FLOORS / ACTION CANCELLED")


if __name__ == "__main__":
    unittest.main()
