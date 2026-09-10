---
name: Browser authentication routing
description: Public entry, protected-route sign-in, and post-authentication return behavior.
---

The public website remains at `/`. Pablo is a product destination, not the
authentication gateway. A missing or expired session must go directly to the
compact `/sign-in` screen with a safe `returnTo` for the requested page.

Protected products may be explicitly allowed to render their own compact sign-in
state. Authentication recovery must preserve the requested product route.

**Why:** Sending users to the nebula when they pressed Back, opened Automation, or
finished login broke navigation and made Pablo appear to own unrelated products.

**How to apply:** Unexpected 401 handling routes to `/sign-in?returnTo=...`.
Signed-out Back fallback is `/`. Legacy Automation paths resolve to the Automation
workspace, whose sign-in returns there. Never use `/pablo` as a generic auth,
Back, or product fallback.
