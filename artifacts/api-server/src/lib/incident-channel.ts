/**
 * Push a ready-made incident report (the exact plain-text produced by the Art
 * Library's "Copy all" downtime dump) straight to a shared on-call channel, so
 * during a real backend outage an admin can broadcast it without a manual paste.
 *
 * Two destinations are supported, both reusing config that already exists for
 * the automatic backend-offline alerts:
 *   - Discord: a server webhook URL (INCIDENT_DISCORD_WEBHOOK_URL, falling back
 *     to the documented DISCORD_WEBHOOK_URL).
 *   - Email: Resend, to ART_BACKEND_ALERT_EMAIL (else all owner emails) — the
 *     same recipients the offline/recovery alerts already go to.
 *
 * The caller hands us the already-formatted report text (built by
 * buildAllHistoryCopyText on the client) so there is exactly one report format.
 */

import { createHash } from "crypto";
import { getUncachableResendClient } from "./resend";
import { ownerEmails } from "./plan";
import { isValidDiscordWebhookUrl } from "./discord-webhook";
import { safeFetch } from "./safe-fetch";

/** Reject absurdly large payloads outright (the real report is a few KB). */
export const INCIDENT_REPORT_MAX_CHARS = 20_000;

/**
 * How long an identical report is considered a "duplicate". During a real
 * outage an admin is likely to double-click, or two admins both react, and we
 * don't want to spam the shared channel + on-call inboxes with the same dump.
 */
export const INCIDENT_DEDUP_WINDOW_MS = 60_000;

/**
 * hash(report text) + channel -> epoch ms when that exact report was last
 * claimed FOR THAT CHANNEL. Dedup is per-channel so a "retry failed only" send
 * isn't blocked by the claim of a channel that already delivered, and the SAME
 * report aimed at a different destination (e.g. Discord-only after email-only)
 * is treated as a distinct per-channel alert rather than silently suppressed.
 */
const recentChannelClaims = new Map<string, number>();

/** Stable fingerprint of a report so identical text dedupes regardless of size. */
function reportFingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Per-channel dedup key: the report fingerprint scoped to one channel. */
function channelClaimKey(text: string, channel: IncidentChannel): string {
  return `${reportFingerprint(text)}:${channel}`;
}

export interface IncidentClaim {
  /** Channels claimed just now — safe to deliver (no recent identical send). */
  fresh: IncidentChannel[];
  /** Channels blocked by a recent identical send — skip to avoid re-broadcast. */
  duplicate: IncidentChannel[];
  /** How long ago (ms) the most-recent duplicate channel was last claimed. */
  sentAgoMs?: number;
}

/**
 * Atomically try to claim the right to broadcast this exact report to each of
 * the given channels. For every channel, the first caller within the dedup
 * window wins (claim recorded, channel returned in `fresh`); any identical
 * report+channel that arrives before the window elapses is reported in
 * `duplicate` so the route can skip re-sending to a channel that already got it.
 * Claiming up-front (before delivery) also coalesces concurrent double-clicks
 * that race in before the first send finishes.
 *
 * Per-channel claiming is what makes "retry failed only" work: when the original
 * send delivered to Discord but email failed, the route releases only the failed
 * channel's claim, so a retry targeting email is fresh while a retry targeting
 * the already-delivered Discord is still deduped.
 */
export function claimIncidentReport(
  text: string,
  channels: IncidentChannel[],
  now: number = Date.now(),
): IncidentClaim {
  // Opportunistic prune so the Map can't grow unbounded across many distinct reports.
  for (const [k, t] of recentChannelClaims) {
    if (now - t >= INCIDENT_DEDUP_WINDOW_MS) recentChannelClaims.delete(k);
  }
  const fresh: IncidentChannel[] = [];
  const duplicate: IncidentChannel[] = [];
  let sentAgoMs: number | undefined;
  for (const channel of channels) {
    const key = channelClaimKey(text, channel);
    const prev = recentChannelClaims.get(key);
    if (prev !== undefined && now - prev < INCIDENT_DEDUP_WINDOW_MS) {
      duplicate.push(channel);
      const ago = now - prev;
      // Report the most-recent duplicate so the UI's "sent N ago" is the freshest.
      if (sentAgoMs === undefined || ago < sentAgoMs) sentAgoMs = ago;
    } else {
      recentChannelClaims.set(key, now);
      fresh.push(channel);
    }
  }
  return { fresh, duplicate, sentAgoMs };
}

/**
 * Release previously-made per-channel claims. Used for channels whose send
 * failed (or was skipped) so a genuine retry of the same report to those
 * channels isn't blocked by its own (now-pointless) claim. Omitting `channels`
 * releases every channel's claim for this report (bulk release).
 */
export function releaseIncidentReport(text: string, channels?: IncidentChannel[]): void {
  const targets = channels ?? ALL_INCIDENT_CHANNELS;
  for (const channel of targets) recentChannelClaims.delete(channelClaimKey(text, channel));
}

/** Test-only: drop all dedup state so each test starts from a clean window. */
export function __resetIncidentDedup(): void {
  recentChannelClaims.clear();
}

/** Discord rejects messages over 2000 chars; chunk with headroom for fences. */
const DISCORD_CHUNK_LIMIT = 1900;

export type IncidentChannel = "discord" | "email";

/** Every incident channel, in a stable order (used as the default selection). */
export const ALL_INCIDENT_CHANNELS: IncidentChannel[] = ["discord", "email"];

export interface IncidentDeliveryResult {
  /** Channels that accepted the report. */
  delivered: IncidentChannel[];
  /** Channels that were configured but failed to deliver. */
  failed: IncidentChannel[];
  /** Channels that exist but aren't configured (no webhook / no recipients). */
  skipped: IncidentChannel[];
}

/**
 * Split a report into Discord-sized chunks, never breaking a line mid-way. A
 * single line longer than the limit is hard-split as a last resort. Pure, so it
 * can be unit-tested without touching the network.
 */
export function splitForDiscord(text: string, limit = DISCORD_CHUNK_LIMIT): string[] {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.length) {
      chunks.push(current);
      current = "";
    }
  };
  for (const rawLine of text.split("\n")) {
    // A line that can't fit on its own — hard-split it into limit-sized pieces.
    if (rawLine.length > limit) {
      flush();
      for (let i = 0; i < rawLine.length; i += limit) {
        chunks.push(rawLine.slice(i, i + limit));
      }
      continue;
    }
    const candidate = current.length ? `${current}\n${rawLine}` : rawLine;
    if (candidate.length > limit) {
      flush();
      current = rawLine;
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}

/** The Discord incident webhook URL, validated, or null if not configured. */
export function resolveIncidentWebhookUrl(): string | null {
  const raw = (process.env.INCIDENT_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || "").trim();
  if (!raw) return null;
  return isValidDiscordWebhookUrl(raw) ? raw : null;
}

/** Email recipients: explicit ART_BACKEND_ALERT_EMAIL list, else owner emails. */
export function resolveIncidentRecipients(): string[] {
  const explicit = (process.env.ART_BACKEND_ALERT_EMAIL || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  return ownerEmails();
}

/** Which incident channels are currently configured (for the UI / 503 guard). */
export function incidentChannelsConfigured(): { discord: boolean; email: boolean; any: boolean } {
  const discord = resolveIncidentWebhookUrl() !== null;
  const email = resolveIncidentRecipients().length > 0;
  return { discord, email, any: discord || email };
}

/** First non-empty line of the report, used as the email subject suffix. */
function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "Backend downtime report";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function postToDiscord(webhookUrl: string, text: string): Promise<boolean> {
  try {
    for (const chunk of splitForDiscord(text)) {
      const response = await safeFetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "PABLO CORP · Incident", content: "```\n" + chunk + "\n```" }),
        timeoutMs: 8000,
      });
      if (!response.ok) {
        console.error(`[incident] Discord rejected report chunk: HTTP ${response.status}`);
        return false;
      }
    }
    return true;
  } catch (e: any) {
    console.error(`[incident] Failed to post report to Discord: ${e?.message || e}`);
    return false;
  }
}

async function emailReport(recipients: string[], text: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const subject = `[SALARYMAN] ${firstLine(text)}`;
    const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;font-size:13px;line-height:1.4;">${escapeHtml(text)}</pre>`;
    await client.emails.send({ from: fromEmail, to: recipients, subject, html, text });
    return true;
  } catch (e: any) {
    console.error(`[incident] Failed to email report: ${e?.message || e}`);
    return false;
  }
}

/**
 * Deliver the report to the selected incident channels (defaulting to all of
 * them). Channels that aren't configured are reported as `skipped` (not
 * failures), so the UI can tell "no destination set up" apart from "the send
 * failed". Channels the caller didn't select are left out entirely — they appear
 * in none of the result buckets.
 */
export async function deliverIncidentReport(
  text: string,
  channels?: IncidentChannel[],
): Promise<IncidentDeliveryResult> {
  const selected = channels && channels.length ? channels : ALL_INCIDENT_CHANNELS;
  const wants = (c: IncidentChannel) => selected.includes(c);

  const delivered: IncidentChannel[] = [];
  const failed: IncidentChannel[] = [];
  const skipped: IncidentChannel[] = [];

  if (wants("discord")) {
    const webhookUrl = resolveIncidentWebhookUrl();
    if (webhookUrl) {
      (await postToDiscord(webhookUrl, text)) ? delivered.push("discord") : failed.push("discord");
    } else {
      skipped.push("discord");
    }
  }

  if (wants("email")) {
    const recipients = resolveIncidentRecipients();
    if (recipients.length) {
      (await emailReport(recipients, text)) ? delivered.push("email") : failed.push("email");
    } else {
      skipped.push("email");
    }
  }

  return { delivered, failed, skipped };
}
