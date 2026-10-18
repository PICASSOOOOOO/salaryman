---
name: DB migration mechanism (push-force, not generate)
description: How schema changes actually reach every environment in this repo, and why drizzle-kit generate is unusable here.
---

# Schema is applied via `push-force`, NOT SQL migrations

The source of truth is the schema TS (`lib/db/src/schema/*`). It is synced to every environment by `pnpm --filter @workspace/db run push-force` (drizzle-kit push), which the post-merge setup runs automatically. There is no `migrate()` call in app code and no `generate`/`migrate` script in `lib/db/package.json` — only `push`/`push-force`.

**Why this matters:** `drizzle-kit generate` is effectively broken in this repo. The `drizzle/meta/` snapshot history is incomplete (many snapshot files are simply missing — e.g. 0003, 0008, 0012, 0013, 0015, 0019, 0023–0030) and has at least one parent-chain collision (0020 and 0022 share the same `prevId`). Running `generate` errors out on the collision, and even if unblocked it would diff against a stale snapshot and emit a huge spurious migration full of push-applied drift.

**How to apply when adding a column/table:**
1. Edit the schema TS — this is what actually gets applied via push-force.
2. Rebuild the composite db types so consumers see the field: `pnpm run typecheck:libs` (or `tsc --build lib/db/tsconfig.json`); verify `lib/db/dist/schema/<table>.d.ts` contains the new field.
3. For a tracked record, hand-write a small SQL file `lib/db/drizzle/00NN_<name>.sql` using `ADD COLUMN IF NOT EXISTS ...` (match 0030/0023 style) and append a matching entry to `drizzle/meta/_journal.json`. Do NOT attempt to also write a meta snapshot — snapshots are not consistently maintained here and code review still expects the SQL+journal record.
4. Code review WILL reject a schema change that has no migration SQL file, even though push-force is the real apply path — so always add the SQL + journal entry.

**Production boundary:** Never put `drizzle-kit push` or `push-force` in `.replit` deployment hooks. Replit's Publish flow diffs the development and production schemas and applies the production change; a deploy-time push can prompt for destructive or unique-constraint decisions and block promotion.

**Why:** A publish attempt stalled after the image was built because the post-build schema push opened an interactive constraint prompt while the VM waited to become ready.

**How to apply:** Use push-force only for the development/post-merge path. Remove any deployment `postBuild` database push before asking the user to publish.

**Schema-drift safety:** A regular `drizzle-kit push` can prompt for destructive changes to an unrelated table even when the inspected primary key matches the TypeScript schema. Do not accept a truncate prompt or blindly retry with force just to apply additive tables.

**Why:** The daily game-business schema addition triggered a proposed `career_positions` primary-key change and table truncation; inspection showed the existing primary key already matched the declared key.

**How to apply:** Inspect the actual database constraint and keep the change additive. If the prompt still threatens unrelated data, stop the push and apply only the reviewed additive development DDL; never bypass production Publish schema review.
