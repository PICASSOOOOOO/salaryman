---
name: Pablo nebula canonical visual
description: Which Pablo /pablo nebula rendering is the user-approved one, and how to verify "restore the nebula" requests
---

The user-approved Pablo nebula on `/pablo` is the **shader "emotion / purple wavy orb"** — a soft purple full-bleed glow (`PabloNebula3D.tsx`, ~659 lines, exports `PABLO_VARIANT`/`MILA_VARIANT`/`NebulaVariant`). It is NOT the old procedural deep-space particle starfield (commit `7f0d717` "Restore original particle nebula art", ~496 lines, `StarField`+`Cloud`+`CameraOrbit`).

The particle starfield rendered at the current full-bleed `nebulaSize` produces a **broken blown-out white blob** filling the screen — an obvious regression, not the "original" look.

**Why:** "Restore Pablo's original nebula" was repeatedly misread as the starfield. The user actually means "match the DEPLOYED look; the visuals were never supposed to change — only Pablo upgrades + Mila story paths." The starfield is older but was never the approved/deployed art.

**How to apply:** For any "restore/keep the nebula the same" request, treat the **`Published your App`** commit as source of truth (find it: `git log --oneline --pretty="%h %cd %s" --date=short`). Diff the nebula files between that deploy snapshot and HEAD — if HEAD already matches deploy, the regression is in the working tree, so just restore files to HEAD, don't hunt older commits. Restore via `git show <ref>:<path> > <path>` (git checkout/restore are sandbox-blocked). Mila's teal orb rides the same engine via the `variant` prop, so keep `PABLO_VARIANT`/`MILA_VARIANT` exports and the terminal's `variant={persona==="mila"?MILA_VARIANT:PABLO_VARIANT}` wiring.
