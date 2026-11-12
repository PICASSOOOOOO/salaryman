---
name: Orval Zod output target
description: Keep generated validators compatible with the workspace's Zod runtime.
---

Pin Orval's Zod output to version 3 while `@workspace/api-zod` uses Zod 3.

**Why:** Orval 8.28 emitted Zod 4-only calls such as `zod.int()` and `zod.looseObject()` when it selected the output target automatically. Zod 3 does not provide those runtime methods, so importing generated validators crashed the API server before it could listen.

**How to apply:** Keep the explicit Zod 3 version in the Orval config. After changing the OpenAPI spec, regenerate the clients and smoke-start the API server. Only switch the target as part of an intentional Zod dependency migration.