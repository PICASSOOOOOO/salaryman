import json
import unittest
from types import SimpleNamespace

from pygame_sim.building_sync import DesktopBuildingSync
from pygame_sim.objects import FLOOR_PLAN
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

    def test_floors_two_through_twelve_are_open_and_upper_floors_are_closed(self):
        scene = TowerScene()
        self.assertTrue(scene.is_playable_floor(1))
        self.assertTrue(scene.is_playable_floor(6))
        for floor in (2, 3, 4, 5):
            self.assertTrue(scene.is_playable_floor(floor), floor)
            self.assertEqual(scene.floor_status(floor), "construction_open")
        for floor in range(6, 13):
            self.assertTrue(scene.is_playable_floor(floor), floor)
            self.assertEqual(scene.floor_status(floor), "open")
        for floor in (0, 13, 67):
            self.assertFalse(scene.is_playable_floor(floor), floor)
        self.assertEqual(scene.floor_status(13), "under_construction")

    def test_new_floors_have_the_agreed_suite_counts_and_floor_ten_uses_four_large_units(self):
        scene = TowerScene()
        expected_counts = {8: 8, 9: 8, 10: 4, 11: 8, 12: 8}
        for floor, expected_count in expected_counts.items():
            room = FLOOR_PLAN["playableFloors"][str(floor)]["room"]
            suites = [
                obj for obj in scene.objects.objects
                if obj.kind == "business_suite" and obj.room == room
            ]
            self.assertEqual(len(suites), expected_count, floor)
        floor_ten = [
            obj for obj in scene.objects.objects
            if obj.kind == "business_suite" and obj.room == "floor10_business"
        ]
        self.assertEqual(
            {tuple(obj.suite_bounds) for obj in floor_ten},
            {
                (0, 0, 9000, 11000),
                (13000, 0, 9000, 11000),
                (0, 14000, 9000, 11000),
                (13000, 14000, 9000, 11000),
            },
        )

    def test_every_floor_template_and_basement_has_one_shared_hallway_fixture_set(self):
        scene = TowerScene()
        fixture_kinds = {"pay_phone", "trash_can", "atm", "vending_machine", "fire_extinguisher"}
        floor_seven_vending = scene.objects.get("floor-07-shared-vending")
        self.assertIsNotNone(floor_seven_vending)
        self.assertFalse(floor_seven_vending.interactive)
        self.assertEqual(floor_seven_vending.prompt, "")
        rooms = {
            str(data["room"])
            for data in FLOOR_PLAN["playableFloors"].values()
        } | {f"basement_b{level}" for level in range(1, 7)}
        for room in rooms:
            with self.subTest(room=room):
                fixtures = [
                    obj for obj in scene.objects.objects
                    if obj.room == room and obj.kind in fixture_kinds
                ]
                for kind in fixture_kinds:
                    matching = [obj for obj in fixtures if obj.kind == kind]
                    if room == "basement_b1" and kind == "trash_can":
                        matching = [
                            obj for obj in matching
                            if obj.id == "basement-b1-hallway-trash_can"
                        ]
                    self.assertEqual(len(matching), 1, (room, kind))
                self.assertTrue(all(obj.kind != "fire_extinguisher" or not obj.interactive for obj in fixtures))
                for obj in fixtures:
                    if obj.kind == "vending_machine" and "hallway-vending_machine" in obj.id:
                        self.assertFalse(obj.interactive)
                        self.assertEqual(obj.prompt, "")
                if room in {"basement_b4", "basement_b5", "basement_b6"}:
                    scene.current_room = room
                    scene.basement_level = int(room[-1])
                    hallway_prefix = room.replace("_", "-") + "-hallway-"
                    for fixture in fixtures:
                        if hallway_prefix in fixture.id:
                            self.assertTrue(
                                scene._room_position_is_walkable(fixture.position),
                                fixture.id,
                            )

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
        for expected_floor in range(2, 13):
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
