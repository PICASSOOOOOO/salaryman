import { db, feedbackReportsTable } from "@workspace/db";
import { and, eq, lt, sql, isNull } from "drizzle-orm";
import { computeErrorSignature } from "./feedback-signature";

/**
 * Background janitor for the auto-error pipeline. Live users will hit the
 * same crash thousands of times in a day; without this sweep the inbox
 * fills with stale "open" reports nobody can humanly triage.
 *
 * Auto-resolution rules (conservative on purpose — we never auto-resolve
 * something that's still actively firing):
 *
 *   1. STALE — open `error_report` whose lastSeenAt is older than 14 days.
 *      Reason: "stale" (the bug either got fixed, the code path was
 *      removed, or it was a one-off env glitch).
 *
 *   2. SUPERSEDED — open `error_report` whose appVersion is older than
 *      the newest appVersion currently being reported AND has not been
 *      seen for 72 hours. Reason: "superseded_by_newer_version". Version
 *      comparison is semver-numeric (handles "v2.0.0" < "v10.0.0"
 *      correctly — lexical compare gets that wrong).
 *
 *   3. DEDUP_COLLAPSE — leftover open rows that share a signature with a
 *      newer open row. The newer row absorbs the occurrenceCount; the
 *      older rows close as "duplicate". (Belt-and-suspenders — the
 *      ingest path's partial-unique index already prevents this at write
 *      time, this catches legacy rows from before the dedupe ship.)
 *
 * Returns counts for logging / API responses. Never throws — janitor
 * work must not crash the request that triggered it.
 */
export interface SweepResult {
  stale: number;
  superseded: number;
  dedupCollapsed: number;
  signaturesBackfilled: number;
  errors: string[];
}

const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const SUPERSEDED_QUIET_MS = 72 * 60 * 60 * 1000;

/**
 * Pack a "v1.2.3" / "1.2.3" / "1.2.3-rc.4" version string into a single
 * sortable BIGINT: major*1e12 + minor*1e6 + patch. Anything we can't
 * parse becomes 0 so it sorts to the bottom and never wins MAX().
 */
function packVersionExpr(col: ReturnType<typeof sql>) {
  // Optional minor + patch — "v2", "v2.1", "v2.1.0" all parse correctly.
  // Missing segments coerce to 0 (so "v2" packs as 2*1e12, not 0).
  const re = '^v?(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?';
  return sql`(
    COALESCE((regexp_match(${col}, ${re}))[1]::bigint, 0) * 1000000000000 +
    COALESCE((regexp_match(${col}, ${re}))[2]::bigint, 0) * 1000000 +
    COALESCE((regexp_match(${col}, ${re}))[3]::bigint, 0)
  )`;
}

export async function sweepErrorReports(): Promise<SweepResult> {
  const result: SweepResult = {
    stale: 0, superseded: 0, dedupCollapsed: 0, signaturesBackfilled: 0, errors: [],
  };
  const now = new Date();

  // 0. Backfill any signature=NULL rows so they participate in dedup +
  //    superseded rules. Cheap when zero rows match (the index hit is
  //    almost free) so we just run it every sweep.
  try {
    result.signaturesBackfilled = await backfillSignatures();
  } catch (e) {
    result.errors.push(`backfill: ${(e as Error).message}`);
  }

  // 1. STALE
  try {
    const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
    const rows = await db.update(feedbackReportsTable)
      .set({
        status: "resolved",
        resolvedAt: now,
        resolutionReason: "stale",
        updatedAt: now,
      })
      .where(and(
        eq(feedbackReportsTable.kind, "error_report"),
        eq(feedbackReportsTable.status, "open"),
        lt(feedbackReportsTable.lastSeenAt, cutoff),
      ))
      .returning({ id: feedbackReportsTable.id });
    result.stale = rows.length;
  } catch (e) {
    result.errors.push(`stale: ${(e as Error).message}`);
  }

  // 2. SUPERSEDED — correlated against same table for current MAX version.
  //    Numeric semver pack so "v10.0.0" > "v2.0.0" (lexical compare gets
  //    this backwards and would auto-close v10 reports incorrectly).
  try {
    const quietCutoff = new Date(now.getTime() - SUPERSEDED_QUIET_MS);
    const updated = await db.execute(sql`
      WITH current_version AS (
        SELECT MAX(${packVersionExpr(sql`app_version`)}) AS v
        FROM feedback_reports
        WHERE kind = 'error_report'
          AND app_version IS NOT NULL
          AND last_seen_at >= ${quietCutoff}
      )
      UPDATE feedback_reports fr
      SET status = 'resolved',
          resolved_at = ${now},
          resolution_reason = 'superseded_by_newer_version',
          updated_at = ${now}
      FROM current_version cv
      WHERE fr.kind = 'error_report'
        AND fr.status = 'open'
        AND fr.app_version IS NOT NULL
        AND cv.v IS NOT NULL
        AND ${packVersionExpr(sql`fr.app_version`)} < cv.v
        AND ${packVersionExpr(sql`fr.app_version`)} > 0
        AND fr.last_seen_at < ${quietCutoff}
      RETURNING fr.id
    `);
    result.superseded = (updated as unknown as { rows: unknown[] }).rows.length;
  } catch (e) {
    result.errors.push(`superseded: ${(e as Error).message}`);
  }

  // 3. DEDUP COLLAPSE — for any signature with >1 open row, keep the
  //    newest (sum the occurrenceCount into it) and resolve the rest as
  //    duplicates. The partial-unique ingest index makes this rare in
  //    new data, but legacy rows still need it.
  try {
    const dupes = await db.execute(sql`
      WITH ranked AS (
        SELECT id, signature, occurrence_count,
               ROW_NUMBER() OVER (PARTITION BY signature ORDER BY last_seen_at DESC, id DESC) AS rn,
               SUM(occurrence_count) OVER (PARTITION BY signature) AS total
        FROM feedback_reports
        WHERE kind = 'error_report'
          AND status = 'open'
          AND signature IS NOT NULL
      ),
      keepers AS (SELECT id, total FROM ranked WHERE rn = 1),
      losers AS (SELECT id FROM ranked WHERE rn > 1),
      bumped AS (
        -- Bump the keeper to the summed occurrence count from all
        -- duplicates of THIS signature. Only run when there's actually a
        -- loser for this same signature — without the correlated subquery,
        -- a single unrelated multi-row signature would trigger redundant
        -- writes for every other signature's keeper too.
        UPDATE feedback_reports fr
        SET occurrence_count = k.total,
            updated_at = ${now}
        FROM keepers k
        WHERE fr.id = k.id
          AND EXISTS (
            SELECT 1 FROM losers l
            JOIN feedback_reports lr ON lr.id = l.id
            WHERE lr.signature = (SELECT signature FROM feedback_reports WHERE id = k.id)
          )
        RETURNING fr.id
      )
      UPDATE feedback_reports
      SET status = 'resolved',
          resolved_at = ${now},
          resolution_reason = 'duplicate',
          updated_at = ${now}
      WHERE id IN (SELECT id FROM losers)
      RETURNING id
    `);
    result.dedupCollapsed = (dupes as unknown as { rows: unknown[] }).rows.length;
  } catch (e) {
    result.errors.push(`dedup: ${(e as Error).message}`);
  }

  return result;
}

/**
 * Compute and store signatures for legacy error_report rows that landed
 * before the dedupe column shipped (signature IS NULL). Idempotent.
 * Reconstructs the inputs the ingest path uses by parsing the description
 * blob (it stores the structured "SOURCE: ... STACK: ..." sections we
 * built at write time).
 */
export async function backfillSignatures(): Promise<number> {
  const rows = await db.select({
    id: feedbackReportsTable.id,
    title: feedbackReportsTable.title,
    description: feedbackReportsTable.description,
  })
    .from(feedbackReportsTable)
    .where(and(
      eq(feedbackReportsTable.kind, "error_report"),
      isNull(feedbackReportsTable.signature),
    ))
    .limit(500); // bound the work per sweep — next sweep gets the rest

  let n = 0;
  for (const r of rows) {
    const message = (r.title ?? "").replace(/^\[error\]\s*/, "");
    const stackMatch = (r.description ?? "").match(/STACK:\n([\s\S]*?)(?:\n\n|$)/);
    const sourceMatch = (r.description ?? "").match(/SOURCE:\s*(\S+)/);
    const sig = computeErrorSignature({
      message,
      stack: stackMatch?.[1] ?? null,
      source: sourceMatch?.[1] ?? null,
    });
    await db.update(feedbackReportsTable)
      .set({ signature: sig })
      .where(eq(feedbackReportsTable.id, r.id));
    n++;
  }
  return n;
}
