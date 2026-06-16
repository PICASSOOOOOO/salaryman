---
name: Art Factory pluggable backends
description: How the SALARYMAN art pipeline routes to swappable generation backends and the one style-consistency rule that must hold across all of them.
---

# Art Factory — pluggable art-generation backends

The art pipeline (api-server `routes/art-assets.ts`) renders through a provider
registry (`lib/art-providers/`), not a single hardcoded generator. Each backend
implements one interface: `id/label/description/isConfigured()/start()/poll()`.
Registered: `nano-banana` (default, wraps existing createImageTask byte-identical),
`fal` (FLUX via fal.ai, gated on FAL_KEY), `unreal` (inert documented stub, always
isConfigured()=false). The asset row carries `backend` + `backendMeta` (JSON poll
state) so poll() survives restarts.

**Clean fallback rule:** `kickoff()` calls `getProvider(asset.backend)`; if that
provider `!isConfigured()` it leaves the row untouched (client shows placeholder),
exactly mirroring the original "Nano Banana not configured" behavior. So with no
extra keys set, everything keeps working on Nano Banana. `getProvider()` also falls
back to the default for unknown ids.

**Style-consistency invariant (owner hard requirement — "all art must look
synonymous"):** every backend renders the SAME baked style string from
`composeSalarymanPrompt(subject)` — `kickoff` passes `asset.prompt` verbatim to
`provider.start()`. A provider must NEVER inject its own style. Mixing engines
(Nano Banana / fal / future Unreal) must not produce a mixed look. The optional
polish pass (`lib/art-polish.ts`: upscale / bg-remove via fal) is the fidelity
equalizer on top.

**Why:** the owner wants to mix engines/APIs (incl. a future self-hosted Unreal
render node) but keep one polished, upgraded, synonymous look, and wants those
assets to eventually feed property templates + the debtor/dev/tester construction-
labor pipeline so players can add objects to their builds. The single shared prompt
is the lever that makes mixed-engine output stay on-style.

**How to apply:** adding a backend = new provider file + register in
`art-providers/index.ts`; it inherits the shared prompt automatically. Don't add a
per-backend style. Admin surface: owner-gated `/profile/admin/art`
(`interview-helper/src/pages/ArtLibrary.tsx`) → GET /art/providers, regenerate
accepts `{backend}` (works on dynamic no-kit rows too), POST /art/asset/:key/polish.
Dev api-server runs plain tsx with NO watch — restart the workflow to load changes.
