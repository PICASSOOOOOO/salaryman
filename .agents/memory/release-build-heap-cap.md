---
name: Release build heap cap
description: Workspace-specific memory constraint for the full modern and legacy frontend build.
---

Run the SALARYMAN release build with a 3 GiB Node old-space cap and `build.terserOptions.maxWorkers: 1`. Legacy chunks go through Terser, whose worker pool otherwise defaults to CPU count minus one.

**Why:** A production build exited 137 during chunk rendering with the default worker pool. Limiting Terser to one worker let the full modern+legacy build and metadata prerender complete under the existing 3 GiB cap. Vite/Rollup and workers also use memory outside V8 old space, so the heap cap alone is not a guarantee. A tool-managed `setsid` command can also report the launcher’s exit before its detached build child finishes.

**How to apply:** Keep the heap cap in the package's standard build command and keep Terser to one worker so local validation and release automation use the same resource-safe path. If a capped build still exits 137, do not raise the heap or retry blindly; first ensure container memory headroom and run one build at a time. Do not remove legacy rendering or prerendering as a workaround. For long builds, prefer a tracked background command plus a completion monitor; if using a detached `setsid` child, write and poll an explicit exit marker, then confirm the output timestamps are fresh.