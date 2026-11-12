# Contributing to SALARYMAN

SALARYMAN source code is licensed under GPL-3.0-only. Contributions to the
project must be compatible with that license.

## Before opening a change

- Search the existing code and issues before duplicating a feature.
- Keep changes focused and include tests for behavior that can affect game
  state, permissions, saves, or money.
- Run the relevant package checks. The workspace-wide TypeScript check is
  `pnpm run typecheck`; Python game tests use `python -m unittest`.
- Do not commit credentials, private user data, generated release packages, or
  files copied from another project without permission.
- For art, audio, fonts, and other assets, record the creator/source and the
  exact license. Keep any required attribution with the asset.

## Game feature packages

The version 1 package contract is in `docs/modding/`. It is a design contract,
not yet an upload or installation service. A package may contain declared
content and settings only; it must not contain scripts, native binaries,
firmware images, or a server feature that runs uploaded code.

To rewrite a feature for a personal system, fork this GPL-licensed repository,
make the source changes, and build your own copy. Do not use a client mod to
bypass server-owned permissions, inventory, finance, or multiplayer rules.
Changes that affect shared gameplay need explicit server-side support and
version compatibility.

## Security and review

Treat all mod archives and assets as untrusted. Do not execute them while
reviewing. Public listing requires compatibility, licensing, integrity, and
security checks; a successful format check alone is not an endorsement.
