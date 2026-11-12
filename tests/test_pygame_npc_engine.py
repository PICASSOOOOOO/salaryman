import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

from pygame_sim.bridge import PROTOCOL_VERSION, apply_command, build_snapshot
from pygame_sim.npc_engine import RivalryEngine
from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState


class CoworkerRivalryTests(unittest.TestCase):
    def test_new_game_has_five_unique_coworkers_across_three_factions(self):
        roster = RivalryEngine.new_game(seed=42)

        self.assertEqual(len(roster.departments), 3)
        self.assertEqual(len(roster.coworkers), 5)
        self.assertEqual(len({npc.name for npc in roster.coworkers}), 5)
        self.assertTrue(all(npc.department_id in roster.departments for npc in roster.coworkers))

    def test_game_interaction_updates_grudge_and_department_morale(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.current_room = "office_03"
        coworker = state.rivalry.coworkers[0]
        target = scene.objects.get(coworker.id)
        self.assertIsNotNone(target)
        scene.player_position = target.position

        opened = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "name": "interact",
                "payload": {"object_id": coworker.id},
            },
            state,
            scene,
        )
        self.assertTrue(opened.ok)
        self.assertEqual(state.active_page, "competition")

        faction = state.rivalry.departments[coworker.department_id]
        starting_morale = faction.department_morale
        result = apply_command(
            {
                "type": "command",
                "version": PROTOCOL_VERSION,
                "name": "competition_choice",
                "payload": {"choice": 4},
            },
            state,
            scene,
        )
        self.assertTrue(result.ok)
        self.assertGreater(coworker.grudge_score, 0)
        self.assertLess(faction.department_morale, starting_morale)
        self.assertEqual(coworker.memory_vault[-1]["action"], "sabotage")

        snapshot = build_snapshot(state, scene, sequence=1)
        self.assertEqual(len(snapshot["office"]["npcCoworkers"]), 5)

    def test_coworker_rivalry_persists_in_local_save(self):
        state = OfficeState.with_default_roster()
        coworker = state.rivalry.coworkers[0]
        coworker.log_interaction(
            "rumor",
            8,
            state.rivalry.departments[coworker.department_id],
        )

        with TemporaryDirectory() as temp_dir:
            save_path = Path(temp_dir) / "office.json"
            state.save_to_file(save_path)
            restored = OfficeState.load_from_file(save_path)

        self.assertEqual(
            restored.rivalry.coworker(coworker.id).grudge_score,
            coworker.grudge_score,
        )
        self.assertEqual(restored.rivalry.coworker(coworker.id).trait_name, coworker.trait_name)

    def test_r1_fight_logs_a_nonlethal_game_interaction(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        scene.current_room = "office_03"
        coworker = state.rivalry.coworkers[0]
        target = scene.objects.get(coworker.id)
        scene.player_position = target.position
        faction = state.rivalry.departments[coworker.department_id]
        starting_morale = faction.department_morale

        with patch("pygame_sim.bridge.random.random", return_value=1.0):
            result = apply_command(
                {
                    "type": "command",
                    "version": PROTOCOL_VERSION,
                    "name": "coworker_fight",
                    "payload": {},
                },
                state,
                scene,
            )

        self.assertTrue(result.ok)
        self.assertEqual(coworker.memory_vault[-1]["action"], "fight")
        self.assertIn("FIGHT", result.message)
        self.assertLess(faction.department_morale, starting_morale)

    def test_fatality_is_rarely_resolved_from_game_inventory_and_removes_npc(self):
        state = OfficeState.with_default_roster()
        state.game_inventory = [{"itemId": "wpn_bat", "quantity": 1}]
        scene = build_tower_scene()
        scene.current_room = "office_03"
        coworker = state.rivalry.coworkers[0]
        target = scene.objects.get(coworker.id)
        scene.player_position = target.position

        with patch("pygame_sim.bridge.random.random", return_value=0.0):
            result = apply_command(
                {
                    "type": "command",
                    "version": PROTOCOL_VERSION,
                    "name": "coworker_fight",
                    "payload": {},
                },
                state,
                scene,
            )

        self.assertTrue(result.ok)
        self.assertFalse(coworker.alive)
        self.assertEqual(coworker.state, "Deceased")
        object_ids = {item["id"] for item in build_snapshot(state, scene, 2)["scene"]["objects"]}
        self.assertNotIn(coworker.id, object_ids)


if __name__ == "__main__":
    unittest.main()
