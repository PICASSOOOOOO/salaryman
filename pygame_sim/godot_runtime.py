"""Discover and supervise the Godot client paired with the Python simulation."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


GAME_BUNDLE_MANIFEST = "salaryman-game.json"


@dataclass(frozen=True)
class GodotRuntime:
    executable: Path
    project_dir: Path

    def command(self) -> list[str]:
        return [str(self.executable), "--path", str(self.project_dir)]


def _runtime_roots(
    *,
    executable: str | os.PathLike[str] | None = None,
    module_file: str | os.PathLike[str] | None = None,
) -> list[Path]:
    roots: list[Path] = []
    if executable is not None:
        candidate = Path(executable).expanduser()
        roots.extend([candidate.parent, *candidate.parents])
    elif getattr(sys, "frozen", False):
        candidate = Path(sys.executable).resolve()
        roots.extend([candidate.parent, *candidate.parents])
    bundled_resources = getattr(sys, "_MEIPASS", None)
    if bundled_resources:
        candidate = Path(bundled_resources).resolve()
        roots.extend([candidate, *candidate.parents])
    if module_file is not None:
        candidate = Path(module_file).resolve()
        roots.append(candidate.parent.parent)
    result: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        resolved = root.resolve()
        if resolved not in seen:
            seen.add(resolved)
            result.append(resolved)
    return result


def resolve_godot_runtime(
    *,
    godot_executable: str | os.PathLike[str] | None = None,
    project_dir: str | os.PathLike[str] | None = None,
    app_executable: str | os.PathLike[str] | None = None,
    module_file: str | os.PathLike[str] | None = None,
    environ: dict[str, str] | None = None,
    which: Callable[[str], str | None] = shutil.which,
) -> GodotRuntime:
    """Resolve the matching bundled pair, or the development Godot on PATH.

    Explicit paths are useful for development and tests. Release bundles carry
    salaryman-game.json next to both runtime directories, so remain relocatable.
    """

    env = os.environ if environ is None else environ
    executable_value = godot_executable or env.get("SALARYMAN_GODOT_EXECUTABLE")
    project_value = project_dir or env.get("SALARYMAN_GODOT_PROJECT")
    explicit_executable = Path(executable_value).expanduser() if executable_value else None
    explicit_project = Path(project_value).expanduser() if project_value else None
    roots = _runtime_roots(executable=app_executable, module_file=module_file)

    for root in roots:
        manifest_path = root / GAME_BUNDLE_MANIFEST
        if not manifest_path.is_file():
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        executable_relative = manifest.get("godotExecutable")
        project_relative = manifest.get("godotProject")
        if not isinstance(executable_relative, str) or not isinstance(project_relative, str):
            raise ValueError(f"{manifest_path} must define godotExecutable and godotProject")
        executable = (root / executable_relative).resolve()
        project = (root / project_relative).resolve()
        if not executable.is_file() or not project.joinpath("project.godot").is_file():
            raise FileNotFoundError(f"The paired Godot runtime in {root} is incomplete.")
        return GodotRuntime(executable, project)

    executable = explicit_executable
    if executable is None:
        executable_value = which("godot") or which("godot4")
        executable = Path(executable_value) if executable_value else None
    project = explicit_project
    if project is None:
        project = next(
            (root / "godot-office-client" for root in roots if (root / "godot-office-client/project.godot").is_file()),
            None,
        )
        if project is None and module_file is not None:
            source_project = Path(module_file).resolve().parent.parent / "godot" / "office-client"
            if (source_project / "project.godot").is_file():
                project = source_project

    if executable is None or project is None:
        raise FileNotFoundError(
            "SALARYMAN OS requires its Godot game client and Python simulation. "
            "Install Godot 4 for source development or use a complete packaged release."
        )
    executable = executable.resolve()
    project = project.resolve()
    if not executable.is_file() or not project.joinpath("project.godot").is_file():
        raise FileNotFoundError("The Godot executable and office-client project must both exist.")
    return GodotRuntime(executable, project)


def launch_godot(
    runtime: GodotRuntime,
    *,
    headless: bool = False,
) -> subprocess.Popen[bytes]:
    try:
        command = runtime.command()
        if headless:
            command.append("--headless")
        return subprocess.Popen(
            command,
            cwd=runtime.project_dir,
            stdin=subprocess.DEVNULL,
        )
    except OSError as exc:
        raise RuntimeError(f"Unable to start the SALARYMAN Godot game client: {exc}") from exc


def stop_process(process: subprocess.Popen[bytes], timeout_seconds: float = 4.0) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
    except subprocess.TimeoutExpired:
        return
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def godot_process_exited(process: subprocess.Popen[bytes]) -> bool:
    return process.poll() is not None
