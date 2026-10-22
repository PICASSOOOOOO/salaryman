from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo
import unittest
from unittest.mock import patch

from pygame_sim.business_services import business_hours_profile, business_hours_status
from pygame_sim.objects import build_tower_object_registry
from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState
from pygame_sim.world_layout import FLOOR_PLAN


MINX = ZoneInfo("America/Los_Angeles")


class TowerBusinessAccessTests(unittest.TestCase):
    def test_every_listed_b1_to_floor6_business_has_a_door_counter_and_waiting_area(self) -> None:
        registry = build_tower_object_registry()
        expected: list[tuple[str, int, str]] = []
        b1 = FLOOR_PLAN["floorProgram"]["pabloCorpBusinessArea"]["b1Businesses"]
        expected.extend(("b1", 1, str(item["businessKey"])) for item in b1)
        for floor_number in range(2, 6):
            floor = FLOOR_PLAN["playableFloors"][str(floor_number)]
            expected.extend(
                (f"floor-{floor_number:02d}", floor_number, str(item["businessKey"]))
                for item in floor["businesses"]
            )
        floor_six = FLOOR_PLAN["playableFloors"]["6"]
        expected.extend(("floor-06", 6, str(item["businessKey"])) for item in floor_six["businesses"])

        for tag, floor, business_key in expected:
            suite = next(
                item for item in registry.objects
                if item.id.startswith(f"{tag}-business-")
                and item.kind == "business_suite"
                and item.business_key == business_key
            )
            door = registry.get(f"{tag}-business-{suite.unit_number:02d}-door")
            counter = registry.get(f"{tag}-business-{suite.unit_number:02d}-counter")
            seats = [
                item for item in registry.objects
                if item.id.startswith(f"{tag}-business-{suite.unit_number:02d}-waiting-")
            ]
            self.assertIsNotNone(door, f"{business_key} on floor {floor} needs a door")
            self.assertEqual(door.business_key, business_key)  # type: ignore[union-attr]
            if floor <= 5:
                self.assertIsNotNone(counter, f"{business_key} on floor {floor} needs a service counter")
                self.assertEqual(len(seats), 2, f"{business_key} on floor {floor} needs lobby seats")

    def test_closed_business_door_rejects_entry(self) -> None:
        scene = build_tower_scene()
        state = OfficeState.with_default_roster()
        door = scene.objects.get("floor-02-business-01-door")
        self.assertIsNotNone(door)

        with patch(
            "pygame_sim.objects.business_hours_status",
            return_value=(False, "MON–SAT 06:00–22:00"),
        ):
            result = scene.objects.interact(door.id, state, scene)

        self.assertFalse(result.success)
        self.assertIn("LOCKED", result.message)

    def test_business_hour_profiles_cover_24_7_24_6_food_and_night_service(self) -> None:
        sunday_01 = datetime(2026, 10, 25, 1, 0, tzinfo=MINX)
        saturday_noon = datetime(2026, 10, 24, 12, 0, tzinfo=MINX)
        sunday_noon = datetime(2026, 10, 25, 12, 0, tzinfo=MINX)
        monday_02 = datetime(2026, 10, 26, 2, 0, tzinfo=MINX)

        self.assertEqual(business_hours_profile("tower_pharmacy"), "always")
        self.assertTrue(business_hours_status("tower_pharmacy", sunday_01)[0])
        self.assertEqual(business_hours_profile("tower_shipping"), "all_day_six")
        self.assertTrue(business_hours_status("tower_shipping", saturday_noon)[0])
        self.assertFalse(business_hours_status("tower_shipping", sunday_noon)[0])
        self.assertTrue(business_hours_status("shadow_cafeteria", sunday_noon)[0])
        self.assertTrue(business_hours_status("liquor_store", monday_02)[0])
        self.assertFalse(business_hours_status("banco_ombra", saturday_noon)[0])


if __name__ == "__main__":
    unittest.main()
