---
name: Education Classroom feature
description: Durable access-control rules for the classroom hub — role resolution, org-scoped join, and the shared live-lesson WS gate.
---

# Education Classroom (CREATIVE module)

Hub at `/creative/classroom`. Backend route is self-prefixed under `/api/education/...`.

## Role resolution is the single contract
A `resolveRole(classroom, userId)` helper is the only source of truth: creator + the classroom-org's owner/admins (owner/ceo/executive, active) are **teachers even without a member row**; an explicit member.role wins otherwise.
**Why:** list and join originally derived role from member rows / a hardcoded "student", so implicit org-admin teachers were shown and persisted as students.
**How to apply:** any endpoint that returns or persists a classroom role must go through role resolution, never raw member rows. UI teacher controls (promote/demote co-teacher) gate on `isTeacher`, NOT `isOwner` — the requirement is any teacher can promote; the owner is protected server-side.

## Join-by-code must be org-scoped
For an org-scoped classroom, joining by code is restricted to associates of that org (org owner or active org member). A leaked code must not enroll arbitrary outsiders.
**Why:** join codes are guessable/shareable; an open join is broken access control + cross-org enrollment risk.
**How to apply:** before inserting a member on join, if the classroom has an orgId and the user has no existing relationship, verify org associateship and 403 otherwise.

## Assignments + homework cache + translation + autocorrect + split view
Assignments live in their own table with a jsonb AI `cache` (practice question bank). Student-facing assignment detail MUST strip answer keys (`questions.map(({answer,...rest})=>rest)`) — teachers see them, students never. WorkTab shows only free-form submissions (`assignmentId == null`); assignment-linked work belongs to the Assignments tab. Translation/homework-generate/plagiarism-check all hit OpenAI and ALL need `AbortSignal.timeout(...)` (the plagiarism `/check` call was the one that originally lacked it). Translation target = current i18next language; reuse LanguageSelector + spellcheck.ts, never re-implement.
**Why:** answer-key leakage and hung outbound AI calls are the two recurring failure modes here.

## SplitWorkspace singleton panes
The reusable dual-window split (react-resizable-panels, vertical ≤768px / horizontal desktop) supports `singleton` modules (the translator) that may render in only ONE pane. The picker handlers bump the duplicate out — BUT persisted localStorage state can load the same singleton into BOTH panes, so the invariant MUST also be normalized at mount (init state), not just on user pick.
**Why:** mount-time was the gap; relying only on the picker let a saved dual-translator layout render twice.

## Live lessons reuse the SHARED conf WS — gate by room-name prefix only
Live screen-share runs over the conf relay at room `class-<id>` (teacher = WebRTC initiator). That relay is shared with the phone-conference system, which intentionally has NO auth.
**Why:** predictable `class-<id>` names let any authed user guess a room and receive a teacher's stream.
**How to apply:** never add blanket auth to the conf handler (breaks phone). Gate ONLY rooms matching `class-<id>`: resolve the session userId from the cookie and verify classroom access; close 1008 otherwise. Auth is async, so guard `readyState === OPEN` before AND inside the room-join step (disconnect-during-auth race → stale peers/bad counts).
