---
name: Release build heap cap
description: Workspace-specific memory constraint for the full modern and legacy frontend build.
---

Run the SALARYMAN release build with a 3 GiB Node old-space cap rather than leaving V8 unbounded.

**Why:** The unbounded Vite build is killed with exit 137 during chunk rendering after transforming all modules. Disabling minification does not solve it and can exhaust enough memory to stop workspace services. A 3072 MiB cap has completed the full build before, but it is not a guarantee: Vite/Rollup and workers also use memory outside V8 old space, and container-level pressure can still SIGKILL the build.

**How to apply:** Keep the heap cap in the package's standard build command so local validation and release automation use the same resource-safe path. If a capped build still exits 137, do not keep raising the heap or retrying blindly; first ensure container memory headroom and run one build at a time. Do not remove legacy rendering or prerendering as a workaround.