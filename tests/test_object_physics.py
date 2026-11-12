import unittest
from typing import get_args

from pygame_sim.bridge import PROTOCOL_VERSION, validate_command
from pygame_sim.object_physics import (
    MATERIAL_PROFILES,
    OBJECT_MATERIALS,
    interaction_profile_for,
)
from pygame_sim.objects import ObjectKind, OfficeObject
from pygame_sim.scene import TowerScene


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


class SharedObjectPhysicsTests(unittest.TestCase):
    def test_bridge_accepts_supported_physics_actions_only(self):
        for action in ("move", "rotate", "damage", "ignite", "extinguish"):
            valid, _ = validate_command({
                "type": "command",
                "version": PROTOCOL_VERSION,
                "name": "object_physics",
                "payload": {"action": action},
            })
            self.assertTrue(valid, action)

        valid, reason = validate_command({
            "type": "command",
            "version": PROTOCOL_VERSION,
            "name": "object_physics",
            "payload": {"action": "teleport"},
        })
        self.assertFalse(valid)
        self.assertEqual(reason, "OBJECT PHYSICS ACTION NOT ALLOWED")

    def test_server_object_state_restores_scene_position_and_fire_state(self):
        scene = TowerScene()
        item = OfficeObject(
            id="test-desk",
            kind="desk",
            label="Test desk",
            room=scene.current_room,
            position=(1_000, 1_000),
            prompt="",
        )
        scene.objects.objects.append(item)
        state_key = f"{scene.current_floor}:test-desk"
        scene.set_building_object_states({
            state_key: {
                "cleanliness": 80,
                "condition": 85,
                "physicsX": 1_250,
                "physicsY": 1_500,
                "rotationDegrees": 90,
                "damage": 40,
                "burning": True,
            },
        })

        restored = scene.objects.objects[-1]
        self.assertEqual(restored.position, (1_250, 1_500))
        self.assertEqual(restored.visual_position, (1_250, 1_500))
        self.assertEqual(scene.building_object_states[state_key]["damage"], 40)
        self.assertTrue(scene.building_object_states[state_key]["burning"])


if __name__ == "__main__":
    unittest.main()
