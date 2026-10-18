import unittest
from typing import get_args

from pygame_sim.object_physics import (
    MATERIAL_PROFILES,
    OBJECT_MATERIALS,
    interaction_profile_for,
)
from pygame_sim.objects import ObjectKind


class ObjectPhysicsProfileTests(unittest.TestCase):
    def test_every_world_object_kind_has_a_valid_material_profile(self):
        self.assertEqual(set(get_args(ObjectKind)), set(OBJECT_MATERIALS))
        self.assertEqual(set(OBJECT_MATERIALS.values()), set(MATERIAL_PROFILES))
        for kind in get_args(ObjectKind):
            profile = interaction_profile_for(kind)
            material = MATERIAL_PROFILES[profile.material]
            for response in (
                material.impact_resistance,
                material.flammability,
                material.burn_rate,
                material.electrical_conductivity,
            ):
                self.assertGreaterEqual(response, 0)
                self.assertLessEqual(response, 1)

    def test_materials_have_distinct_damage_fire_and_conductivity_responses(self):
        self.assertGreater(MATERIAL_PROFILES["wood"].flammability, MATERIAL_PROFILES["steel"].flammability)
        self.assertGreater(MATERIAL_PROFILES["steel"].impact_resistance, MATERIAL_PROFILES["cloth"].impact_resistance)
        self.assertGreater(
            MATERIAL_PROFILES["copper"].electrical_conductivity,
            MATERIAL_PROFILES["brass"].electrical_conductivity,
        )
        self.assertEqual(MATERIAL_PROFILES["concrete"].flammability, 0)
        self.assertEqual(MATERIAL_PROFILES["marble"].flammability, 0)

    def test_vehicles_have_explicit_fuel_capacity_and_fire_capability(self):
        truck = interaction_profile_for("delivery_truck")
        forklift = interaction_profile_for("forklift")
        self.assertEqual(truck.fuel_capacity_liters, 120)
        self.assertEqual(forklift.fuel_capacity_liters, 25)
        self.assertTrue(truck.burnable)
        self.assertTrue(forklift.burnable)

    def test_anchored_world_objects_keep_role_specific_transform_rules(self):
        self.assertFalse(interaction_profile_for("elevator").movable)
        self.assertTrue(interaction_profile_for("door").rotatable)
        self.assertTrue(interaction_profile_for("chair").movable)
        self.assertTrue(interaction_profile_for("chair").sittable)
        self.assertTrue(interaction_profile_for("desk").standable)
        self.assertFalse(interaction_profile_for("receptionist").destructible)


if __name__ == "__main__":
    unittest.main()
