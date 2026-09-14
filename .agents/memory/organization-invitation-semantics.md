---
name: Organization invitation semantics
description: The contract between email invitations, organization membership, corporate roles, and billing mode.
---

Email invitations are the onboarding path for new organization members. The invite stores the offered corporate role, title, department, and employment type, then acceptance creates or activates the roster membership.

**Why:** Employment type and billing mode are separate concepts. Treating an offered employee/contractor type as feature billing can silently alter how a member's paid features are charged.

**How to apply:** Keep `members.manage` as the server-authoritative permission for invite/add/edit/remove actions. Map accepted offer type to `orgMembers.memberType`; leave `featureBilling` on its independent billing value unless a dedicated billing action changes it.