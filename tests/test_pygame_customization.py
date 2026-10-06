import json
import tempfile
import unittest
from pathlib import Path

from pygame_sim.animation import character_pose
from pygame_sim.customization import (
    DEFAULT_ROOM_CUSTOMIZATION,
    room_decor_placements,
    sanitize_room_customizations,
)
from pygame_sim.state import OfficeState


class PygameCustomizationTests(unittest.TestCase):
    def test_walk_cycle_keeps_the_same_character_variant(self) -> None:
        poses = [character_pose(4, tick, moving=True) for tick in range(0, 120)]

        self.assertEqual({pose[0] for pose in poses}, {4})
        self.assertEqual({pose[1] for pose in poses}, {0})
        self.assertGreater(len({pose[1:] for pose in poses}), 1)
        self.assertEqual(character_pose(4, 80, moving=False), (4, 0, 0))

    def test_room_decor_presets_use_fixed_visual_only_slots(self) -> None:
        bounds = (5100, 5200, 1800, 2200)
        original = room_decor_placements("office_03", bounds, "original")
        greenhouse = room_decor_placements("office_03", bounds, "greenhouse")

        self.assertEqual(
            original,
            (
                ("furniture/WHITEBOARD/WHITEBOARD.png", (5300, 6400)),
                ("furniture/BOOKSHELF/BOOKSHELF.png", (6650, 6400)),
                ("furniture/PLANT/PLANT.png", (6650, 7000)),
            ),
        )
        self.assertEqual(len(greenhouse), 3)
        self.assertTrue(greenhouse[0][0].endswith("LARGE_PAINTING.png"))
        self.assertTrue(greenhouse[2][0].endswith("LARGE_PLANT.png"))

    def test_room_customizations_persist_and_keep_legacy_saves_compatible(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            save_path = Path(directory) / "office.json"
            state = OfficeState.with_default_roster()
            self.assertTrue(
                state.set_room_customization(
                    "office_03",
                    wall_style="sunrise",
                    decor_style="greenhouse",
                )
            )
            state.save_to_file(save_path)

            saved = json.loads(save_path.read_text(encoding="utf-8"))
            restored = OfficeState.load_from_file(save_path)
            self.assertEqual(saved["version"], 2)
            self.assertEqual(
                restored.get_room_customization("office_03"),
                {"wall_style": "sunrise", "decor_style": "greenhouse"},
            )

            legacy_path = Path(directory) / "legacy.json"
            legacy_path.write_text(json.dumps({"version": 1}), encoding="utf-8")
            legacy = OfficeState.load_from_file(legacy_path)
            self.assertEqual(
                legacy.get_room_customization("office_03"),
                DEFAULT_ROOM_CUSTOMIZATION,
            )

    def test_invalid_saved_styles_and_unknown_rooms_fail_closed(self) -> None:
        sanitized = sanitize_room_customizations(
            {
                "office_03": {"wall_style": ["invalid"], "decor_style": "missing"},
                "unknown-room": {
                    "wall_style": "sunrise",
                    "decor_style": "greenhouse",
                },
            }
        )

        self.assertEqual(
            sanitized,
            {"office_03": dict(DEFAULT_ROOM_CUSTOMIZATION)},
        )
        state = OfficeState.with_default_roster()
        self.assertFalse(state.set_room_customization("office_03", wall_style=["invalid"]))
        self.assertFalse(
            state.set_room_customization("unknown-room", decor_style="studio")
        )
