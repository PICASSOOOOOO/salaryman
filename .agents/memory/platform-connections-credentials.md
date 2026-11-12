---
name: Platform Connections credential storage
description: How the SALARYMAN "Connections" tab stores bring-your-own credentials and the masking invariant
---

# Platform Connections (bring-your-own credentials)

The Platform page's "CONNECTIONS" tab (formerly "APPS") lets any logged-in user
attach their own credentials for catalog apps (e.g. Noise / getnoise.com) so
SALARYMAN can later automate on their behalf. Connect is open to all — no PRIME gate.

## Storage model
- Credentials live in the existing `platform_connected_apps.config` jsonb under a
  `credentials` key. No schema/migration needed.
- Re-connecting MERGES new non-blank fields over stored ones (blank = keep existing),
  so there is no per-field clear — disconnect removes the whole row to wipe creds.
- Catalog/connect/disconnect are org-scoped (filtered by orgId).

## Masking invariant (security-critical)
GET that lists connections MUST return a MASKED summary only, never raw secrets:
- secrets (apiKey, password) → boolean flags (+ apiKeyLast4); never the value.
- non-secret display fields (login, baseUrl) → returned verbatim.
- **notes is free-form and may contain secrets → return `hasNotes` boolean only,
  NEVER the text.** (A prior review caught `notes` being returned verbatim.)
**Why:** users paste real API keys/passwords here; leaking them in a list response
is a direct credential-exposure bug. Any new credential field defaults to masked
unless it's provably non-secret.
**How to apply:** when adding a credential field, add it to the clean/merge helper
AND decide its read shape (flag vs verbatim) in the same edit; the modal pre-fills
only verbatim fields, secret/notes inputs start blank (write-only).
