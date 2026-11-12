import { db, feedbackReportsTable, systemConfigTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getUncachableResendClient } from "./resend";
import { ownerEmails } from "./plan";

/**
 * Daily digest of the error/feedback inbox, mailed to OWNER_EMAILS via
 * the existing Resend connection. Designed to be safe to call on every
 * hourly tick — it persists a "last sent" timestamp in system_config
 * and no-ops until 24h have elapsed since the previous send.
 *
 * The digest deliberately keeps the body small: top 10 currently-open
 * error rows by occurrence count (the loudest bugs), plus counts of
 * everything else. Triagers click through to /profile/admin/feedback
 * for the full list.
 */

const LAST_SENT_KEY = "feedback:lastDigestAt";
const INTERVAL_MS = 24 * 60 * 60 * 1000;

interface DigestStats {
  newErrorReports24h: number;
  newFeedback24h: number;
  totalOpenErrors: number;
  topOpen: Array<{ id: number; title: string; occurrenceCount: number; lastSeenAt: Date | null }>;
}

async function readLastSent(): Promise<number> {
  const [row] = await db
    .select({ value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, LAST_SENT_KEY))
    .limit(1);
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function writeLastSent(ts: number): Promise<void> {
  // UPSERT against the unique key — first call inserts, every subsequent
  // call updates the same row.
  await db.execute(sql`
    INSERT INTO system_config (key, value, category, description)
    VALUES (${LAST_SENT_KEY}, ${String(ts)}, 'feedback', 'epoch ms of last daily digest send')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `);
}

async function gatherStats(sinceTs: number): Promise<DigestStats> {
  const since = new Date(sinceTs);

  const [newErrors] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackReportsTable)
    .where(and(
      eq(feedbackReportsTable.kind, "error_report"),
      gte(feedbackReportsTable.createdAt, since),
    ));

  const [newFeedback] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackReportsTable)
    .where(and(
      sql`${feedbackReportsTable.kind} <> 'error_report'`,
      gte(feedbackReportsTable.createdAt, since),
    ));

  const [openErrors] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackReportsTable)
    .where(and(
      eq(feedbackReportsTable.kind, "error_report"),
      eq(feedbackReportsTable.status, "open"),
    ));

  const topOpen = await db
    .select({
      id: feedbackReportsTable.id,
      title: feedbackReportsTable.title,
      occurrenceCount: feedbackReportsTable.occurrenceCount,
      lastSeenAt: feedbackReportsTable.lastSeenAt,
    })
    .from(feedbackReportsTable)
    .where(and(
      eq(feedbackReportsTable.kind, "error_report"),
      eq(feedbackReportsTable.status, "open"),
    ))
    .orderBy(desc(feedbackReportsTable.occurrenceCount))
    .limit(10);

  return {
    newErrorReports24h: Number(newErrors?.count ?? 0),
    newFeedback24h: Number(newFeedback?.count ?? 0),
    totalOpenErrors: Number(openErrors?.count ?? 0),
    topOpen,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(stats: DigestStats, baseUrl: string): string {
  const rows = stats.topOpen.length === 0
    ? `<tr><td style="padding:12px;color:#888">No open error reports — inbox is clean.</td></tr>`
    : stats.topOpen.map(r => {
        const last = r.lastSeenAt ? new Date(r.lastSeenAt).toISOString().slice(0, 16).replace("T", " ") : "—";
        const link = `${baseUrl}/profile/admin/feedback?kind=error_report&id=${r.id}`;
        return `<tr>
          <td style="padding:8px;border-top:1px solid #222;color:#bbb;font-family:monospace;font-size:11px">×${r.occurrenceCount}</td>
          <td style="padding:8px;border-top:1px solid #222;color:#eee;font-family:monospace;font-size:12px"><a href="${link}" style="color:#7dd3fc;text-decoration:none">${escapeHtml(r.title.slice(0, 120))}</a></td>
          <td style="padding:8px;border-top:1px solid #222;color:#666;font-family:monospace;font-size:10px;white-space:nowrap">${last}</td>
        </tr>`;
      }).join("");

  return `<div style="background:#0a0a0c;color:#eee;font-family:system-ui,sans-serif;padding:24px;max-width:680px;margin:0 auto">
    <h2 style="font-family:monospace;font-size:14px;letter-spacing:2px;color:#7dd3fc;margin:0 0 16px">SALARYMAN · DAILY ERROR DIGEST</h2>
    <p style="color:#aaa;font-size:13px;margin:0 0 20px">
      Past 24h: <b style="color:#fbbf24">${stats.newErrorReports24h}</b> new auto-errors,
      <b style="color:#7dd3fc">${stats.newFeedback24h}</b> user reports.
      <b style="color:#f87171">${stats.totalOpenErrors}</b> total open.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#111;border:1px solid #222;border-radius:6px">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;color:#666;font-family:monospace;font-size:10px;letter-spacing:1px">COUNT</th>
          <th style="text-align:left;padding:8px;color:#666;font-family:monospace;font-size:10px;letter-spacing:1px">TITLE</th>
          <th style="text-align:left;padding:8px;color:#666;font-family:monospace;font-size:10px;letter-spacing:1px">LAST SEEN</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#666;font-size:11px;margin-top:16px">
      Triage at <a href="${baseUrl}/profile/admin/feedback" style="color:#7dd3fc">${baseUrl}/profile/admin/feedback</a>.
    </p>
  </div>`;
}

export interface DigestSendResult {
  sent: boolean;
  reason: string;
  recipients?: number;
  stats?: DigestStats;
}

export async function sendDailyDigestIfDue(force = false): Promise<DigestSendResult> {
  const now = Date.now();
  const last = await readLastSent();
  if (!force && now - last < INTERVAL_MS) {
    return { sent: false, reason: "not_due" };
  }

  // Recipients = OWNER_EMAILS env + hardcoded owner list. Unique, deduped.
  const recipients = ownerEmails();
  if (recipients.length === 0) {
    // Stamp anyway so we don't query every hour for nothing.
    await writeLastSent(now);
    return { sent: false, reason: "no_recipients" };
  }

  // Stats window starts at the previous send (or 24h ago on first run).
  const sinceTs = last > 0 ? last : now - INTERVAL_MS;
  const stats = await gatherStats(sinceTs);

  // Skip emailing on a totally quiet day. Still stamp lastSent so we
  // don't re-query in 1h.
  if (stats.newErrorReports24h === 0 && stats.newFeedback24h === 0 && stats.totalOpenErrors === 0) {
    await writeLastSent(now);
    return { sent: false, reason: "nothing_to_report", stats };
  }

  const baseUrl = process.env.PUBLIC_APP_URL ?? "https://salaryman.replit.app";
  const html = renderHtml(stats, baseUrl);
  const subject = `[Salaryman] ${stats.newErrorReports24h} new errors · ${stats.totalOpenErrors} open`;

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: fromEmail,
      to: recipients,
      subject,
      html,
    });
    // Only stamp on success — a transient Resend failure should not push
    // the next attempt out by 24h.
    await writeLastSent(now);
    return { sent: true, reason: "ok", recipients: recipients.length, stats };
  } catch (e) {
    return { sent: false, reason: `send_failed: ${(e as Error).message}` };
  }
}
