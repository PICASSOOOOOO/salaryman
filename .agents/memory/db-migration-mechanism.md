---
name: DB migration mechanism
description: Development schema sync, destructive drift safety, and the production Publish boundary.
---

# Schema source and development sync

The source of truth is the schema TS (`lib/db/src/schema/*`). The current post-merge script invokes `pnpm --filter db push` (Drizzle Kit push). There is no `migrate()` call in app code and no `generate`/`migrate` script in `lib/db/package.json`.

**Why:** `drizzle-kit generate` is unreliable here because `drizzle/meta/` snapshots are incomplete and have a parent-chain collision. A normal push can also stop on unrelated destructive drift, such as an unexpected `career_positions` primary-key change.

**How to apply when adding a column/table:**
1. Edit schema TS and rebuild composite DB types when the declared schema changes.
2. Add a small additive SQL file and journal entry for a tracked schema change; do not generate a snapshot.
3. Inspect the actual development schema before pushing. If a prompt threatens unrelated data, stop; do not accept truncation or use force to get past it.
4. If development needs a narrow repair, apply only reviewed additive SQL and record it. Production schema changes go through Publish.

**Production boundary:** Never put `drizzle-kit push` or `push-force` in `.replit` deployment hooks. Replit's Publish flow diffs the development and production schemas and applies the production change; a deploy-time push can prompt for destructive or unique-constraint decisions and block promotion.

**Why:** A publish attempt stalled after the image was built because the post-build schema push opened an interactive constraint prompt while the VM waited to become ready.

**How to apply:** Keep schema-push commands out of deployment hooks. Use the normal development flow, inspect destructive prompts, and leave production changes to Publish.

**Schema-drift safety:** A regular `drizzle-kit push` can prompt for destructive changes to an unrelated table even when the inspected primary key matches the TypeScript schema. Do not accept a truncate prompt or blindly retry with force just to apply additive tables.

**Why:** The daily game-business schema addition triggered a proposed `career_positions` primary-key change and table truncation; inspection showed the existing primary key already matched the declared key.

**How to apply:** Inspect the actual database constraint and keep the change additive. If the prompt still threatens unrelated data, stop the push and apply only the reviewed additive development DDL; never bypass production Publish schema review.

Before relying on a push prompt as a complete account of drift, compare live `pg_constraint` and `pg_indexes` metadata with the declared schema and check current rows against intended bounds. A failed upsert can come from a missing unique target, while a stale check can reject valid newly supported coordinates.

**Why:** The development basement table lacked its declared primary key and still had older B1 bounds even though the schema supported the expanded floor; neither issue was called out in the unrelated destructive prompt.

**How to apply:** For development-only repairs, verify nulls, duplicates, and existing row ranges first, then change only the specific missing or stale constraint. Never force a broader push to work around unrelated drift.

The development schema push has also flagged a primary-key change on `tower_operations_state` alongside `career_positions`. Do not accept a truncate prompt to force through unrelated Tower schema changes; inspect and resolve the drift without deleting those rows.

## Composite foreign-key targets in Publish diffs

When a composite foreign key references `(id, org_id)` even though `id` is already a primary key, model the target key as an explicit table-level `UNIQUE` constraint rather than only a standalone unique index. Publish validation may omit a redundant composite index when creating a new table, leaving the foreign key without a matching referenced key.

**Why:** A publish-time diff omitted the standalone `(id, org_id)` unique index but emitted the composite self-reference, and PostgreSQL rejected it because `id`'s primary key does not satisfy uniqueness on the exact referenced column set.

**How to apply:** Keep the explicit unique constraint in the Drizzle schema and development database; when converting an existing equivalent unique index, use `UNIQUE USING INDEX` so the physical index is retained. Then retry through Publish; never add production DDL or deploy-time schema mutations.

The explicit table-level unique constraint was confirmed to let Publish complete after the standalone-index diff failed.
