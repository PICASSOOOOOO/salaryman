---
name: Unreal render backend activation
description: How the cloud UE5 render backend turns on, why a placeholder URL is harmful, and where the project secret inventory lives.
---

# Unreal (UE5) render backend activation

The `unreal` art provider + HTTP client + contract are fully built and tested
against a mock (`unreal-render.test.ts`, 17 tests cover submit/poll/ingest for
image+video, statusUrl override, outage classification, graceful fallback). The
only missing piece is a real cloud GPU node — Replit has no GPU, so that node must
be stood up externally by the owner.

**Activation is zero-touch and gated only on a secret.** The registry
(`art-providers/index.ts`) routes per art-row `backend` id and calls
`isConfigured()` live (`Boolean(process.env.UNREAL_RENDER_URL)`). The instant a
real `UNREAL_RENDER_URL` (+ optional `UNREAL_RENDER_KEY`) is added via the Secrets
tab, the backend becomes selectable — no code change, no redeploy.

**Why NOT to pre-seed a placeholder URL:** any non-empty `UNREAL_RENDER_URL` makes
the provider report `configured: true` in the admin backend picker, so a selected
render fails against a dead endpoint. The correct "set up later" posture is to
leave the slot empty (pipeline falls back to Nano Banana cleanly) until a real node
exists. So there is no safe placeholder value — just add the real one when ready.

**Project secret inventory** (what unlocks what, configured vs dormant) lives at
`artifacts/api-server/docs/required-secrets.md`. The default art backend is Nano
Banana; `fal` and `unreal` are alternates.
