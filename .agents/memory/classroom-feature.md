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
Live sessions run over the conf relay at room `class-<id>`. That relay is shared with the phone-conference system, which intentionally has NO auth.
**Why:** predictable `class-<id>` names let any authed user guess a room and receive a teacher's stream.
**How to apply:** never add blanket auth to the conf handler (breaks phone). Gate ONLY rooms matching `class-<id>`: resolve the session userId from the cookie and verify classroom access; close 1008 otherwise. Auth is async, so guard `readyState === OPEN` before AND inside the room-join step (disconnect-during-auth race → stale peers/bad counts).

## The feature is dynamically NAMED "Classroom" vs "Conference" — backend routes were NOT renamed
The same product surfaces as **"Classroom"** for education orgs and **"Conference"** for everyone else. The label is driven by `organizationsTable.isEducation` (a flag captured ONCE at onboarding from the EDUCATION/SCHOOL industry pick — there is intentionally NO retroactive reclassification). UI reads it via the `use-feature-label.ts` client hook (module-level cache + inflight dedupe, **defaults to "Conference"** on error/401) backed by `GET /api/education/label`.
**Why:** education customers want "Classroom"; the same collaboration tooling reads as "Conference" to business orgs. The flag is the only source — don't infer education from anything else.
**How to apply:** the server routes are STILL `/api/education/...` and the table/role vocabulary is still "classroom"/"teacher"/"student" even when the UI says Conference — this was a deliberate scope cut, not an oversight. A conference org hits `/api/education/classrooms`. Don't "fix" the route names expecting them to match the displayed label. New UI copy that names the feature must go through `useFeatureLabel()`, never hardcode "Classroom".

## Live tab is a Discord-style mesh, not screen-share-only
The live session is a multi-participant camera+mic grid on the shared `use-webrtc` mesh hook over `/ws/conf`, with screen-share as an OPTIONAL overlay (not the old one-way teacher screen broadcast). Teacher gates the session server-side; students auto-join while active.
**How to apply:** reuse the `use-webrtc` hook — do NOT reintroduce a separate raw-WebSocket path in the live component. Screen-share works by swapping the outgoing video track on every peer (stash the camera track to restore on stop, re-apply to peers that connect mid-share, auto-stop on the track's `ended` event); any new track-swap surface must cover all three of those cases or peers desync.
