# Cloud Unreal Render Node — HTTP Contract

This is the contract the cloud Unreal Engine 5 render harness (headless / Movie
Render Queue, running on a GPU instance) **must** implement so SALARYMAN can drive
it as an art backend. SALARYMAN owns the *brain* (submit jobs, poll status, ingest
results); the GPU box owns the *render*.

Replit cannot run Unreal Engine (no GPU). The pipeline talks to the node only over
the HTTP endpoints below — the SALARYMAN side (`artifacts/api-server/src/lib/
unreal-render.ts` + the `unreal` art provider) is already built and tested against
a mock of this contract. Stand up a node that honors it and it plugs in with **no
pipeline changes**.

## Connection / config

SALARYMAN reads two environment values (requested via the environment-secrets flow):

| Env var             | Required | Purpose                                                        |
| ------------------- | -------- | ------------------------------------------------------------- |
| `UNREAL_RENDER_URL` | yes      | Base URL of the render node, e.g. `https://render.example.com` |
| `UNREAL_RENDER_KEY` | no       | Bearer token; sent as `Authorization: Bearer <key>` when set  |

When `UNREAL_RENDER_URL` is unset the `unreal` provider reports **not configured**.
Unpinned assets can continue using the default backend (Nano Banana), but an
asset explicitly pinned to Unreal fails clearly rather than silently changing
renderer or visual style.

**Activation is zero-touch:** `isConfigured()` is read live, so the moment a real
`UNREAL_RENDER_URL` is added (Secrets tab) the `unreal` backend becomes selectable
— no code change or redeploy. Do **not** pre-seed a placeholder/fake URL: any
non-empty value flips the provider to "configured" and a selected render would fail
against a dead endpoint. See [`required-secrets.md`](./required-secrets.md) for the
full secret inventory.

## Auth

Every request includes (only when a key is configured):

```
Authorization: Bearer <UNREAL_RENDER_KEY>
Content-Type: application/json
```

The node should reject missing/invalid tokens with `401`/`403`.

## 1. Submit a render — `POST {UNREAL_RENDER_URL}/render`

Request body:

```jsonc
{
  "prompt": "<baked SALARYMAN style string>",  // render VERBATIM, see Style below
  "aspectRatio": "16:9",                        // legacy "W:H" string (1:1, 3:4, …)
  "jobType": "object",                          // "object" | "landscape" | "cinematic"
  "key": "scene_office"                          // asset key, for your logging only
}
```

Success response (HTTP `200`/`202`):

```jsonc
{
  "jobId": "abc123"          // REQUIRED. Aliases accepted: "job_id", "id"
  // "statusUrl": "https://…" // OPTIONAL absolute poll URL override
}
```

If `statusUrl` is omitted, SALARYMAN polls `GET {UNREAL_RENDER_URL}/render/{jobId}`.

## 2. Poll a render — `GET {UNREAL_RENDER_URL}/render/{jobId}`

Response while running:

```jsonc
{ "status": "queued" }       // or "rendering" / "in_progress"
```

Response when finished:

```jsonc
{
  "status": "completed",                // aliases: "complete","success","succeeded","done"
  "resultUrls": ["https://cdn/out.mp4"],// REQUIRED on success (>=1 public URL)
  "mediaType": "video"                  // OPTIONAL "image" | "video" (inferred otherwise)
}
```

Response on failure:

```jsonc
{
  "status": "failed",          // aliases: "fail", "error"
  "error": "scene asset missing" // human-readable reason
}
```

### Accepted result shapes

`resultUrls` (array) is preferred. SALARYMAN also accepts, in priority order:
`videoUrl`, `imageUrl`, `url` (single strings), or `urls` (array). The **first**
URL becomes the asset's primary URL; the rest are kept as the result set.

### Media type

If `mediaType` is omitted it is inferred from the URL extension
(`.mp4/.webm/.mov/.m4v` ⇒ `video`; `.png/.jpg/.webp/.gif` ⇒ `image`) and finally
from `jobType` (`cinematic` ⇒ `video`, else `image`). Always returning an explicit
`mediaType` is recommended.

## Result URL format

Each result URL must be a **public, directly-loadable HTTPS URL** the game can put
in an `<img>` or `<video>` tag:

- `object` / `landscape` → a still image (`png`/`jpg`/`webp`).
- `cinematic` → a single encoded video (`mp4`/`webm`). For a frame *sequence*,
  encode it to one video and return that URL. (Multiple still URLs are also
  accepted — the first is used as primary.)

## Job types

| jobType      | Render recipe (node-side)                                  | Result      |
| ------------ | --------------------------------------------------------- | ----------- |
| `object`     | Single prop/object centred on the dark SALARYMAN backdrop | image       |
| `landscape`  | Wide environment / building / scene                       | image       |
| `cinematic`  | Movie Render Queue sequence → encoded clip                | video       |

## Style constraint — "all art must look synonymous"

The `prompt` SALARYMAN sends is already the fully-baked SALARYMAN style string
(`composeSalarymanPrompt`), **identical** to what the hosted backends receive. The
node MUST render that prompt's look and **must not** inject an Unreal-specific
style. Mixing engines must never produce a mixed look. The optional polish pass
(upscale / background-remove) is the fidelity equalizer.

## Outage behavior

`402` / `429` / `5xx` responses, or network failures (connection refused, DNS,
timeout, "gpu busy/unavailable", "node offline", "overloaded"), are classified as a
node **outage** — SALARYMAN surfaces a calm "render node offline" failure rather
than treating it as a bad prompt. Transient blips during polling are retried.

## Timeouts

- Per-HTTP-request timeout: 30s (submit & each poll).
- Overall job budget (synchronous helper): 10 minutes, polled every 4s. The
  asynchronous art-route path persists the job handle, so a render can outlive a
  server restart and resume polling.
