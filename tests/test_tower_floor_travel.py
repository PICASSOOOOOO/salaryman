import json
import unittest
from types import SimpleNamespace

from pygame_sim.building_sync import DesktopBuildingSync
from pygame_sim.scene import TowerScene


class _Response:
    def __init__(self, value: dict):
        self._body = json.dumps(value).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self._body


class _FakeOpener:
    def __init__(self):
        self.requests: list[tuple[str, str, dict]] = []

    def __call__(self, request, timeout=0):
        method = request.get_method()
        body = json.loads(request.data) if request.data else {}
        self.requests.append((method, request.full_url, body))
        if method == "GET" and request.full_url.endswith("/desktop-building/construction"):
            return _Response({"plans": []})
        return _Response({"objects": []} if method == "GET" else {})


class TowerFloorTravelTests(unittest.TestCase):
    def test_open_areas_have_solid_interactive_trash_cans(self):
        scene = TowerScene()
        for object_id, expected_room, floor in (
            ("lobby-trash-can", "lobby", 1),
            ("recreation-trash-can", "recreation", 6),
        ):
            trash_can = scene.objects.get(object_id)
            self.assertIsNotNone(trash_can)
            self.assertEqual(trash_can.kind, "trash_can")
            self.assertEqual(trash_can.room, expected_room)
            self.assertTrue(trash_can.interactive)
            self.assertTrue(all(extent > 0 for extent in trash_can.collision_half_extents))

            if floor == 6:
                self.assertTrue(scene.select_floor(6))
            self.assertTrue(scene._collides_with_object(trash_can.position))

    def test_construction_floors_and_floor_six_are_open_but_upper_floors_are_closed(self):
        scene = TowerScene()
        self.assertTrue(scene.is_playable_floor(1))
        self.assertTrue(scene.is_playable_floor(6))
        for floor in (2, 3, 4, 5):
            self.assertTrue(scene.is_playable_floor(floor), floor)
            self.assertEqual(scene.floor_status(floor), "construction_open")
        for floor in (0, 7, 67):
            self.assertFalse(scene.is_playable_floor(floor), floor)
        self.assertEqual(scene.floor_status(7), "under_construction")

    def test_restrooms_waste_stations_and_daily_utility_stations_exist_in_their_physical_floors(self):
        scene = TowerScene()
        expected = {
            "lobby-restroom-stall-1": ("restroom_stall", "lobby"),
            "recreation-restroom-stall-1": ("restroom_stall", "recreation"),
            "basement-b1-shipping-waste": ("shipping_station", "basement_b1"),
            "basement-b1-loading-gate": ("loading_gate", "basement_b1"),
            "basement-b5-power": ("utility_station", "basement_b5"),
            "basement-b6-plumbing": ("utility_station", "basement_b6"),
        }
        for object_id, (kind, room) in expected.items():
            obj = scene.objects.get(object_id)
            self.assertIsNotNone(obj, object_id)
            self.assertEqual(obj.kind, kind)
            self.assertEqual(obj.room, room)
            self.assertTrue(all(extent > 0 for extent in obj.collision_half_extents))

    def test_elevator_round_trip_and_stairs_connect_only_open_adjacent_floors(self):
        scene = TowerScene()
        lobby_spawn = tuple(scene.player_position)
        self.assertTrue(scene.select_floor(6))
        self.assertEqual(scene.current_floor, 6)
        self.assertEqual(tuple(scene.player_position), (11_000, 1_500))
        self.assertTrue(scene.select_floor(1))
        self.assertEqual(scene.current_floor, 1)
        self.assertEqual(tuple(scene.player_position), lobby_spawn)
        for expected_floor in range(2, 7):
            self.assertTrue(scene.climb_stairs())
            self.assertEqual(scene.current_floor, expected_floor)
        self.assertFalse(scene.climb_stairs())

    def test_linked_elevator_waits_for_server_approval_before_each_floor_change(self):
        scene = TowerScene()
        fake_opener = _FakeOpener()
        link = SimpleNamespace(
            server_url="https://salaryman.test",
            credential="test-token",
            device_id="test-device",
        )
        sync = DesktopBuildingSync(link, opener=fake_opener)
        sync.update_scene(scene)
        sync._sync_once()
        lobby_elevator = next(
            obj for obj in scene.objects.objects
            if obj.kind == "elevator" and obj.room == "lobby"
        )
        scene.player_position = lobby_elevator.position
        sync.update_scene(scene)
        sync._sync_once()

        self.assertTrue(sync.queue_elevator(6, scene))
        self.assertEqual(scene.current_floor, 1)
        sync._sync_once()
        approval = sync.drain_events()
        self.assertEqual(len(approval), 1)
        self.assertTrue(approval[0].ok)
        self.assertEqual(approval[0].destination_floor, 6)
        self.assertEqual(scene.current_floor, 1)

        self.assertTrue(scene.select_floor(approval[0].destination_floor))
        sync.update_scene(scene)
        self.assertEqual(tuple(scene.player_position), (11_000, 1_500))
        sync._sync_once()

        self.assertTrue(sync.queue_elevator(1, scene))
        self.assertEqual(scene.current_floor, 6)
        sync._sync_once()
        approval = sync.drain_events()
        self.assertEqual(len(approval), 1)
        self.assertTrue(approval[0].ok)
        self.assertEqual(approval[0].destination_floor, 1)
        self.assertEqual(scene.current_floor, 6)

        self.assertTrue(scene.select_floor(approval[0].destination_floor))
        sync.update_scene(scene)
        self.assertEqual(scene.current_floor, 1)
        presence_requests = [
            body
            for method, url, body in fake_opener.requests
            if method == "POST" and url.endswith("/desktop-building/presence")
        ]
        elevator_requests = [body for body in presence_requests if body.get("room") == "elevator"]
        self.assertEqual([request["destinationFloor"] for request in elevator_requests], [6, 1])
        sync.close()


if __name__ == "__main__":
    unittest.main()
