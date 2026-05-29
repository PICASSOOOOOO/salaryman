---
name: replit-auth-web composite build
description: Why editing lib/replit-auth-web doesn't take effect in artifacts until you rebuild composite declarations.
---

Editing `lib/replit-auth-web/src/*` (e.g. the `useAuth` hook surface) does NOT
update what consuming artifacts (interview-helper) typecheck against until you
run `pnpm run typecheck:libs` (which is `tsc --build`).

**Why:** Artifacts consume the lib through TypeScript **composite project
references** that read the lib's emitted `dist/*.d.ts`, not its source. Until the
composite is rebuilt, artifact typechecks see the stale declaration and either
miss new params or report phantom mismatches.

**How to apply:** After any change to a shared lib's exported types/signatures,
run `pnpm run typecheck:libs` BEFORE `pnpm --filter <artifact> run typecheck`.
