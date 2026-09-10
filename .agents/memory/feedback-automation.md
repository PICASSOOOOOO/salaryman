---
name: Feedback automation boundaries
description: SALARYMAN feedback routing and the boundary between Replit Inbox, internal triage, and GitHub automation.
---

Replit's native Feedback Widget can collect published-app submissions into the Project Editor Inbox, but it does not expose a supported app webhook/API for SALARYMAN to push runtime reports into that Inbox or trigger Agent automatically. SALARYMAN therefore keeps its internal feedback inbox authoritative and syncs each new manual or browser-error report to GitHub through the connected GitHub integration, with durable issue identity and duplicate-safe delivery.

**Why:** Replit documentation supports Inbox collection and manual send-to-Agent, but not programmatic forwarding. The app still needs an actionable, testable automation path that does not invent an undocumented Replit API.

**How to apply:** Keep Replit widget configuration separate from app code. Route product feedback and deduped client errors through the internal report endpoint, create one labeled GitHub issue per report, and preserve retry/status metadata for failures.