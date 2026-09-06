"""Build the SALARYMAN office client for the current desktop OS.

Usage:
    python scripts/build_desktop.py

Install the optional builder first:
    pip install -e '.[desktop-build]'
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist" / "salaryman-office"
RELEASES = ROOT / "dist" / "releases"
ICON_SOURCE = ROOT / "artifacts" / "interview-helper" / "public" / "icon-512.png"
EXECUTABLE_NAME = "SALARYMAN Office"


def write_release_launchers(staging: Path) -> None:
    """Add portable launch/install helpers to the extracted release."""

    launcher = staging / "launch-salaryman-office.sh"
    launcher.write_text(
        """#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$ROOT/pygame/SALARYMAN Office/SALARYMAN Office" "$@"
""",
        encoding="utf-8",
    )
    launcher.chmod(0o755)

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
chmod 0o644 "$DESKTOP_PATH"

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
        "--icon",
        str(ICON_SOURCE),
        "--exclude-module",
        "pkg_resources",
        "--exclude-module",
        "setuptools",
        str(ROOT / "main.py"),
    ]
    print(f"Building {name} for {platform.system()}...")
    subprocess.run(command, cwd=ROOT, check=True)
    executable = DIST / name / name
    if not executable.exists():
        print(f"Expected executable was not created: {executable}", file=sys.stderr)
        return 3

    bundle_name = f"salaryman-office-{platform.system().lower()}-{platform.machine()}"
    staging_root = ROOT / "build" / "release"
    staging = staging_root / bundle_name
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    shutil.copytree(DIST / name, staging / "pygame")
    shutil.copytree(ROOT / "godot" / "office-client", staging / "godot-office-client")
    branding = staging / "branding"
    branding.mkdir()
    shutil.copy2(ICON_SOURCE, branding / "salaryman-office.png")
    write_release_launchers(staging)
    (staging / "README.md").write_text(
        f"""# SALARYMAN Office ({platform.system()} / {platform.machine()})

## Run the desktop app

From this directory:

```bash
./launch-salaryman-office.sh
```

The Pygame office simulation is authoritative and works without Godot.

## Add a branded desktop launcher (Linux)

From this directory:

```bash
./install-desktop.sh
```

This installs a SALARYMAN Office application shortcut and icon into your
user-local desktop applications folder. Keep this extracted directory in place
after installing the shortcut.

## Optional Godot renderer

Start the Pygame app with its bridge enabled, then open
`godot-office-client` in Godot 4:

```bash
./pygame/{name} --bridge-port 4242
godot --path godot-office-client
```

The Godot client is an optional renderer and input surface. It does not own
FIAT, workers, persistence, or office rules.
""",
        encoding="utf-8",
    )
    RELEASES.mkdir(parents=True, exist_ok=True)
    archive_base = RELEASES / bundle_name
    archive = Path(shutil.make_archive(str(archive_base), "gztar", staging_root, bundle_name))
    print(f"Build complete: {executable}")
    print(f"Download archive: {archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())