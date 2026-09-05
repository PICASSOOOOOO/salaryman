# Godot render bridge

SALARYMAN keeps the existing API server and its current `PORT`. Godot does not
start a second server on port 8080. Instead, the API server exposes a namespaced
WebSocket channel:

```text
/ws/godot/render
```

## Publisher connection

Godot connects as a publisher:

```text
wss://<salaryman-host>/ws/godot/render?role=publisher&token=<GODOT_RENDER_TOKEN>
```

The token is required in production. Development allows a local publisher when
`GODOT_RENDER_TOKEN` is not set. The publisher sends raw PNG, JPEG, or WebP
binary frames. The bridge keeps only the newest frame and broadcasts it to
connected viewers.

The server sends a JSON `ready` message after connection. A publisher may send
`{"type":"ping"}` and receives a `pong`; this is optional.

## Viewer connection

Authenticated browser art tools connect as:

```text
wss://<salaryman-host>/ws/godot/render?role=viewer
```

In production, viewers use the normal Clerk session cookie. A viewer receives:

1. `{"type":"ready", ...}`
2. When a frame exists, `{"type":"frame_meta", ...}`
3. The corresponding binary image payload

`frame_meta` includes `sequence`, `mimeType`, `receivedAt`, and `byteLength`.

## Status

Owner-only HTTP status:

```text
GET /api/godot-render/status
```

This reports publisher/viewer counts and the newest frame metadata without
exposing the frame itself.

## Art-development boundary

The checked-in Godot 4 art-dev project lives at `godot/art-dev`. It is the
animation review/export surface for the shared character sheets and publishes
its rendered viewport as PNG frames through this bridge. Launch it with:

```bash
godot --path godot/art-dev
```

Use `--asset-base` when the Vite asset host is not the local default, and
`--bridge-url` when the API is not local. The project supports walk, typing, and
reading cycles, direction/palette review, pause, and scale controls.

Godot is a live preview transport and art-development renderer, not the art
catalog or prompt authority.
SALARYMAN continues to own art prompts, asset records, and provider selection.
That lets a future Blender or Astra adapter render through the same art-dev
workflow without replacing the game server or mixing renderer-specific style
prompts into the client.