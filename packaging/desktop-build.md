# SALARYMAN desktop builds

The office client is a native Pygame application. It is intentionally separate
from the React web runtime and never connects directly to PostgreSQL.

## Local build

From the repository root:

```bash
python -m pip install -e '.[desktop-build]'
python scripts/build_desktop.py
```

The build creates both a runnable folder under `dist/salaryman-office/` and a
downloadable archive under `dist/releases/`. The archive includes the Pygame
desktop client, its runtime libraries, and the optional Godot office-client
project. It also includes the SALARYMAN icon, a portable
`launch-salaryman-office.sh` entrypoint, and a Linux
`install-desktop.sh` helper for installing a branded application shortcut.

The command is platform-neutral and produces a windowed build for the operating
system where it runs:

- Windows: `.exe` application bundle
- macOS: `.app` application bundle
- Linux: executable application directory

Build each target on that target operating system. PyInstaller does not produce
portable Windows/macOS/Linux binaries from one host.

The macOS build is packaged as a `.app` inside a `.zip` archive. Run
`./launch-salaryman-office.sh` after extraction; it opens the app bundle with
macOS's native launcher. The Pygame UI selects Inter, Helvetica Neue, Arial, or
DejaVu Sans in that order, so it does not depend on a Linux-only font.

On Linux, no Docker is required. Extract the archive and double-click
`START-SALARYMAN` (choose **Run** or **Allow Launching** if prompted), or run
`./START-SALARYMAN` from a terminal. Run `./install-desktop.sh` from the
extracted release to install the desktop menu entry and icon. Keep the
extracted release directory in place after installation because the shortcut
launches the app from that directory.

## Runtime boundary

The Pygame client owns the office simulation, finance view, worker cards, and
game information. The web app remains the authenticated control plane for
banking, business tools, documents, COMMS, and the phone system. Live phone
audio stays in the browser/Twilio surface so microphone permissions and call
rollback remain reliable.