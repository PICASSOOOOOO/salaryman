# SALARYMAN mod package contract

This document defines the first portable format for community-created
SALARYMAN content. The GitHub repository is already public, so contributors
can fork and rebuild the game today. The package browser, upload review service,
and in-game mod station are **not implemented yet**.

## Two ways to customize SALARYMAN

1. **Installable packages** use the version 1 manifest in
   `mod-package.schema.json`. They can provide declared content, presets, and
   supported settings. The format does not allow executable scripts or native
   binaries.
2. **Personal code changes** are made in a user's own GPL-compatible source
   fork and built locally. This permits deeper feature rewrites without running
   arbitrary uploaded code on SALARYMAN servers or on other players' devices.

“Firmware” in this project means installable game-feature add-ons, such as 1999
presets or custom industry content. It does not mean physical-device firmware.

## Package contents

A version 1 archive contains `mod.json` and only the files listed in its
`files` array. File paths are relative to the archive root. Packages must not
contain absolute paths, parent-directory traversal, symlinks, executable code,
native libraries, or unlisted files. The eventual installer must enforce those
rules while extracting; validating `mod.json` alone is not sufficient.

Each file entry includes a SHA-256 digest. The digest detects accidental or
post-review changes; it is not a publisher signature. A future catalog must
keep uploads quarantined until format, compatibility, malware, and asset-rights
checks have completed.

The initial target identifiers are `salaryman-desktop` and `1999`. More targets
must be added only when their loaders support the relevant capability.

## Multiplayer and server authority

Client-side packages may change local presentation and user-owned presets. They
must not grant permissions, mint currency, change shared inventory, alter
authoritative simulation results, or run server commands. Any multiplayer
gameplay extension needs explicit server-side support, version checks, and an
opt-in policy for the affected session.

## External mod platforms

The package format is provider-neutral so a release can be distributed through
Nexus Mods/Vortex or mod.io without making those services part of the runtime.
No Nexus Mods, Vortex, or mod.io integration is implemented yet. Nexus/Vortex
deployment support and mod.io catalog/API support require separate adapters,
testing, and any provider credentials or approvals they require.

## Current status

- Public GitHub source and local forks: available.
- GPL-3.0-only source license: already present; the root README now agrees.
- Version 1 manifest contract: documented here.
- Package validation, upload quarantine, review tooling, catalog, installation,
  rollback, and in-game station: not yet implemented.
- Nexus Mods/Vortex and mod.io adapters: not yet implemented.
