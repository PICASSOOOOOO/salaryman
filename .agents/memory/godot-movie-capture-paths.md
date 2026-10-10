---
name: Godot movie capture paths
description: Where Godot CLI movie outputs are resolved when the project is nested in the workspace.
---

When `godot --path <project> --write-movie <relative-path>` is used, Godot resolves the movie path under the selected project root rather than the shell's working directory. A workspace-relative output path can therefore fail to open even when its parent directory exists from the shell.

**Why:** A capture failed because a workspace-level generated-artifact directory was interpreted beneath the nested Godot project.

**How to apply:** Use a path relative to the selected project (for example, `../../generated-artifacts/...` for a project two directories deep) or an absolute workspace path. Keep final media in an ignored generated-output directory and remove intermediate formats after verifying the conversion.
