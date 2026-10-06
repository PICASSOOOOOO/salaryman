import io
import json
import tempfile
import unittest
from pathlib import Path

from pygame_sim.automation import (
    AUTOPILOT_DOMAINS,
    AUTOMATION_CHARACTERS,
    AutopilotDomainStatus,
    AutopilotSnapshot,
    DesktopLink,
    fetch_autopilot_snapshot,
    load_desktop_link,
)
from pygame_sim.approved_content import APPROVED_AUTOMATION_CHARACTERS
from pygame_sim.bridge import build_snapshot
from pygame_sim.scene import build_tower_scene
from pygame_sim.state import OfficeState


class PygameAutomationTests(unittest.TestCase):
    def test_each_supported_domain_has_an_in_bounds_character_route_and_asset(self):
        scene = build_tower_scene()
        self.assertEqual({profile.domain for profile in AUTOMATION_CHARACTERS}, set(AUTOPILOT_DOMAINS))
        self.assertEqual(len({profile.route for profile in AUTOMATION_CHARACTERS}), len(AUTOMATION_CHARACTERS))

        asset_root = Path(__file__).parent.parent / "artifacts/interview-helper/public/pixel-agents/assets"
        for profile in AUTOMATION_CHARACTERS:
            room = next(room for room in scene.rooms if room.id == profile.room_id)
            self.assertTrue(all(room.contains(point) for point in profile.route), profile.domain)
            self.assertTrue((asset_root / profile.sprite).is_file(), profile.sprite)

    def test_automation_characters_open_native_game_modules_not_browser_routes(self):
        self.assertEqual(
            tuple(profile.name for profile in AUTOMATION_CHARACTERS),
            APPROVED_AUTOMATION_CHARACTERS,
        )
        self.assertEqual(
            {profile.domain for profile in AUTOMATION_CHARACTERS},
            set(AUTOPILOT_DOMAINS),
        )
        self.assertTrue(all(profile.app_label for profile in AUTOMATION_CHARACTERS))

    def test_enabled_characters_walk_and_disabled_characters_wait_at_their_workstation(self):
        scene = build_tower_scene()
        scene.select_room("office_03")
        ops = next(profile for profile in AUTOMATION_CHARACTERS if profile.domain == "business_ops")
        research = next(profile for profile in AUTOMATION_CHARACTERS if profile.domain == "market_research")
        scene.set_autopilot_snapshot(AutopilotSnapshot(
            "connected",
            {
                "business_ops": AutopilotDomainStatus(True, "2026-10-05T09:30:00.000Z"),
                "market_research": AutopilotDomainStatus(False, None),
            },
            None,
            1,
        ))

        initial_ops = scene.automation_pose(ops)[0]
        initial_research = scene.automation_pose(research)[0]
        scene.npc_motion_seconds = 20.0
        self.assertNotEqual(scene.automation_pose(ops)[0], initial_ops)
        self.assertEqual(scene.automation_pose(research)[0], initial_research)

    def test_nearby_character_inspection_opens_read_only_status_page(self):
        scene = build_tower_scene()
        state = OfficeState.with_default_roster()
        scene.select_room("office_03")
        ops = next(profile for profile in AUTOMATION_CHARACTERS if profile.domain == "business_ops")
        scene.set_autopilot_snapshot(AutopilotSnapshot(
            "connected",
            {"business_ops": AutopilotDomainStatus(True, None)},
            None,
            1,
        ))
        scene.player_position = ops.route[0]
        funds_before = state.funds

        result = scene.interact(state)

        self.assertTrue(result.success)
        self.assertEqual(state.active_page, "automation")
        self.assertEqual(scene.selected_automation_domain, "business_ops")
        self.assertEqual(state.funds, funds_before)

    def test_unlinked_snapshot_does_not_mark_characters_as_running(self):
        scene = build_tower_scene()
        scene.select_room("office_03")

        actors = scene.automation_character_states()

        self.assertTrue(actors)
        self.assertTrue(all(actor["enabled"] is None for actor in actors))
        self.assertTrue(all(actor["syncState"] == "unlinked" for actor in actors))

    def test_status_fetch_uses_device_auth_and_accepts_only_safe_domain_fields(self):
        link = DesktopLink(
            "https://salaryman.example",
            "pygame-device-0001",
            f"sm_desktop_{'A' * 43}",
        )
        payload = {
            "snapshotAt": "2026-10-05T09:30:00.000Z",
            "domains": [
                {"domain": "business_ops", "enabled": True, "lastRunAt": None},
                {"domain": "unknown_domain", "enabled": True, "lastRunAt": None},
            ],
        }
        observed = {}

        def opener(request, timeout):
            observed["url"] = request.full_url
            observed["headers"] = {name.lower(): value for name, value in request.header_items()}
            observed["timeout"] = timeout
            return io.BytesIO(json.dumps(payload).encode("utf-8"))

        result = fetch_autopilot_snapshot(link, opener=opener)

        self.assertEqual(observed["url"], "https://salaryman.example/api/autopilot/desktop-snapshot")
        self.assertEqual(observed["headers"]["authorization"], f"Bearer {link.credential}")
        self.assertEqual(observed["headers"]["x-salaryman-device-id"], link.device_id)
        self.assertEqual(set(result), {"business_ops"})
        self.assertTrue(result["business_ops"].enabled)

    def test_desktop_link_file_loads_from_the_downloaded_contract(self):
        payload = {
            "version": 1,
            "serverUrl": "https://salaryman.example/",
            "deviceId": "pygame-device-0001",
            "credential": f"sm_desktop_{'B' * 43}",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "desktop-link.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            loaded = load_desktop_link(path)

        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.server_url, "https://salaryman.example")
        self.assertEqual(loaded.device_id, payload["deviceId"])
        self.assertEqual(loaded.credential, payload["credential"])

    def test_bridge_snapshot_contains_agent_poses_but_never_device_credentials(self):
        scene = build_tower_scene()
        scene.select_room("office_03")
        scene.set_autopilot_snapshot(AutopilotSnapshot(
            "connected",
            {"business_ops": AutopilotDomainStatus(True, None)},
            None,
            1,
        ))
        state = OfficeState.with_default_roster()

        snapshot = build_snapshot(state, scene, sequence=2)

        self.assertEqual(snapshot["scene"]["automationSync"]["state"], "connected")
        self.assertEqual(snapshot["scene"]["automationCharacters"][0]["domain"], "business_ops")
        self.assertNotIn("sm_desktop_", json.dumps(snapshot))


if __name__ == "__main__":
    unittest.main()
