---
name: Education Classroom feature
description: Where the classroom hub lives and the two non-obvious constraints (shared conf WS authz, role resolution) that bit during review.
---

# Education Classroom (CREATIVE module)

Hub at `/creative/classroom` (interview-helper). Backend `routes/education.ts` (self-prefixed `/education/...`, mounted under `/api`). Schema `lib/db/src/schema/education.ts`.

## Role resolution is the contract — use resolveRole everywhere
`resolveRole(classroom, userId)` is the single source of truth: creator + org owners/admins (`owner`/`ceo`/`executive`, active) = teacher even WITHOUT a member row; explicit member.role wins otherwise.
**Why:** the list and join endpoints originally derived role from member rows / hardcoded "student", so implicit org-admin teachers showed/were-persisted as students.
**How to apply:** any new endpoint that returns or persists a classroom role must go through `resolveRole`, not raw member rows.

## Live lessons reuse the SHARED /ws/conf relay — gate by room-name prefix only
LiveLesson screen-share runs over `/ws/conf/class-<id>` (teacher = WebRTC initiator, adds screen tracks; students view-only). That conf WS is shared with the phone conference system, which intentionally has NO auth.
**Why:** predictable `class-<id>` room names let any authed user guess a room and receive a teacher's stream. Fix gates ONLY `/^class-(\d+)$/` rooms via `resolveSessionUserId` (cookie→getSession) + `resolveClassroomLiveAccess` (exported from education.ts); non-class rooms bypass untouched.
**How to apply:** never add blanket auth to the conf handler (breaks phone). Scope per room-name pattern. Auth is async, so guard `ws.readyState === OPEN` before `joinConfRoom` AND inside it (disconnect-during-auth race → stale peers/bad counts).

## worldServer importing routes/education is safe
No circular import (education imports @workspace/db + openai integration, not worldServer/index).
