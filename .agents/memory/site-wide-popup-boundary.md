---
name: Site-wide popup boundary
description: The product-wide rule for notification pop-ups and COMMS access.
---

Automatic COMMS message and notification pop-ups are opt-in, not default-on. COMMS remains available as a dedicated page and as a user-opened, bottom-docked desktop panel; mobile uses the dedicated page. Keep unread counts visible and preserve dialogs users deliberately open for forms, confirmations, or sign-in.

**Why:** The user said, “Avoid pop ups. Site wide,” then explicitly asked for a desktop COMMS pull-out. An explicit dock is useful without making messages interrupt text entry.

**How to apply:** Use the shared COMMS alert preference for automatic incoming-message/notification toasts across routes. Never auto-open the dock; show it only on authenticated browser routes outside the full COMMS page, and route mobile message intents to that page. Keep badges and in-page status.
