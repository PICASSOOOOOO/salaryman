from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from pygame_sim.bridge import PROTOCOL_VERSION, apply_command, build_snapshot
from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState
from pygame_sim.tower_story import (
    OPEN_MIC_STORY_COMPLETE_STAGE,
    normalize_open_mic_story_stage,
    open_mic_story_objective,
)


def command(name: str, payload: dict[str, object] | None = None) -> dict[str, object]:
    return {
        "type": "command",
        "version": PROTOCOL_VERSION,
        "name": name,
        "payload": payload or {},
    }


class OpenMicStoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.state = OfficeState.with_default_roster()
        self.scene = build_tower_scene()

    def interact_at(self, object_id: str, payload: dict[str, object] | None = None):
        target = self.scene.objects.get(object_id)
        self.assertIsNotNone(target)
        self.scene.player_position = target.position
        return apply_command(command("interact", payload), self.state, self.scene)

    def test_story_route_uses_mila_note_floor_six_and_return_trip(self) -> None:
        snapshot = build_snapshot(self.state, self.scene, sequence=1)
        self.assertEqual(
            snapshot["scene"]["navigation"]["mission"],
            "SPEAK WITH MILA AT RECEPTION",
        )

        # A nearby but out-of-order interaction does not skip the first beat.
        self.assertTrue(self.interact_at("lobby-reception-desk").ok)
        self.assertEqual(self.state.open_mic_story_stage, 0)

        mila = self.interact_at("lobby-receptionist")
        self.assertTrue(mila.ok)
        self.assertEqual(self.state.open_mic_story_stage, 1)
        self.assertIn("SCHOOL WANTS THE ROOM", self.state.notice)
        apply_command(command("close_page"), self.state, self.scene)

        desk = self.interact_at("lobby-reception-desk")
        self.assertTrue(desk.ok)
        self.assertEqual(self.state.open_mic_story_stage, 2)
        self.assertIn("FLOWER SHOP", self.state.notice)

        lobby_elevator = self.scene.objects.get("lobby-elevator")
        self.scene.player_position = lobby_elevator.position
        ride_up = apply_command(command("interact"), self.state, self.scene)
        self.assertTrue(ride_up.ok)
        self.assertEqual((self.scene.current_floor, self.scene.current_room), (6, "recreation"))
        self.assertEqual(self.state.open_mic_story_stage, 3)
        self.assertIn("OPEN-MIC SCOUTING COMPLETE", self.state.notice)

        floor_six_elevator = self.scene.objects.get("recreation-elevator")
        self.scene.player_position = floor_six_elevator.position
        ride_down = apply_command(command("interact"), self.state, self.scene)
        self.assertTrue(ride_down.ok)
        self.assertEqual((self.scene.current_floor, self.scene.current_room), (1, "lobby"))
        self.assertEqual(self.state.open_mic_story_stage, 4)

        self.scene.player_position = self.scene.objects.get("lobby-receptionist").position
        report = apply_command(command("interact"), self.state, self.scene)
        self.assertTrue(report.ok)
        self.assertEqual(
            self.state.open_mic_story_stage,
            OPEN_MIC_STORY_COMPLETE_STAGE,
        )
        self.assertIn("FIRST SET READY", self.state.notice)
        self.assertEqual(
            build_snapshot(self.state, self.scene, sequence=2)["scene"]["navigation"]["mission"],
            "OPEN MIC / FIRST SET READY ON FLOOR 06",
        )

    def test_explicit_remote_object_id_cannot_skip_to_mila(self) -> None:
        result = self.interact_at(
            "lobby-reception-desk",
            {"object_id": "lobby-receptionist"},
        )
        self.assertTrue(result.ok)
        self.assertEqual(self.state.open_mic_story_stage, 0)

    def test_story_progress_round_trips_and_invalid_stages_are_bounded(self) -> None:
        self.state.open_mic_story_stage = 3
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "office.json"
            self.state.save_to_file(path)
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["open_mic_story"], {"stage": 3})
            restored = OfficeState.load_from_file(path)
        self.assertEqual(restored.open_mic_story_stage, 3)

        self.assertEqual(normalize_open_mic_story_stage(-2), 0)
        self.assertEqual(normalize_open_mic_story_stage(999), OPEN_MIC_STORY_COMPLETE_STAGE)
        self.assertEqual(normalize_open_mic_story_stage(True), 0)
        self.assertEqual(normalize_open_mic_story_stage("2"), 0)
        self.assertEqual(
            open_mic_story_objective(restored.open_mic_story_stage),
            "RETURN TO THE LOBBY TO REPORT BACK",
        )


if __name__ == "__main__":
    unittest.main()
