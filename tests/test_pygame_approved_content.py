import unittest
from pathlib import Path

from pygame_sim.approved_content import (
    APPROVED_AUTOMATION_CHARACTERS,
    APPROVED_CAMERA_FOCUS_KINDS,
    APPROVED_GODOT_TOWER_ASSETS,
    APPROVED_INTERACTIVE_OBJECT_KINDS,
    APPROVED_PYGAME_CHARACTER_ASSETS,
    APPROVED_PYGAME_OBJECT_ASSETS,
    APPROVED_RECRUITABLE_CHARACTERS,
    APPROVED_STARTER_CHARACTERS,
)
from pygame_sim.automation import AUTOMATION_CHARACTERS
from pygame_sim.bridge import build_snapshot
from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState


PROJECT_ROOT = Path(__file__).parent.parent


class ApprovedContentTests(unittest.TestCase):
    def test_every_approved_asset_exists(self):
        pygame_assets = PROJECT_ROOT / "artifacts/interview-helper/public/pixel-agents/assets"
        for asset in APPROVED_PYGAME_CHARACTER_ASSETS + APPROVED_PYGAME_OBJECT_ASSETS:
            self.assertTrue((pygame_assets / asset).is_file(), asset)
        for asset in APPROVED_GODOT_TOWER_ASSETS:
            self.assertTrue((PROJECT_ROOT / asset).is_file(), asset)

    def test_live_characters_and_interactables_stay_inside_the_allowlist(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        self.assertEqual(
            tuple(worker.name for worker in state.roster.workers),
            APPROVED_STARTER_CHARACTERS,
        )
        self.assertTrue(
            {candidate.name for candidate in state.recruitment_candidates}
            <= set(APPROVED_RECRUITABLE_CHARACTERS)
        )
        self.assertEqual(
            tuple(profile.name for profile in AUTOMATION_CHARACTERS),
            APPROVED_AUTOMATION_CHARACTERS,
        )

        interactive = [item for item in scene.objects.objects if item.interactive]
        self.assertTrue(interactive)
        self.assertLessEqual(
            {item.kind for item in interactive},
            APPROVED_INTERACTIVE_OBJECT_KINDS,
        )
        for item in interactive:
            self.assertEqual(
                item.camera_focus_enabled,
                item.kind in APPROVED_CAMERA_FOCUS_KINDS,
                item.id,
            )
        self.assertIsNone(scene.objects.get("lobby-tv"))

    def test_device_page_and_focus_are_shared_in_the_game_snapshot(self):
        state = OfficeState.with_default_roster()
        scene = build_tower_scene()
        result = scene.interact(state, "lobby-pay-phone")
        self.assertTrue(result.success)

        snapshot = build_snapshot(state, scene, sequence=1)
        self.assertEqual(snapshot["office"]["activePage"], "phone")
        self.assertEqual(snapshot["office"]["pageSource"], "PAY PHONE")
        self.assertEqual(snapshot["office"]["activeObjectId"], "lobby-pay-phone")
        self.assertEqual(snapshot["scene"]["cameraFocusObjectId"], "lobby-pay-phone")
        phone = next(
            item
            for item in snapshot["scene"]["objects"]
            if item["id"] == "lobby-pay-phone"
        )
        self.assertTrue(phone["cameraFocusEnabled"])


if __name__ == "__main__":
    unittest.main()
