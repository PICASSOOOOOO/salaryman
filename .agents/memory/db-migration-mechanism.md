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
