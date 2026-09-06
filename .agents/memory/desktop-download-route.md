---
name: Desktop download route
description: Public desktop archive downloads must resolve release files from both workspace-root and package working directories.
---

The API download route should resolve fixed release artifacts from both the repository root and the package working directory.

**Why:** pnpm filtered workflows can run with `artifacts/api-server` as the current directory, while the generated desktop archive lives at the workspace root under `dist/releases`.

**How to apply:** Use fixed candidate paths and return an explicit unavailable response when the release artifact is absent; never accept a user-controlled file path.