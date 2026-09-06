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
project.

The command is platform-neutral and produces a windowed build for the operating
system where it runs:

- Windows: `.exe` application bundle
- macOS: `.app` application bundle
- Linux: executable application directory

Build each target on that target operating system. PyInstaller does not produce
portable Windows/macOS/Linux binaries from one host.

## Runtime boundary

The Pygame client owns the office simulation, finance view, worker cards, and
game information. The web app remains the authenticated control plane for
banking, business tools, documents, COMMS, and the phone system. Live phone
audio stays in the browser/Twilio surface so microphone permissions and call
rollback remain reliable.