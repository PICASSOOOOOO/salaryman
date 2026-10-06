import json
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
        sync.update_scene(scene)
        self.assertTrue(sync.queue_action("hall-office-2-door", "clean"))

        scene.current_floor = 4
        sync.update_scene(scene)
        sync._sync_once()

        self.assertEqual(requests, [
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
