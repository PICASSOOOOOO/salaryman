---
name: OpenAPI date strings
description: Keep generated OpenAPI types aligned with JSON date values on the wire.
---

Use plain OpenAPI strings for JSON date-only and timestamp values unless the shared client adds a runtime date reviver. With the current codegen setup, `format: date` and `format: date-time` can produce `Date` expectations in generated schemas and TypeScript, while JSON parsing still returns strings. For date-only inputs, use a `YYYY-MM-DD` pattern and validate that it is a real calendar date on the server.

**Why:** The generated types appeared correct but did not match the actual JSON values consumed by the browser or parsed from Express request bodies.

**How to apply:** Before adding date-formatted OpenAPI properties, inspect both the Orval date configuration and `customFetch` response parsing. Keep wire-format strings explicit until a runtime conversion is implemented and tested.
