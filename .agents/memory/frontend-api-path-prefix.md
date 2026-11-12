---
name: Frontend API path prefix
description: The web API client requires browser callers to include the /api prefix when passing slash-prefixed paths.
---

Use `/api/...` for all slash-prefixed paths passed to `apiFetch`; it intentionally preserves a leading slash rather than prepending the API base. A missing prefix can return the SPA HTML with HTTP 200, which the caller then reports as a misleading network/JSON error.

**Why:** A Pixel Agents dashboard requested `/autopilot` instead of `/api/autopilot`, so the Vite app returned index HTML and the UI displayed `Network error.` even though the API route was mounted and healthy.

**How to apply:** When adding or auditing a web API caller, compare its literal path with `api-client.ts` and verify the real browser request reaches `/api/...`; keep tests aligned with the actual request string.