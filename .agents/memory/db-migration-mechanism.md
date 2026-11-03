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

Do not assume a `--tablesFilter` preview has limited a Drizzle push. In this workspace, filtered verbose previews still emitted a full-schema plan. A temporary partial schema is not a safe workaround: Drizzle planned to drop every omitted table, including populated ones.

**Why:** A filtered organization-table preview continued to include unrelated table creation, sequence drops, and constraint changes. A three-table schema preview proposed deleting 55 existing tables. Strict mode was needed to ensure both plans aborted.

**How to apply:** Inspect the complete proposed SQL before any push. If unrelated statements remain or omitted tables are treated as deletions, stop; do not use partial schema files or force to narrow the push.

The installed Drizzle Kit CLI has no read-only `push` diff mode. Its public `pushSchema()` helper wraps PostgreSQL introspection queries with `sql.raw()` but drops bound parameters, so it fails on parameterized metadata queries. `introspect` is read-only, but use a separate config with an isolated output directory; do not run its default output into the tracked migration folder.

**Why:** The attempted helper failed with PostgreSQL `there is no parameter $1`; CLI help exposes only interactive `--strict` and data-loss-approving `--force` options.

**How to apply:** For safe schema evidence, use catalog queries or isolated `drizzle-kit introspect`; never invoke the returned `pushSchema().apply()` or `--force` as a substitute for a reviewed diff.

Before relying on a push prompt as a complete account of drift, compare live `pg_constraint` and `pg_indexes` metadata with the declared schema and check current rows against intended bounds. A failed upsert can come from a missing unique target, while a stale check can reject valid newly supported coordinates.

**Why:** The development basement table lacked its declared primary key and still had older B1 bounds even though the schema supported the expanded floor; neither issue was called out in the unrelated destructive prompt.

**How to apply:** For development-only repairs, verify nulls, duplicates, and existing row ranges first, then change only the specific missing or stale constraint. Never force a broader push to work around unrelated drift.

For singleton state tables, `ON CONFLICT DO NOTHING` is not idempotent unless the live database has a matching unique constraint. Without it, repeated initialization can create duplicate rows, and fixtures using targeted `ON CONFLICT DO UPDATE` fail.

**Why:** The development Tower vitality table had duplicate building rows despite the declared primary key, which made a deterministic test upsert fail.

**How to apply:** Confirm live uniqueness before relying on singleton semantics. Keep test fixtures away from duplicate global rows unless they can snapshot and restore them safely; repair schema drift separately after validating duplicates.

The development schema push has also flagged a primary-key change on `tower_operations_state` alongside `career_positions`. Do not accept a truncate prompt to force through unrelated Tower schema changes; inspect and resolve the drift without deleting those rows.

Drizzle Kit's PostgreSQL introspection represents existing single-column primary keys as column-level `.primaryKey()` declarations. Matching them with table-level `primaryKey({ columns: [...] })` can produce a false destructive drop/re-add even when the live constraint has the same columns. Use column-level declarations for single-column keys and table-level declarations for composite keys.

**Why:** A strict preview proposed dropping several catalog-verified primary keys and warned it would truncate their tables. Changing the schema representation removed those false drops without changing the database.

**How to apply:** When a push proposes replacing a single-column primary key, compare `pg_constraint` to the TypeScript schema. If columns match, align the declaration to column-level `.primaryKey()` and rerun a strict preview; never accept a truncate prompt to bypass this mismatch.

## Composite foreign-key targets in Publish diffs

When a composite foreign key references `(id, org_id)` even though `id` is already a primary key, model the target key as an explicit table-level `UNIQUE` constraint rather than only a standalone unique index. Publish validation may omit a redundant composite index when creating a new table, leaving the foreign key without a matching referenced key.

**Why:** A publish-time diff omitted the standalone `(id, org_id)` unique index but emitted the composite self-reference, and PostgreSQL rejected it because `id`'s primary key does not satisfy uniqueness on the exact referenced column set.

**How to apply:** Keep the explicit unique constraint in the Drizzle schema and development database; when converting an existing equivalent unique index, use `UNIQUE USING INDEX` so the physical index is retained. Then retry through Publish; never add production DDL or deploy-time schema mutations.

The explicit table-level unique constraint was confirmed to let Publish complete after the standalone-index diff failed.

Do not assume Publish reconciles changed PostgreSQL `CHECK` definitions. A successful build can leave production enforcing an older allowed-value set even while development uses the newer constraint.

**Why:** Production rejected a newly supported ledger value, while `explainSchemaDiff()` reported no changes; the next successful Publish still showed the same rejection.

**How to apply:** Compare live `pg_constraint` definitions before and after Publish. Keep runtime writes compatible with the older production constraint until a supported schema diff actually applies the change; never repair production with direct DDL.
