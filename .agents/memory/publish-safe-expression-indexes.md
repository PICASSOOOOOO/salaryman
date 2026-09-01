---
name: Publish-safe expression indexes
description: PostgreSQL expression-index syntax that survives Replit's development-to-production schema diff.
---

Avoid backslash regex literals such as `\s+` inside PostgreSQL expression indexes. Use an equivalent POSIX character class such as `[[:space:]]+`.

**Why:** Replit's publish schema-diff renderer truncated an otherwise valid introspected index definition at a quoted backslash regex, producing malformed `CREATE UNIQUE INDEX` SQL and stopping Publish.

**How to apply:** When adding or changing a regex-based expression index, use POSIX character classes, apply the matching index definition to development, and inspect the generated publish schema diff before asking the user to retry.