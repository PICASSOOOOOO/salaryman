from __future__ import annotations

import json
import tempfile
import unittest
from math import hypot
from pathlib import Path

from pygame_sim.bridge import PROTOCOL_VERSION, apply_command, build_snapshot
from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState
from pygame_sim.tower_story import (
    OPEN_MIC_EVENT_COMPLETE_STAGE,
    OPEN_MIC_PLAN_COMPLETE_STAGE,
    OPEN_MIC_STORY_COMPLETE_STAGE,
    normalize_open_mic_event_stage,
    normalize_open_mic_plan_stage,
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
        self.assertIn("RADIO HOST AND SCHOOL COORDINATOR", self.state.notice)
        self.assertEqual(
            self.state.open_mic_event_stage,
            0,
        )
        self.assertEqual(
            build_snapshot(self.state, self.scene, sequence=2)["scene"]["navigation"]["mission"],
            "SPEAK WITH THE RADIO HOST ON FLOOR 06",
        )

    def test_radio_and_school_interactions_set_the_event_plan_in_order(self) -> None:
        self.scene.select_floor(6)
        self.state.open_mic_story_stage = OPEN_MIC_STORY_COMPLETE_STAGE
        radio_host = self.scene.objects.get("floor-06-radio-host")
        school_coordinator = self.scene.objects.get("floor-06-school-coordinator")
        self.assertIsNone(radio_host.business_key)
        self.assertIsNone(school_coordinator.business_key)

        school_first = self.interact_at(school_coordinator.id)
        self.assertTrue(school_first.ok)
        self.assertEqual(self.state.open_mic_plan_stage, 0)
        self.assertIn("NIA BEFORE TESS", self.state.notice)

        radio = self.interact_at(radio_host.id)
        self.assertTrue(radio.ok)
        self.assertEqual(self.state.open_mic_plan_stage, 1)
        self.assertIn("LIVE MIX STAYS LOCAL", self.state.notice)
        self.assertEqual(
            build_snapshot(self.state, self.scene, sequence=3)["scene"]["navigation"]["mission"],
            "CHECK THE FIRST SLOT WITH THE SCHOOL",
        )

        sound_desk = self.scene.objects.get("floor-06-open-mic-sound-desk")
        self.scene.player_position = sound_desk.position
        setup_before_plan = apply_command(
            command("interact", {"object_id": sound_desk.id}),
            self.state,
            self.scene,
        )
        self.assertFalse(setup_before_plan.ok)
        self.assertEqual(self.state.open_mic_event_stage, 0)

        school = self.interact_at(school_coordinator.id)
        self.assertTrue(school.ok)
        self.assertEqual(self.state.open_mic_plan_stage, OPEN_MIC_PLAN_COMPLETE_STAGE)
        self.assertIn("STUDENT TAKES THE FIRST SLOT", self.state.notice)
        self.assertEqual(
            build_snapshot(self.state, self.scene, sequence=4)["scene"]["navigation"]["mission"],
            "CHECK THE SOUND LEVELS ON FLOOR 06",
        )

    def test_open_mic_event_requires_order_and_finishes_on_the_floor_six_mic(self) -> None:
        self.scene.select_floor(6)
        sound_desk = self.scene.objects.get("floor-06-open-mic-sound-desk")
        self.scene.player_position = sound_desk.position
        locked = apply_command(
            command("interact", {"object_id": sound_desk.id}),
            self.state,
            self.scene,
        )
        self.assertFalse(locked.ok)
        self.assertEqual(self.state.open_mic_event_stage, 0)

        self.state.open_mic_story_stage = OPEN_MIC_STORY_COMPLETE_STAGE
        self.assertFalse(
            apply_command(
                command("interact", {"object_id": sound_desk.id}),
                self.state,
                self.scene,
            ).ok
        )
        self.state.open_mic_plan_stage = OPEN_MIC_PLAN_COMPLETE_STAGE

        sign_up = self.scene.objects.get("floor-06-open-mic-sign-up")
        self.scene.player_position = sign_up.position
        out_of_order = apply_command(
            command("interact", {"object_id": sign_up.id}),
            self.state,
            self.scene,
        )
        self.assertTrue(out_of_order.ok)
        self.assertEqual(self.state.open_mic_event_stage, 0)
        self.assertIn("SOUND LEVELS FIRST", self.state.notice)

        expected = (
            ("floor-06-open-mic-sound-desk", 1, "FIRST PERFORMER"),
            ("floor-06-open-mic-sign-up", 2, "STUDENT HAS THE FIRST SLOT"),
            ("floor-06-open-mic-microphone", OPEN_MIC_EVENT_COMPLETE_STAGE, "FIRST SET COMPLETE"),
        )
        for object_id, stage, expected_notice in expected:
            result = self.interact_at(object_id)
            self.assertTrue(result.ok)
            self.assertEqual(self.state.open_mic_event_stage, stage)
            self.assertIn(expected_notice, self.state.notice)

        snapshot = build_snapshot(self.state, self.scene, sequence=3)
        self.assertEqual(
            snapshot["scene"]["navigation"]["mission"],
            "OPEN MIC / FIRST SET COMPLETE ON FLOOR 06",
        )

    def test_open_mic_event_rejects_remote_stations(self) -> None:
        self.state.open_mic_story_stage = OPEN_MIC_STORY_COMPLETE_STAGE
        self.state.open_mic_plan_stage = OPEN_MIC_PLAN_COMPLETE_STAGE
        wrong_floor = apply_command(
            command("interact", {"object_id": "floor-06-open-mic-sound-desk"}),
            self.state,
            self.scene,
        )
        self.assertFalse(wrong_floor.ok)
        self.assertEqual(self.state.open_mic_event_stage, 0)

        self.scene.select_floor(6)
        result = apply_command(
            command("interact", {"object_id": "floor-06-open-mic-microphone"}),
            self.state,
            self.scene,
        )
        self.assertFalse(result.ok)
        self.assertEqual(self.state.open_mic_event_stage, 0)

    def test_event_stations_are_reachable_from_the_floor_six_spawn(self) -> None:
        self.scene.select_floor(6)
        for object_id in (
            "floor-06-radio-host",
            "floor-06-school-coordinator",
            "floor-06-open-mic-sound-desk",
            "floor-06-open-mic-sign-up",
            "floor-06-open-mic-microphone",
        ):
            target = self.scene.objects.get(object_id)
            self.assertIsNotNone(target)
            for _ in range(400):
                dx = target.position[0] - self.scene.player_position[0]
                dy = target.position[1] - self.scene.player_position[1]
                distance = hypot(dx, dy)
                if distance <= 800:
                    break
                scale = min(350 / distance, 1)
                before = self.scene.player_position
                self.scene.move(round(dx * scale), round(dy * scale))
                if self.scene.player_position == before:
                    break
            self.assertEqual(getattr(self.scene.nearby_object, "id", None), object_id)

    def test_explicit_remote_object_id_cannot_skip_to_mila(self) -> None:
        result = self.interact_at(
            "lobby-reception-desk",
            {"object_id": "lobby-receptionist"},
        )
        self.assertTrue(result.ok)
        self.assertEqual(self.state.open_mic_story_stage, 0)

    def test_story_progress_round_trips_and_invalid_stages_are_bounded(self) -> None:
        self.state.open_mic_story_stage = 3
        self.state.open_mic_plan_stage = 1
        self.state.open_mic_event_stage = 2
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "office.json"
            self.state.save_to_file(path)
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["open_mic_story"], {"stage": 3})
            self.assertEqual(payload["open_mic_plan"], {"stage": 1})
            self.assertEqual(payload["open_mic_event"], {"stage": 2})
            restored = OfficeState.load_from_file(path)
        self.assertEqual(restored.open_mic_story_stage, 3)
        self.assertEqual(restored.open_mic_plan_stage, 1)
        self.assertEqual(restored.open_mic_event_stage, 2)

        self.assertEqual(normalize_open_mic_story_stage(-2), 0)
        self.assertEqual(normalize_open_mic_story_stage(999), OPEN_MIC_STORY_COMPLETE_STAGE)
        self.assertEqual(normalize_open_mic_story_stage(True), 0)
        self.assertEqual(normalize_open_mic_story_stage("2"), 0)
        self.assertEqual(normalize_open_mic_event_stage(-2), 0)
        self.assertEqual(normalize_open_mic_event_stage(999), OPEN_MIC_EVENT_COMPLETE_STAGE)
        self.assertEqual(normalize_open_mic_event_stage(True), 0)
        self.assertEqual(normalize_open_mic_event_stage("2"), 0)
        self.assertEqual(normalize_open_mic_plan_stage(-2), 0)
        self.assertEqual(normalize_open_mic_plan_stage(999), OPEN_MIC_PLAN_COMPLETE_STAGE)
        self.assertEqual(normalize_open_mic_plan_stage(True), 0)
        self.assertEqual(normalize_open_mic_plan_stage("2"), 0)
        self.assertEqual(
            open_mic_story_objective(restored.open_mic_story_stage),
            "RETURN TO THE LOBBY TO REPORT BACK",
        )
        restored.reset()
        self.assertEqual(restored.open_mic_plan_stage, 0)
        self.assertEqual(restored.open_mic_event_stage, 0)

    def test_legacy_event_progress_skips_new_planning_steps(self) -> None:
        self.state.open_mic_story_stage = OPEN_MIC_STORY_COMPLETE_STAGE
        self.state.open_mic_event_stage = 1
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "office.json"
            self.state.save_to_file(path)
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload.pop("open_mic_plan")
            path.write_text(json.dumps(payload), encoding="utf-8")
            restored = OfficeState.load_from_file(path)
        self.assertEqual(restored.open_mic_plan_stage, OPEN_MIC_PLAN_COMPLETE_STAGE)
        self.assertEqual(restored.open_mic_event_stage, 1)


if __name__ == "__main__":
    unittest.main()
