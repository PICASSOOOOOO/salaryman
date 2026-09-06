---
name: Desktop release packaging
description: PyInstaller and Linux launcher constraints for the SALARYMAN desktop bundle.
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