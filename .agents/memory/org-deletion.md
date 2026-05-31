---
name: Org deletion / disband
description: How deleting an organization cascades, and which org_id tables DON'T cascade and must be cleaned manually.
---

Deleting an `organizations` row (the owner-only "DELETE BUSINESS" / disband flow in BusinessHub, and the admin global "FULL FRESH START" world reset) relies on Postgres FK `onDelete:"cascade"` to clear: org_members, org_invites, org_partnerships, org_feature_grants, org_door_locks, org-scoped chat_channels, and tickets (+ticket_comments).

**Why this matters:** many other tables store `org_id` as a PLAIN integer with NO foreign key (to avoid circular schema imports), so deleting the org leaves them pointing at a dead id. Known non-FK org references that drift: `phone_numbers.org_id`, `users.current_org_id` (varchar pointer used by /orgs/switch — a dangling value makes the UI try to load a dead org), plus call_history/voicemails, leads, bots, media-sharing, insurance, education, ad-creatives.

**How to apply:** when deleting a single org, do it in ONE transaction and at minimum null `phone_numbers.org_id` and `users.current_org_id` for that org before the delete. The per-org delete endpoint is owner-only and REQUIRES an exact `confirmName` body match (mandatory, not optional). The global world reset does NOT clean every non-FK table — it accepts orphans for the rarely-queried ones. If you ever need a truly clean per-org wipe, enumerate every `org_id` column (grep `org_id` in lib/db/src/schema) and decide null-vs-delete per table.
