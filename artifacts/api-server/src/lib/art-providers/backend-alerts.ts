/**
 * Render-backend offline/recovery alerting.
 *
 * Admins otherwise only notice a backend dropping if they happen to have the
 * Art Library open. This module watches each *configured* backend's live health
 * (the same probe that powers the admin picker) and emails admins when a backend
 * transitions online→offline (a downed cloud GPU node) or recovers offline→online.
 *
 * Flapping protection: a transition must HOLD for ALERT_DEBOUNCE_MS across
 * consecutive probes before it fires, so a node that bounces in and out within
 * the debounce window never spams. The very first observation per backend only
 * establishes a silent baseline — we never alert "online" at boot.
 *
 * Silenceable: set ART_BACKEND_ALERTS to off/false/0/no to disable entirely.
 */

import {
  listProviderSummariesWithHealth,
  type ProviderSummary,
  type ProviderHealth,
} from "./index";
import { getUncachableResendClient } from "../resend";
import { ownerEmails } from "../plan";

/** Only these two states drive alerts; "unknown"/"not-configured" are ignored. */
type AlertHealth = "online" | "offline";

/** A confirmed (debounced) transition ready to email. */
export interface BackendTransition {
  id: string;
  label: string;
  from: AlertHealth;
  to: AlertHealth;
  lastError: string | null;
}

interface ProviderAlertState {
  /** Last settled health we've alerted from (null until baseline is set). */
  stable: AlertHealth | null;
  /** A candidate health that differs from `stable`, awaiting debounce. */
  pending: AlertHealth | null;
  /** When `pending` was first observed (ms epoch). */
  pendingSince: number;
}

/**
 * A confirmed transition must persist this long before it emails, so a flapping
 * node (offline→online→offline within the window) never triggers a send.
 */
export const ALERT_DEBOUNCE_MS = 2 * 60_000;

/** How often the background poller re-probes backends (> probe cache TTL). */
export const ALERT_POLL_INTERVAL_MS = 60_000;

/** Per-provider debounce state, keyed by provider id. */
const states = new Map<string, ProviderAlertState>();

/** Drop all remembered state (tests + any future explicit reset). */
export function resetBackendAlertState(): void {
  states.clear();
}

/** Is the alerting subsystem enabled? Default on; silenced via env. */
export function artBackendAlertsEnabled(): boolean {
  const raw = (process.env.ART_BACKEND_ALERTS ?? "").trim().toLowerCase();
  return !(raw === "off" || raw === "false" || raw === "0" || raw === "no");
}

/** Map a probe health to the two states that drive alerts (or null to ignore). */
function alertHealthOf(h: ProviderHealth | undefined): AlertHealth | null {
  return h === "online" ? "online" : h === "offline" ? "offline" : null;
}

/**
 * Fold a fresh batch of provider summaries into the per-provider debounce state
 * and return the transitions that have now held long enough to alert on.
 *
 * Pure with respect to email: it only mutates the in-memory debounce map and
 * returns what *should* be sent, so it can be unit-tested by feeding successive
 * snapshots with an explicit `now`.
 */
export function reconcileBackendHealth(
  summaries: ProviderSummary[],
  now: number = Date.now(),
): BackendTransition[] {
  const transitions: BackendTransition[] = [];
  for (const s of summaries) {
    const cur = alertHealthOf(s.health);
    if (cur === null) continue; // unknown / not-configured — nothing to track

    const st = states.get(s.id) ?? { stable: null, pending: null, pendingSince: 0 };

    // First time we see this backend: record a silent baseline, never alert.
    if (st.stable === null) {
      st.stable = cur;
      st.pending = null;
      st.pendingSince = 0;
      states.set(s.id, st);
      continue;
    }

    // Settled back to the known-good state before debounce elapsed — drop pending.
    if (cur === st.stable) {
      st.pending = null;
      st.pendingSince = 0;
      states.set(s.id, st);
      continue;
    }

    // Differs from stable. (Re)start the debounce clock whenever the candidate
    // changes, so a flap resets the timer instead of accumulating toward a send.
    if (st.pending !== cur) {
      st.pending = cur;
      st.pendingSince = now;
    }
    states.set(s.id, st);

    if (now - st.pendingSince >= ALERT_DEBOUNCE_MS) {
      transitions.push({
        id: s.id,
        label: s.label,
        from: st.stable,
        to: cur,
        lastError: s.lastError ?? null,
      });
      st.stable = cur;
      st.pending = null;
      st.pendingSince = 0;
      states.set(s.id, st);
    }
  }
  return transitions;
}

/** Recipients: explicit ART_BACKEND_ALERT_EMAIL list, else all owner emails. */
function resolveRecipients(): string[] {
  const explicit = (process.env.ART_BACKEND_ALERT_EMAIL || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  return ownerEmails();
}

/** Build the email body for one transition. */
export function renderTransitionEmail(t: BackendTransition): {
  subject: string;
  html: string;
  text: string;
} {
  const recovered = t.to === "online";
  const word = recovered ? "RECOVERED" : "OFFLINE";
  const subject = `[SALARYMAN] Render backend "${t.label}" is ${word}`;
  const when = new Date().toUTCString();
  const errLine = !recovered && t.lastError
    ? `<p style="color:#b00020;margin:8px 0 0;"><b>Last error:</b> ${escapeHtml(t.lastError)}</p>`
    : "";
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;">
      <h2 style="margin:0 0 4px;">Render backend ${recovered ? "recovered" : "went offline"}</h2>
      <p style="color:#666;margin:0 0 12px;">${when}</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Backend</td><td><b>${escapeHtml(t.label)}</b> (${escapeHtml(t.id)})</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Transition</td><td>${t.from} → <b>${t.to}</b></td></tr>
      </table>
      ${errLine}
      ${recovered ? "" : `<p style="margin-top:14px;">A configured render backend stopped answering its health probe. Check the cloud GPU node before art generation routed to it stalls.</p>`}
    </div>`;
  const text =
    `Render backend "${t.label}" (${t.id}) ${recovered ? "recovered" : "went offline"}\n` +
    `${when}\nTransition: ${t.from} -> ${t.to}\n` +
    (!recovered && t.lastError ? `Last error: ${t.lastError}\n` : "");
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Email a single confirmed transition to admins. Returns true on success. */
async function emailTransition(t: BackendTransition): Promise<boolean> {
  const recipients = resolveRecipients();
  if (!recipients.length) {
    console.warn(
      "[art-alerts] No recipient configured (set ART_BACKEND_ALERT_EMAIL or OWNER_EMAILS); skipping email.",
    );
    return false;
  }
  const { subject, html, text } = renderTransitionEmail(t);
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({ from: fromEmail, to: recipients, subject, html, text });
    console.log(`[art-alerts] ${t.label} ${t.from}->${t.to} emailed to ${recipients.length} recipient(s)`);
    return true;
  } catch (e: any) {
    console.error(`[art-alerts] Failed to email ${t.label} ${t.from}->${t.to}: ${e?.message || e}`);
    return false;
  }
}

/**
 * One poll tick: re-probe every backend, fold the result into the debounce
 * state, and email any confirmed transitions. Safe to call on an interval.
 * No-op (and no probe) when the subsystem is silenced via env.
 */
export async function pollBackendHealth(): Promise<void> {
  if (!artBackendAlertsEnabled()) return;
  const summaries = await listProviderSummariesWithHealth();
  const transitions = reconcileBackendHealth(summaries);
  for (const t of transitions) {
    await emailTransition(t);
  }
}
