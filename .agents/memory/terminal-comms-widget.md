---
name: Terminal COMMS widget
description: The approved placement, styling, and Pablo presence behavior for browser COMMS.
---

COMMS belongs as a floating widget while the user is in the terminal workspace. Its browser styling follows the cream/black website rather than the old dark-green terminal theme. When its live socket is connected, show Pablo as working; when disconnected, show COMMS offline.

**Why:** The user explicitly asked to restore COMMS as the workspace widget it was before and to make Pablo visibly online/working whenever COMMS is up.

**How to apply:** Mount the existing deferred COMMS/chat implementation on the terminal rather than creating another chat system. Derive the status from the actual socket connection, not a hardcoded online state.