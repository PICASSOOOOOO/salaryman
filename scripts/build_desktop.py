"""Build the SALARYMAN office client for the current desktop OS.

Usage:
    python scripts/build_desktop.py

Install the optional builder first:
    pip install -e '.[desktop-build]'
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist" / "salaryman-office"
RELEASES = ROOT / "dist" / "releases"
ICON_SOURCE = ROOT / "artifacts" / "interview-helper" / "public" / "icon-512.png"
PIXEL_ASSET_SOURCE = ROOT / "artifacts" / "interview-helper" / "public" / "pixel-agents"
FLOOR_PLAN_SOURCE = ROOT / "godot" / "office-client" / "floor_plan.json"
EXECUTABLE_NAME = "SALARYMAN Office"
GODOT_VERSION = "4.4.1"
GODOT_RELEASE_URL = (
    "https://github.com/godotengine/godot/releases/download/"
    f"{GODOT_VERSION}-stable"
)
REQUIRED_GODOT_FILES = (
    "project.godot",
    "Main.tscn",
    "main.gd",
    "floor_plan.json",
    "tower_exterior_plan.json",
    "exterior_world.gd",
    "agentshire-assets/characters/character-male-a.glb",
    "agentshire-assets/furniture/couch.gltf",
    "pixel-agents/assets/characters/char_0.png",
    "callhome/track-11.mp3",
    "callhome/track-17.mp3",
)


def _godot_archive_for_platform(system_name: str, machine: str) -> tuple[str, str]:
    if system_name == "Darwin" and machine in {"arm64", "aarch64", "x86_64", "amd64"}:
        return (
            f"Godot_v{GODOT_VERSION}-stable_macos.universal.zip",
            "Godot.app/Contents/MacOS/Godot",
        )
    if system_name == "Windows" and machine in {"amd64", "x86_64"}:
        return (
            f"Godot_v{GODOT_VERSION}-stable_win64.exe.zip",
            f"Godot_v{GODOT_VERSION}-stable_win64.exe",
        )
    if system_name == "Linux" and machine in {"x86_64", "amd64"}:
        return (
            f"Godot_v{GODOT_VERSION}-stable_linux.x86_64.zip",
            f"Godot_v{GODOT_VERSION}-stable_linux.x86_64",
        )
    raise RuntimeError(
        f"No pinned Godot {GODOT_VERSION} desktop runtime is configured for "
        f"{system_name}/{machine}. Do not produce a Python-only game release."
    )


def _extract_zip_safely(
    archive: Path,
    destination: Path,
    *,
    preserve_macos_metadata: bool = False,
) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    resolved_destination = destination.resolve()
    with zipfile.ZipFile(archive) as zipped:
        for entry in zipped.infolist():
            target = (destination / entry.filename).resolve()
            if not target.is_relative_to(resolved_destination):
                raise RuntimeError(f"Godot archive contains an unsafe path: {entry.filename}")
        if preserve_macos_metadata:
            subprocess.run(
                ["ditto", "-x", "-k", str(archive), str(destination)],
                check=True,
            )
        else:
            zipped.extractall(destination)


def _download_godot_release(system_name: str, machine: str) -> tuple[Path, str]:
    asset_name, executable_relative = _godot_archive_for_platform(system_name, machine)
    cache = ROOT / "build" / "godot-release-cache" / GODOT_VERSION / system_name
    archive = cache / asset_name
    extracted = cache / "extracted"
    expected = extracted / executable_relative
    if expected.is_file():
        return extracted, executable_relative

    cache.mkdir(parents=True, exist_ok=True)
    temporary_archive = archive.with_suffix(archive.suffix + ".download")
    try:
        print(f"Downloading the matching Godot {GODOT_VERSION} runtime for {system_name}...")
        with urllib.request.urlopen(f"{GODOT_RELEASE_URL}/{asset_name}", timeout=120) as response:
            with temporary_archive.open("wb") as output:
                shutil.copyfileobj(response, output)
        if temporary_archive.stat().st_size < 10 * 1024 * 1024:
            raise RuntimeError("The downloaded Godot runtime archive is unexpectedly small.")
        temporary_archive.replace(archive)
        if extracted.exists():
            shutil.rmtree(extracted)
        _extract_zip_safely(
            archive,
            extracted,
            preserve_macos_metadata=system_name == "Darwin",
        )
    except (OSError, urllib.error.URLError, zipfile.BadZipFile) as error:
        temporary_archive.unlink(missing_ok=True)
        raise RuntimeError(
            f"Could not obtain the official Godot runtime for {system_name}: {error}"
        ) from error
    if not expected.is_file():
        raise RuntimeError(f"Godot archive did not contain {executable_relative}.")
    return extracted, executable_relative


def _stage_godot_runtime(staging: Path, system_name: str, machine: str) -> Path:
    extracted, executable_relative = _download_godot_release(system_name, machine)
    runtime_target = staging / "godot-runtime"
    runtime_target.mkdir(parents=True, exist_ok=True)
    engine_path = runtime_target / executable_relative
    engine_path.parent.mkdir(parents=True, exist_ok=True)
    if system_name == "Darwin":
        shutil.copytree(
            extracted / "Godot.app",
            runtime_target / "Godot.app",
            symlinks=True,
        )
    else:
        shutil.copy2(extracted / executable_relative, engine_path)
        if system_name != "Windows":
            engine_path.chmod(engine_path.stat().st_mode | 0o111)
    with urllib.request.urlopen(
        f"https://raw.githubusercontent.com/godotengine/godot/{GODOT_VERSION}-stable/LICENSE.txt",
        timeout=30,
    ) as response:
        (runtime_target / "LICENSE.txt").write_text(
            response.read().decode("utf-8"), encoding="utf-8"
        )
    return engine_path


def _smoke_test_godot(engine: Path, project: Path) -> None:
    """Import assets into the release project, then verify the paired runtime."""
    with tempfile.TemporaryDirectory(prefix="salaryman-godot-smoke-") as temp:
        subprocess.run(
            [str(engine), "--headless", "--editor", "--path", str(project), "--quit"],
            cwd=project,
            check=True,
            timeout=240,
        )
        imported_assets = project / ".godot" / "imported"
        if not imported_assets.is_dir() or not any(imported_assets.iterdir()):
            raise RuntimeError(
                "Godot did not create the imported asset cache required by the release."
            )
        subprocess.run(
            [str(engine), "--headless", "--path", str(project), "--quit-after", "8"],
            cwd=project,
            check=True,
            timeout=120,
        )
        paired_smoke = subprocess.run(
            [
                sys.executable,
                str(ROOT / "main.py"),
                "--headless",
                "--paired-smoke",
                "--frames",
                "1800",
                "--godot-executable",
                str(engine),
                "--godot-project",
                str(project),
                "--save-file",
                str(Path(temp) / "office-save.json"),
            ],
            cwd=ROOT,
            check=False,
            timeout=120,
            capture_output=True,
            text=True,
        )
        if paired_smoke.returncode != 0:
            raise RuntimeError(
                "The packaged Python/Godot smoke test failed:\n"
                + "\n".join((paired_smoke.stdout + paired_smoke.stderr).splitlines()[-80:])
            )
        critical_markers = (
            "SCRIPT ERROR:",
            "Parse Error:",
            "ERROR: Failed loading resource",
            "ERROR: Cannot open file",
        )
        critical_errors = [
            line
            for line in (paired_smoke.stdout + paired_smoke.stderr).splitlines()
            if any(marker in line for marker in critical_markers)
        ]
        if critical_errors:
            raise RuntimeError(
                "The packaged Python/Godot smoke test logged runtime errors:\n"
                + "\n".join(critical_errors[-80:])
            )


def write_release_launchers(staging: Path, system_name: str) -> None:
    """Add portable launch/install helpers to the extracted release."""

    if system_name == "Windows":
        launcher = staging / "START-SALARYMAN.cmd"
        launcher.write_text(
            '@echo off\r\n'
            'set "ROOT=%~dp0"\r\n'
            '"%ROOT%pygame\\SALARYMAN Office.exe" %*\r\n',
            encoding="utf-8",
        )
        return

    launcher = staging / "launch-salaryman-office.sh"
    launch_command = (
        'open "$ROOT/pygame/SALARYMAN Office.app" --args "$@"'
        if system_name == "Darwin"
        else 'exec "$ROOT/pygame/SALARYMAN Office" "$@"'
    )
    launcher.write_text(
        f"""#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
{launch_command}
""",
        encoding="utf-8",
    )
    launcher.chmod(0o755)

    if system_name == "Linux":
        easy_launcher = staging / "START-SALARYMAN"
        easy_launcher.write_text(launcher.read_text(encoding="utf-8"), encoding="utf-8")
        easy_launcher.chmod(0o755)

    if system_name != "Linux":
        return

    installer = staging / "install-desktop.sh"
    installer.write_text(
        """#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DATA_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}
ICON_DIR="$DATA_HOME/icons/hicolor/512x512/apps"
APPLICATION_DIR="$DATA_HOME/applications"
ICON_PATH="$ICON_DIR/salaryman-office.png"
DESKTOP_PATH="$APPLICATION_DIR/salaryman-office.desktop"

mkdir -p "$ICON_DIR" "$APPLICATION_DIR"
cp "$ROOT/branding/salaryman-office.png" "$ICON_PATH"
cat > "$DESKTOP_PATH" <<EOF
[Desktop Entry]
Type=Application
Name=SALARYMAN Office
Comment=Run the SALARYMAN desktop office
Exec="$ROOT/launch-salaryman-office.sh"
Icon=$ICON_PATH
Terminal=false
Categories=Office;Business;Finance;
EOF
chmod 644 "$DESKTOP_PATH"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPLICATION_DIR" >/dev/null 2>&1 || true
fi

printf 'Installed SALARYMAN Office launcher: %s\n' "$DESKTOP_PATH"
printf 'Installed SALARYMAN Office icon: %s\n' "$ICON_PATH"
""",
        encoding="utf-8",
    )
    installer.chmod(0o755)


def main() -> int:
    pyinstaller = shutil.which("pyinstaller")
    if pyinstaller is None:
        print("PyInstaller is not installed. Run: pip install -e '.[desktop-build]'", file=sys.stderr)
        return 2

    if not ICON_SOURCE.exists():
        print(f"Branding icon was not found: {ICON_SOURCE}", file=sys.stderr)
        return 2
    if not PIXEL_ASSET_SOURCE.exists():
        print(f"Pixel art assets were not found: {PIXEL_ASSET_SOURCE}", file=sys.stderr)
        return 2
    if not FLOOR_PLAN_SOURCE.exists():
        print(f"Office floor plan was not found: {FLOOR_PLAN_SOURCE}", file=sys.stderr)
        return 2

    system_name = platform.system()
    name = EXECUTABLE_NAME
    command = [
        pyinstaller,
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        name,
        "--distpath",
        str(DIST),
        "--workpath",
        str(ROOT / "build" / "pyinstaller"),
        "--exclude-module",
        "pkg_resources",
        "--exclude-module",
        "setuptools",
        "--add-data",
        f"{PIXEL_ASSET_SOURCE}{os.pathsep}pixel-agents",
        "--add-data",
        f"{FLOOR_PLAN_SOURCE}{os.pathsep}godot/office-client",
        str(ROOT / "main.py"),
    ]
    print(f"Building {name} for {system_name}...")
    # Linux uses the separate branded PNG installer. macOS and Windows need
    # platform-native icon formats, which are not checked into this repo yet.
    subprocess.run(command, cwd=ROOT, check=True)
    bundle_source = DIST / (f"{name}.app" if system_name == "Darwin" else name)
    if not bundle_source.exists():
        print(f"Expected application bundle was not created: {bundle_source}", file=sys.stderr)
        return 3

    system_slug = {"Darwin": "macos", "Windows": "windows", "Linux": "linux"}.get(
        system_name,
        system_name.lower(),
    )
    machine_slug = {
        "amd64": "x86_64",
        "x86_64": "x86_64",
        "arm64": "arm64",
        "aarch64": "arm64",
    }.get(platform.machine().lower(), platform.machine().lower())
    bundle_name = f"salaryman-office-{system_slug}-{machine_slug}"
    staging_root = ROOT / "build" / "release"
    staging = staging_root / bundle_name
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    pygame_target = (
        staging / "pygame" / bundle_source.name
        if system_name == "Darwin"
        else staging / "pygame"
    )
    shutil.copytree(bundle_source, pygame_target)
    godot_bundle = staging / "godot-office-client"
    shutil.copytree(
        ROOT / "godot" / "office-client",
        godot_bundle,
        ignore=shutil.ignore_patterns(".godot", "*.uid"),
    )
    callhome_assets = ROOT / "artifacts" / "interview-helper" / "public" / "callhome"
    packaged_callhome = godot_bundle / "callhome"
    packaged_callhome.mkdir(parents=True, exist_ok=True)
    for track_id in (11, 17):
        track_name = f"track-{track_id:02d}.mp3"
        track_source = callhome_assets / track_name
        if not track_source.is_file():
            raise RuntimeError(f"Desktop release is missing soundtrack asset {track_name}.")
        shutil.copy2(track_source, packaged_callhome / track_name)
    missing_godot_files = [
        path for path in REQUIRED_GODOT_FILES if not (godot_bundle / path).exists()
    ]
    if missing_godot_files:
        raise RuntimeError(
            "Godot bundle is missing required runtime assets: "
            + ", ".join(missing_godot_files)
        )
    godot_engine = _stage_godot_runtime(staging, system_name, platform.machine().lower())
    (staging / "salaryman-game.json").write_text(
        json.dumps(
            {
                "godotExecutable": godot_engine.relative_to(staging).as_posix(),
                "godotProject": "godot-office-client",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    _smoke_test_godot(godot_engine, godot_bundle)
    branding = staging / "branding"
    branding.mkdir()
    shutil.copy2(ICON_SOURCE, branding / "salaryman-office.png")
    write_release_launchers(staging, system_name)
    run_command = (
        "./launch-salaryman-office.sh"
        if system_name != "Windows"
        else r".\START-SALARYMAN.cmd"
    )
    run_instructions = {
        "Linux": """No Docker is required. Extract the archive, open its folder,
and double-click `START-SALARYMAN`. If your Linux file manager asks, choose
**Run** or **Allow Launching**.""",
        "Darwin": """No Docker, Python, or separate Godot installation is
required. Extract the archive and double-click `pygame/SALARYMAN Office.app`.
If macOS blocks the
first launch, Control-click the app, choose **Open**, then confirm **Open**.""",
        "Windows": """No Docker, Python, or separate Godot installation is
required. Extract the
archive and double-click `START-SALARYMAN.cmd`. If Windows Defender SmartScreen
appears for this unsigned test build, choose **More info**, then **Run anyway**.""",
    }.get(system_name, "Extract the archive and run the packaged application.")
    optional_installer = (
        """
## Add a branded desktop launcher (Linux)

From this directory:

```bash
./install-desktop.sh
```

This installs a SALARYMAN Office application shortcut and icon into your
user-local desktop applications folder. Keep this extracted directory in place
after installing the shortcut.
"""
        if system_name == "Linux"
        else ""
    )
    (staging / "README.md").write_text(
        f"""# SALARYMAN Office ({system_name} / {platform.machine()})

## Run the desktop app

{run_instructions}

You can also launch it from a terminal opened in this directory:

```bash
{run_command}
```

SALARYMAN OS opens the Godot game as its player-facing window and runs the
Python simulation as its hidden, authoritative companion for finance, workers,
interactions, and persistent state. Both runtimes are bundled and shut down
together; no separate Godot installation is required.
{optional_installer}

## Runtime layout

`pygame/` contains the launcher and simulation, `godot-runtime/` contains the
matching Godot engine, and `godot-office-client/` contains the game client. Start
SALARYMAN OS using the launcher above; it opens both components and shuts down
the pair together.

Godot is distributed under the MIT license; see `godot-runtime/LICENSE.txt`.
""",
        encoding="utf-8",
    )
    RELEASES.mkdir(parents=True, exist_ok=True)
    archive_base = RELEASES / bundle_name
    archive_format = "zip" if system_name in {"Darwin", "Windows"} else "gztar"
    archive = Path(shutil.make_archive(str(archive_base), archive_format, staging_root, bundle_name))
    print(f"Build complete: {bundle_source}")
    print(f"Download archive: {archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())