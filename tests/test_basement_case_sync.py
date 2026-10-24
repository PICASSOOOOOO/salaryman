import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from pygame_sim.basement_sync import DesktopBasementSync
from pygame_sim.bridge import build_snapshot
from pygame_sim.scene import TowerScene
from pygame_sim.state import OfficeState


class BasementCaseSyncTests(unittest.TestCase):
    def test_case_station_requests_are_allowlisted_and_only_one_can_be_pending(self):
        sync = DesktopBasementSync(
            SimpleNamespace(
                server_url="https://salaryman.test",
                credential="test-token",
                device_id="test-device",
            )
        )

        self.assertFalse(sync.queue_collections_case_station("skip_to_finale"))
        self.assertTrue(sync.queue_collections_case_station("clerk"))
        self.assertFalse(sync.queue_collections_case_station("ledger"))
        source, path, body = sync._actions.get_nowait()
        self.assertEqual(source, "collections_case_station")
        self.assertEqual(path, "/desktop-building/basement/collections-case/station")
        self.assertEqual(body, {"station": "clerk"})

    def test_server_progress_controls_online_view_without_changing_legacy_save(self):
        state = OfficeState.with_default_roster()
        state.collections_case_stage = 3
        state.collections_case_server_stage = 1

        snapshot = build_snapshot(state, TowerScene(), 1)
        self.assertEqual(snapshot["office"]["collectionsCaseStage"], 1)

        with TemporaryDirectory() as directory:
            path = Path(directory) / "office.json"
            state.save_to_file(path)
            restored = OfficeState.load_from_file(path)
        self.assertEqual(restored.collections_case_stage, 3)
        self.assertIsNone(restored.collections_case_server_stage)


if __name__ == "__main__":
    unittest.main()
