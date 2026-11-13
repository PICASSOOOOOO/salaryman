---
name: Platform monitoring privacy
description: Role-based limits for live monitoring and security views.
---

# Platform monitoring privacy

- Platform admins have full monitoring access.
- Moderators and testers may view global security metadata and visual presence, but not private conversation content, login IP addresses, or report text.
- Organization owners may view only active people in organizations they own, limited to security metadata and visual presence.
- Product owner-bypass perks do not automatically grant platform-admin access.

**Why:** The user explicitly chose different monitoring scopes by role.

**How to apply:** Derive monitoring scope on the server from platform-admin authorization, approved tester status, or organization ownership. Return only fields permitted for that scope.
