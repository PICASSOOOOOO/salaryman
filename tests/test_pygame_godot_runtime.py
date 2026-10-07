from __future__ import annotations

import json
import unittest
import time
from pathlib import Path
from unittest.mock import patch

from pygame_sim.app import _initialize_hidden_python_renderer, parse_args
from pygame_sim.godot_runtime import (
    GodotRuntime,
    godot_process_exited,
    launch_godot,
    resolve_godot_runtime,
    stop_process,
)


def _executable(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("#!/usr/bin/env python3\nimport time\ntime.sleep(30)\n", encoding="utf-8")
    path.chmod(0o755)
    return path


def _project(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    (path / "project.godot").write_text("[application]\n", encoding="utf-8")
    return path


class GodotRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile

        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        self.tmp_path = Path(self._temporary.name)

    def test_python_simulation_stays_offscreen_while_godot_is_visible_by_default(self) -> None:
        import pygame

        pygame.quit()
        with patch.object(
            pygame.display,
            "set_mode",
            side_effect=AssertionError("the Python simulation must not open a window"),
        ):
            _initialize_hidden_python_renderer()
        try:
            self.assertEqual(pygame.display.get_driver(), "dummy")
            self.assertIsNone(pygame.display.get_surface())
            self.assertFalse(parse_args([]).headless)
            pygame.event.get()
        finally:
            pygame.quit()

    def test_resolves_relocatable_paired_runtime_before_host_godot(self) -> None:
        root = self.tmp_path / "release"
        binary = _executable(root / "godot-runtime" / "Godot")
        project = _project(root / "godot-office-client")
        (root / "salaryman-game.json").write_text(
            json.dumps(
                {"godotExecutable": "godot-runtime/Godot", "godotProject": "godot-office-client"}
            ),
            encoding="utf-8",
        )
        host_godot = _executable(self.tmp_path / "unrelated-system-godot")
        app_executable = _executable(
            root / "pygame" / "SALARYMAN" / "Contents" / "MacOS" / "SALARYMAN"
        )

        runtime = resolve_godot_runtime(
            app_executable=app_executable,
            environ={"SALARYMAN_GODOT_EXECUTABLE": str(host_godot)},
        )

        self.assertEqual(runtime, GodotRuntime(binary.resolve(), project.resolve()))
        self.assertEqual(
            runtime.command(),
            [str(binary.resolve()), "--path", str(project.resolve())],
        )

    def test_source_development_uses_local_project_and_godot_on_path(self) -> None:
        repository = self.tmp_path / "repo"
        godot = _executable(self.tmp_path / "godot")
        project = _project(repository / "godot" / "office-client")
        module_file = repository / "pygame_sim" / "app.py"
        module_file.parent.mkdir(parents=True)
        module_file.touch()

        runtime = resolve_godot_runtime(
            module_file=module_file,
            environ={},
            which=lambda name: str(godot) if name == "godot" else None,
        )

        self.assertEqual(runtime, GodotRuntime(godot.resolve(), project.resolve()))

    def test_rejects_an_incomplete_paired_release(self) -> None:
        root = self.tmp_path / "release"
        root.mkdir()
        (root / "salaryman-game.json").write_text(
            json.dumps(
                {"godotExecutable": "godot-runtime/Godot", "godotProject": "godot-office-client"}
            ),
            encoding="utf-8",
        )
        executable = _executable(root / "GodotLauncher")
        with self.assertRaisesRegex(FileNotFoundError, "paired Godot runtime"):
            resolve_godot_runtime(app_executable=executable, environ={})

    def test_launches_and_stops_the_paired_game_process(self) -> None:
        executable = _executable(self.tmp_path / "Godot")
        project = _project(self.tmp_path / "office-client")
        process = launch_godot(GodotRuntime(executable, project))
        try:
            time.sleep(0.15)
            self.assertFalse(godot_process_exited(process))
        finally:
            stop_process(process)
        self.assertTrue(godot_process_exited(process))

    def test_missing_release_runtime_fails_explicitly(self) -> None:
        module_file = self.tmp_path / "repo" / "pygame_sim" / "app.py"
        module_file.parent.mkdir(parents=True)
        module_file.touch()
        with self.assertRaisesRegex(FileNotFoundError, "requires its Godot game client"):
            resolve_godot_runtime(module_file=module_file, environ={}, which=lambda _: None)
