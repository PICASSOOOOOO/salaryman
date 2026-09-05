# Blender render-node contract

The SALARYMAN API can use a headless Blender node for deterministic game assets.
The node is configured with `BLENDER_RENDER_URL` and, optionally,
`BLENDER_RENDER_KEY`. It is selected as the `blender` art provider in the Art
Factory.

## Submit

```http
POST /render
Authorization: Bearer <BLENDER_RENDER_KEY>
Content-Type: application/json
```

```json
{
  "engine": "blender",
  "prompt": "the already-composed SALARYMAN art prompt",
  "aspectRatio": "1:1",
  "jobType": "object",
  "key": "prop_terminal"
}
```

The response must include `jobId` (or `job_id`/`id`) and may include
`statusUrl`.

## Poll

```http
GET /render/<jobId>
Authorization: Bearer <BLENDER_RENDER_KEY>
```

While working, return `queued` or `rendering`. On completion, return:

```json
{
  "status": "completed",
  "resultUrls": ["https://assets.example.com/prop_terminal.png"],
  "mediaType": "image"
}
```

`imageUrl`, `videoUrl`, `url`, and `urls` are accepted aliases. `cinematic`
jobs default to `video`; object and landscape jobs default to `image`.

## Health

`GET /` must answer quickly enough for the Art Factory health probe. Any
non-5xx response proves the node is reachable.

## Production rules

- The node must render the prompt verbatim; SALARYMAN style is composed once by
  the API and must not diverge per renderer.
- Output URLs must be public HTTPS URLs reachable by the API QA pass.
- Object/character/building exports should be lossless PNG or WebP and include
  alpha when they are intended to be cut out.
- A Blender node is not configured merely because a URL is present; it must
  pass the live health probe before operators start a batch.