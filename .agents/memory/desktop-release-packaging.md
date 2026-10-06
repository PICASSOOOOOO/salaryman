---
name: Desktop release packaging
description: PyInstaller, Linux launcher, and macOS app-bundle constraints for the SALARYMAN desktop bundle.
---

PyInstaller can auto-add a `pkg_resources` runtime hook even when the desktop
runtime does not need packaging metadata; exclude `pkg_resources` and
`setuptools` from the application bundle. Linux builds do not support
PyInstaller executable icons, so ship the branded PNG separately and install a
desktop entry with an absolute icon path.

**Why:** The generated Linux bundle previously failed before application startup
because the hook imported an unavailable optional `jaraco` dependency, and a
relative launcher path did not match the one-folder layout.

**How to apply:** Smoke-test the archive from a clean extraction, launch with
`--headless --frames 3 --no-bridge`, and test the Linux installer with an
isolated `XDG_DATA_HOME` before presenting the archive.

Any data file opened through a source-relative filesystem path must also be
declared as PyInstaller data at the matching packaged path.

**Why:** A package can build successfully yet crash before startup when a shared
runtime file exists in the source tree but not inside PyInstaller's `_internal`
directory.

**How to apply:** Always smoke-test the newly created archive after extracting
it outside the repository; never treat a successful PyInstaller build as proof
that runtime assets were included.

macOS builds produce a `.app` bundle and should ship as a `.zip`; the extracted
launcher must use `open ...app --args` rather than treating the app as a Linux
executable directory. The Pygame UI should choose a native readable fallback
font instead of assuming DejaVu Sans exists.

**Why:** PyInstaller packaging is target-OS-specific, and the macOS bundle
layout plus available system fonts differ from Linux.

**How to apply:** Build and smoke-test macOS on macOS; the Linux environment can
only validate the launcher template and shared source behavior.

## Supported-platform priorities

macOS is the first user test target, while Windows remains required. Preserve
Linux compatibility for now; discontinuing Linux is conditional on it adding
substantial separate workload, not an approved removal.

**Why:** The user said all platforms must work, selected macOS for their testing,
and would discontinue Linux if it doubles the workload.

**How to apply:** Share game code and assets across platforms, prioritize the
macOS test release, and distinguish automated native checks from real-device
playtesting. Do not remove Linux support without discussing the actual extra
maintenance cost with the user.