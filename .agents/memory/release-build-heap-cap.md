---
name: Release build heap cap
description: Workspace-specific memory constraint for the full modern and legacy frontend build.
---

Run the SALARYMAN release build with a 3 GiB Node old-space cap rather than leaving V8 unbounded.

**Why:** The unbounded Vite build is killed with exit 137 during chunk rendering after transforming all modules. Disabling minification does not solve it and can exhaust enough memory to stop workspace services. A 3072 MiB cap forces earlier garbage collection and completes both modern and legacy output plus metadata prerendering.

**How to apply:** Keep the heap cap in the package's standard build command so local validation and release automation use the same resource-safe path. Do not remove legacy rendering or prerendering as a workaround.