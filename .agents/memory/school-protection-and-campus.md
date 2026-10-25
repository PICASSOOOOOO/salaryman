---
name: Protected school campuses
description: Safety, access, and space requirements for all current and future school businesses.
---

Every school business needs a child-protection feature: players under 18 may access only their school and must spawn inside it, not elsewhere in the building. A school may occupy a full floor, with rent or real-estate cost based on the area it uses.

School facilities should be expansive enough for conferences, auditoriums, lunch, water, private restrooms, offices, copy machines, lounges, playgrounds, and activities. School restroom use is private and represented by a cutscene-only transition; do not show restroom activity.

**Why:** The user specified protected access for under-18 players, a broad campus with these facilities, private restroom cutscenes, and rent proportional to the school footprint.

**How to apply:** Enforce age-based access and spawn rules on the authoritative server, not only in clients. Apply the footprint-based price to the whole floor when a school leases it; preserve other tenant space unless the user approves a relocation.

The existing school remains in its current Floor 6 suite. A real school that rents or buys space should be able to take a full floor for a campus sized for roughly 200 students plus teachers and administrators. Student accounts should be provisioned by an authorized parent or teacher through the school's onboarding flow; the school integration should be designed to connect to STEC, but no STEC API contract has been supplied yet.

**Why:** The user clarified the current-vs-future school footprint and described parent/teacher onboarding through a school app as the trust boundary.

**How to apply:** Keep current Floor 6 tenants in place. Model future school tenancy as full-floor, area-based space, and keep student status server-controlled by the school onboarding authority; do not invent or call an undocumented STEC API.
