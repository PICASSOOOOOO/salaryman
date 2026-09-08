"""Build the SALARYMAN office client for the current desktop OS.

Usage:
    python scripts/build_desktop.py

Install the optional builder first:
    pip install -e '.[desktop-build]'
"""

from __future__ import annotations

import platform
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist" / "salaryman-office"
RELEASES = ROOT / "dist" / "releases"
ICON_SOURCE = ROOT / "artifacts" / "interview-helper" / "public" / "icon-512.png"
PIXEL_ASSET_SOURCE = ROOT / "artifacts" / "interview-helper" / "public" / "pixel-agents"
FLOOR_PLAN_SOURCE = ROOT / "godot" / "office-client" / "floor_plan.json"
EXECUTABLE_NAME = "SALARYMAN Office"


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
    required_godot_files = (
        "project.godot",
        "Main.tscn",
        "main.gd",
        "floor_plan.json",
        "agentshire-assets/characters/character-male-a.glb",
        "agentshire-assets/furniture/couch.gltf",
        "pixel-agents/assets/characters/char_0.png",
    )
    missing_godot_files = [
        path for path in required_godot_files if not (godot_bundle / path).exists()
    ]
    if missing_godot_files:
        raise RuntimeError(
            "Godot bundle is missing required runtime assets: "
            + ", ".join(missing_godot_files)
        )
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
        "Darwin": """No Docker or Python installation is required. Extract the
archive and double-click `pygame/SALARYMAN Office.app`. If macOS blocks the
first launch, Control-click the app, choose **Open**, then confirm **Open**.""",
        "Windows": """No Docker or Python installation is required. Extract the
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

The Pygame office simulation is authoritative and works without Godot.
{optional_installer}

## Optional Godot renderer

Start the Pygame app with its bridge enabled, then open
`godot-office-client` in Godot 4:

```bash
{run_command} --bridge-port 4242
godot --path godot-office-client
```

The Godot client is an optional renderer and input surface. It does not own
FIAT, workers, persistence, or office rules.
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