---
name: Failed patch recovery
description: Recovery step when an incremental patch fails partway through.
---

After a multi-hunk patch reports a context or ordering error, inspect the working tree before retrying. Earlier hunks may already have been applied even though the overall patch was rejected.

**Why:** A multi-file NPC bridge patch failed on later hunks while some earlier changes had already landed.

**How to apply:** Re-read the affected regions after any failed patch, then patch only the changes still missing.
