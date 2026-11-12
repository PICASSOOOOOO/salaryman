from __future__ import annotations

import zipfile
import unittest
from pathlib import Path

from scripts.build_desktop import (
    GODOT_VERSION,
    REQUIRED_GODOT_FILES,
    _extract_zip_safely,
    _godot_archive_for_platform,
    _stage_godot_runtime,
    write_release_launchers,
)


class DesktopGodotPackagingTests(unittest.TestCase):
    def test_requires_integrated_exterior_assets_in_release_package(self) -> None:
        self.assertIn("exterior_world.gd", REQUIRED_GODOT_FILES)
        self.assertIn("tower_exterior_plan.json", REQUIRED_GODOT_FILES)

    def test_selects_the_pinned_native_godot_archive(self) -> None:
        cases = [
        (
            "Darwin",
            "arm64",
            f"Godot_v{GODOT_VERSION}-stable_macos.universal.zip",
            "Godot.app/Contents/MacOS/Godot",
        ),
        (
            "Windows",
            "amd64",
            f"Godot_v{GODOT_VERSION}-stable_win64.exe.zip",
            f"Godot_v{GODOT_VERSION}-stable_win64.exe",
        ),
        (
            "Linux",
            "x86_64",
            f"Godot_v{GODOT_VERSION}-stable_linux.x86_64.zip",
            f"Godot_v{GODOT_VERSION}-stable_linux.x86_64",
        ),
        ]
        for system, machine, archive, executable in cases:
            with self.subTest(system=system, machine=machine):
                self.assertEqual(
                    _godot_archive_for_platform(system, machine),
                    (archive, executable),
                )

    def test_refuses_unconfigured_platform_instead_of_building_pygame_only(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Do not produce a Python-only game release"):
            _godot_archive_for_platform("FreeBSD", "x86_64")

    def test_macos_runtime_bundle_is_not_precreated_before_copy(self) -> None:
        import tempfile
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            extracted = root / "download"
            executable = extracted / "Godot.app" / "Contents" / "MacOS" / "Godot"
            executable.parent.mkdir(parents=True)
            executable.write_bytes(b"Godot runtime")
            staging = root / "staging"
            staging.mkdir()

            with (
                patch(
                    "scripts.build_desktop._download_godot_release",
                    return_value=(
                        extracted,
                        "Godot.app/Contents/MacOS/Godot",
                    ),
                ),
                patch("scripts.build_desktop.urllib.request.urlopen") as urlopen,
            ):
                urlopen.return_value.__enter__.return_value.read.return_value = b"license"
                staged_engine = _stage_godot_runtime(staging, "Darwin", "arm64")

            self.assertEqual(staged_engine.read_bytes(), b"Godot runtime")
            self.assertEqual(
                (staging / "godot-runtime" / "LICENSE.txt").read_text(),
                "license",
            )

    def test_rejects_archive_path_escape(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as temp:
            tmp_path = Path(temp)
            archive = tmp_path / "unsafe.zip"
            with zipfile.ZipFile(archive, "w") as zipped:
                zipped.writestr("../outside.txt", "unsafe")

            with self.assertRaisesRegex(RuntimeError, "unsafe path"):
                _extract_zip_safely(archive, tmp_path / "extract")
            self.assertFalse((tmp_path / "outside.txt").exists())

    def test_launchers_show_godot_and_keep_python_as_a_hidden_companion(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as temp:
            for system in ("Windows", "Darwin", "Linux"):
                with self.subTest(system=system):
                    staging = Path(temp) / system
                    staging.mkdir()
                    write_release_launchers(staging, system)
                    if system == "Windows":
                        launcher = (staging / "START-SALARYMAN.cmd").read_text(encoding="utf-8")
                    else:
                        launcher = (staging / "launch-salaryman-office.sh").read_text(
                            encoding="utf-8"
                        )
                    self.assertNotIn("--headless", launcher)
