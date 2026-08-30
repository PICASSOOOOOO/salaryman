---
name: OpenClaw gateway dependency
description: Clarifies the boundary between SALARYMAN's gateway protocol and the OpenClaw npm package.
---

SALARYMAN's OpenClaw provider is an external WebSocket gateway integration; do not add the `openclaw` npm package merely because provider names and routes mention OpenClaw.

**Why:** The unused root package pulled hundreds of security findings and a large transitive agent/messaging stack into the workspace without participating in runtime behavior.

**How to apply:** Treat provider-name references as protocol integration code. Add an SDK dependency only if runtime code actually imports it and the integration design explicitly requires it.