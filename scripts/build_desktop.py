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


def main() -> int:
    pyinstaller = shutil.which("pyinstaller")
    if pyinstaller is None:
        print("PyInstaller is not installed. Run: pip install -e '.[desktop-build]'", file=sys.stderr)
        return 2

    name = "SALARYMAN Office"
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
    (staging / "README.md").write_text(
        f"""# SALARYMAN Office ({platform.system()} / {platform.machine()})

## Run the desktop app

From this directory:

```bash
./pygame/{name}
```

The Pygame office simulation is authoritative and works without Godot.

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