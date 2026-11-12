---
name: Scoped package installs
description: Fallback when the package installer targets the pnpm monorepo root instead of an artifact package.
---

When the generic package-install helper runs `pnpm add` at the workspace root, pnpm can reject it with `ERR_PNPM_ADDING_TO_ROOT`. After that failure, scope the install to the intended package, for example `pnpm --filter @workspace/api-server add <packages>`; use `-D` for development-only packages.

**Why:** In this pnpm monorepo, the generic helper does not infer which leaf workspace owns a dependency, and silently adding to root would broaden the dependency scope.

**How to apply:** Use the package-management helper first; only switch to a package-filtered pnpm command when the helper reports the root-workspace guard.