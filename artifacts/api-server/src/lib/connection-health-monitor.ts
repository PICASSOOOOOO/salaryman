/**
 * Continuous platform-wide connection health monitor (in-process).
 *
 * This is the always-on, in-process layer of the two-layer health model — the
 * counterpart to the on-demand `health:all` Scheduled Deployment script. While
 * the script gives an external "is the whole server reachable" probe on a cron,
 * THIS poller runs inside the live server and re-probes every external
 * connection (plus the internal API structure) on a short, configurable interval
 * so a connection dropping out is caught within minutes — not only when an admin
 * happens to open the dashboard.
 *
 * It generalizes the render-backend alerting pattern (see art-providers/
 * backend-alerts.ts):
 *   - Debounce/flapping protection: a healthy→broken (or recovery) transition
 *     must HOLD for CONN_HEALTH_DEBOUNCE_MS across consecutive polls before it
 *     fires, so a single blip never spams.
 *   - Silent baseline: the very first observation per connection only records a
 *     baseline — we never alert "healthy" at boot.
 *   - Each confirmed transition is persisted to the shared health-transition
 *     store (provider_health_transitions, "conn:" namespace) AND emailed.
 *
 * Status mapping: a probe FAIL is "broken"; PASS and WARN are both "healthy" so
 * intentionally-unconfigured optional integrations (which probe WARN) never
 * raise a false outage alert — matching the script's WARN-is-quiet policy.
 *
 * Silenceable: set CONN_HEALTH_MONITOR to off/false/0/no to disable entirely.
 */

import {
  runAllProbes,
  type ProbeResult,
  type ProbeStatus,
} from "./connection-probes";
import { getUncachableResendClient } from "./resend";
import { ownerEmails } from "./plan";
import { db, providerHealthTransitionsTable } from "@workspace/db";
import { and, desc, eq, like, notInArray } from "drizzle-orm";

/** The two states that drive connection alerts. */
export type ConnState = "healthy" | "broken";

/** Per-connection cap on persisted transition rows (matches the art store). */
export const CONN_HEALTH_HISTORY_LIMIT = 8;

/** Prefix that namespaces connection rows in the shared transition table. */
export const CONN_ID_PREFIX = "conn:";

/**
 * A confirmed transition must persist this long before it emails/persists, so a
 * flapping connection never triggers a send. Configurable via env.
 */
export const CONN_HEALTH_DEBOUNCE_MS =
  Number(process.env.CONN_HEALTH_DEBOUNCE_MS) || 2 * 60_000;

/**
 * How often the background poller re-probes all connections. Defaults to a few
 * minutes; configurable via env. Kept above the probe cache TTL.
 */
export const CONN_HEALTH_POLL_INTERVAL_MS =
  Number(process.env.CONN_HEALTH_POLL_INTERVAL_MS) || 3 * 60_000;

/** Base URL for the internal-API probes (mirrors the health:all script). */
const BASE_URL = (process.env.HEALTH_CHECK_BASE_URL || "https://salaryman.io").replace(/\/+$/, "");

interface ConnAlertState {
  /** Last settled state we've alerted from (null until baseline is set). */
  stable: ConnState | null;
  /** A candidate state that differs from `stable`, awaiting debounce. */
  pending: ConnState | null;
  /** When `pending` was first observed (ms epoch). */
  pendingSince: number;
}

/** Per-connection debounce state, keyed by connection slug. */
const states = new Map<string, ConnAlertState>();

/** Timestamp (ms epoch) of the last completed poll, surfaced to the admin UI. */
let lastCheckedAt = 0;

/** Drop all remembered state (tests + any future explicit reset). */
export function resetConnectionMonitorState(): void {
  states.clear();
  lastCheckedAt = 0;
}

/** When the background poller last completed a sweep (0 = never). */
export function connHealthLastCheckedAt(): number {
  return lastCheckedAt;
}

/** Is the continuous monitor enabled? Default on; silenced via env. */
export function connHealthMonitorEnabled(): boolean {
  const raw = (process.env.CONN_HEALTH_MONITOR ?? "").trim().toLowerCase();
  return !(raw === "off" || raw === "false" || raw === "0" || raw === "no");
}

/** Map a probe status to the two states that drive alerts. */
export function connStateOf(status: ProbeStatus): ConnState {
  return status === "FAIL" ? "broken" : "healthy";
}

/** Stable, collision-free slug for a connection (namespaced, <= 64 chars). */
export function connectionSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${CONN_ID_PREFIX}${base}`.slice(0, 64);
}

/** A confirmed (debounced) connection transition ready to persist/email. */
export interface ConnectionTransition {
  slug: string;
  name: string;
  from: ConnState;
  to: ConnState;
  /** The probe status that produced `to` (e.g. FAIL/PASS/WARN). */
  status: ProbeStatus;
  /** Human-readable reason (the probe detail / last error). */
  detail: string;
}

/**
 * Fold a fresh batch of probe results into the per-connection debounce state and
 * return the transitions that have now held long enough to act on.
 *
 * Pure with respect to IO: it only mutates the in-memory debounce map and
 * returns what *should* be persisted/emailed, so it can be unit-tested by
 * feeding successive snapshots with an explicit `now`.
 */
export function reconcileConnectionHealth(
  results: ProbeResult[],
  now: number = Date.now(),
): ConnectionTransition[] {
  const transitions: ConnectionTransition[] = [];
  for (const r of results) {
    const cur = connStateOf(r.status);
    const slug = connectionSlug(r.name);
    const st = states.get(slug) ?? { stable: null, pending: null, pendingSince: 0 };

    // First time we see this connection: record a silent baseline, never alert.
    if (st.stable === null) {
      st.stable = cur;
      st.pending = null;
      st.pendingSince = 0;
      states.set(slug, st);
      continue;
    }

    // Settled back to the known state before debounce elapsed — drop pending.
    if (cur === st.stable) {
      st.pending = null;
      st.pendingSince = 0;
      states.set(slug, st);
      continue;
    }

    // Differs from stable. (Re)start the debounce clock whenever the candidate
    // changes, so a flap resets the timer instead of accumulating toward a send.
    if (st.pending !== cur) {
      st.pending = cur;
      st.pendingSince = now;
    }
    states.set(slug, st);

    if (now - st.pendingSince >= CONN_HEALTH_DEBOUNCE_MS) {
      transitions.push({
        slug,
        name: r.name,
        from: st.stable,
        to: cur,
        status: r.status,
        detail: r.detail,
      });
      st.stable = cur;
      st.pending = null;
      st.pendingSince = 0;
      states.set(slug, st);
    }
  }
  return transitions;
}

/** Recipients: explicit CONN_HEALTH_ALERT_EMAIL list, else all owner emails. */
function resolveRecipients(): string[] {
  const explicit = (process.env.CONN_HEALTH_ALERT_EMAIL || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  return ownerEmails();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the email body for one connection transition. */
export function renderConnectionAlertEmail(t: ConnectionTransition): {
  subject: string;
  html: string;
  text: string;
} {
  const recovered = t.to === "healthy";
  const word = recovered ? "RECOVERED" : "DOWN";
  const subject = `[SALARYMAN] Connection "${t.name}" is ${word}`;
  const when = new Date().toUTCString();
  const detailLine =
    !recovered && t.detail
      ? `<p style="color:#b00020;margin:8px 0 0;"><b>Last error:</b> ${escapeHtml(t.detail)}</p>`
      : "";
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;">
      <h2 style="margin:0 0 4px;">Platform connection ${recovered ? "recovered" : "went down"}</h2>
      <p style="color:#666;margin:0 0 12px;">${when}</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Connection</td><td><b>${escapeHtml(t.name)}</b></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Transition</td><td>${t.from} → <b>${t.to}</b></td></tr>
      </table>
      ${detailLine}
      ${recovered ? "" : `<p style="margin-top:14px;">A platform connection stopped passing its health probe. Investigate before customers are impacted.</p>`}
    </div>`;
  const text =
    `Platform connection "${t.name}" ${recovered ? "recovered" : "went down"}\n` +
    `${when}\nTransition: ${t.from} -> ${t.to}\n` +
    (!recovered && t.detail ? `Last error: ${t.detail}\n` : "");
  return { subject, html, text };
}

/** Persist a confirmed transition to the shared health-transition store. */
async function recordConnectionTransition(
  t: ConnectionTransition,
  at: number,
): Promise<void> {
  await db.insert(providerHealthTransitionsTable).values({
    providerId: t.slug,
    health: t.to,
    at,
    detail: t.detail ? t.detail.slice(0, 300) : null,
  });
  // Prune to the per-id history cap so the table never grows unbounded.
  const keep = await db
    .select({ id: providerHealthTransitionsTable.id })
    .from(providerHealthTransitionsTable)
    .where(eq(providerHealthTransitionsTable.providerId, t.slug))
    .orderBy(desc(providerHealthTransitionsTable.at), desc(providerHealthTransitionsTable.id))
    .limit(CONN_HEALTH_HISTORY_LIMIT);
  if (keep.length < CONN_HEALTH_HISTORY_LIMIT) return;
  await db.delete(providerHealthTransitionsTable).where(
    and(
      eq(providerHealthTransitionsTable.providerId, t.slug),
      notInArray(
        providerHealthTransitionsTable.id,
        keep.map((k) => k.id),
      ),
    ),
  );
}

/** One persisted connection transition, shaped for the admin UI. */
export interface ConnectionTransitionRecord {
  slug: string;
  to: ConnState;
  at: number;
  detail: string | null;
}

/**
 * Read the most recent connection transitions across all connections (newest
 * first), for the admin health surface. Limited to keep the response small.
 */
export async function getConnectionTransitionHistory(
  limit = 30,
): Promise<ConnectionTransitionRecord[]> {
  const rows = await db
    .select({
      providerId: providerHealthTransitionsTable.providerId,
      health: providerHealthTransitionsTable.health,
      at: providerHealthTransitionsTable.at,
      detail: providerHealthTransitionsTable.detail,
    })
    .from(providerHealthTransitionsTable)
    .where(like(providerHealthTransitionsTable.providerId, `${CONN_ID_PREFIX}%`))
    .orderBy(desc(providerHealthTransitionsTable.at), desc(providerHealthTransitionsTable.id))
    .limit(limit);
  return rows.map((r) => ({
    slug: r.providerId,
    to: r.health === "broken" ? "broken" : "healthy",
    at: Number(r.at),
    detail: r.detail ?? null,
  }));
}

/** Email a single confirmed transition to admins. Returns true on success. */
async function emailConnectionTransition(t: ConnectionTransition): Promise<boolean> {
  const recipients = resolveRecipients();
  if (!recipients.length) {
    console.warn(
      "[conn-monitor] No recipient configured (set CONN_HEALTH_ALERT_EMAIL or OWNER_EMAILS); skipping email.",
    );
    return false;
  }
  const { subject, html, text } = renderConnectionAlertEmail(t);
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({ from: fromEmail, to: recipients, subject, html, text });
    console.log(
      `[conn-monitor] ${t.name} ${t.from}->${t.to} emailed to ${recipients.length} recipient(s)`,
    );
    return true;
  } catch (e: any) {
    console.error(
      `[conn-monitor] Failed to email ${t.name} ${t.from}->${t.to}: ${e?.message || e}`,
    );
    return false;
  }
}

/**
 * One poll tick: re-probe every connection, fold the results into the debounce
 * state, then persist AND email any confirmed transitions. Safe to call on an
 * interval. No-op (and no probe) when the subsystem is silenced via env.
 *
 * A "broken" transition whose alert email is undeliverable is logged as an
 * error (in-process; we cannot fail the process) so the gap is still visible.
 */
export async function pollConnectionHealth(): Promise<void> {
  if (!connHealthMonitorEnabled()) return;
  let results: ProbeResult[];
  try {
    ({ results } = await runAllProbes(BASE_URL));
  } catch (e: any) {
    console.error(`[conn-monitor] Probe sweep failed: ${e?.message || e}`);
    return;
  }
  const now = Date.now();
  lastCheckedAt = now;
  const transitions = reconcileConnectionHealth(results, now);
  for (const t of transitions) {
    try {
      await recordConnectionTransition(t, Date.now());
    } catch (e: any) {
      console.error(
        `[conn-monitor] Failed to persist ${t.name} ${t.from}->${t.to}: ${e?.message || e}`,
      );
    }
    const sent = await emailConnectionTransition(t);
    if (t.to === "broken" && !sent) {
      console.error(
        `[conn-monitor] DOWN alert for "${t.name}" could not be delivered — outage may go unnoticed.`,
      );
    }
  }
}
