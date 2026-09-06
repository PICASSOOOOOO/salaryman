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
    print(f"Build complete: {DIST / name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())