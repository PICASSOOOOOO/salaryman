import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import GodotArtPreview from '@/components/GodotArtPreview';
import ArtFamilyMatrix from '@/components/ArtFamilyMatrix';
import GameAssetGallery from '@/components/GameAssetGallery';
import GeneratedArtReviewBoard from '@/components/GeneratedArtReviewBoard';
import { Loader2, RefreshCw, Sparkles, Palette, Wand2, Scissors, ImageOff, FlaskConical, CheckCircle2, XCircle, Trash2, Copy, Check, Send, Download } from 'lucide-react';

/**
 * Admin art library — the "Unreal-style Art Factory" control surface.
 *
 * Owner-only. Lets an admin see which backend baked each asset, re-bake any key
 * on a chosen backend (Nano Banana / fal.ai / future Unreal node), and run an
 * optional polish pass (upscale / background-remove) on a finished asset.
 *
 * The game's art consumption (useArtAsset) is untouched — this only drives the
 * existing /api/art admin endpoints.
 */

interface PolishView {
  state: 'processing' | 'failed';
  op: string;
  error: string | null;
  startedAt: number;
}

interface ArtAsset {
  id: number;
  key: string;
  category: string;
  url: string | null;
  status: string;
  aspectRatio: string;
  backend: string;
  jobType: string | null;
  mediaType: string | null;
  failMsg: string | null;
  qa?: {
    state: 'technical_pass' | 'needs_review' | 'failed';
    mimeType: string | null;
    width: number | null;
    height: number | null;
    byteLength: number | null;
    hasAlpha: boolean | null;
    failures: string[];
    reviewReasons: string[];
  } | null;
  // In-flight (or just-failed) async video-enhancement job, polled by the UI.
  polish?: PolishView | null;
}

type JobType = 'object' | 'landscape' | 'cinematic';
const JOB_TYPES: JobType[] = ['object', 'landscape', 'cinematic'];

type ProviderHealth = 'online' | 'offline' | 'not-configured' | 'unknown' | 'checking';

// One server-recorded health transition: the time it flipped + the new state.
interface ProviderHealthEvent {
  at: number;
  health: ProviderHealth;
}

interface ProviderSummary {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  isDefault: boolean;
  health?: ProviderHealth;
  lastError?: string | null;
  // Server-tracked: when the current health began (survives reloads, shared
  // across admins). Older responses may omit it; we fall back to "checked … ago".
  lastChangedAt?: number;
  // Server-tracked recent transitions (most-recent-first) for the history list.
  healthHistory?: ProviderHealthEvent[];
}

// Reachability badge styling + label per health state.
const HEALTH_BADGE: Record<ProviderHealth, { label: string; cls: string }> = {
  online: { label: 'online', cls: 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10' },
  offline: { label: 'offline', cls: 'border-red-500/25 text-red-400 bg-red-500/10' },
  'not-configured': { label: 'no key', cls: 'border-zinc-600/25 text-zinc-500 bg-zinc-600/10' },
  unknown: { label: 'ready', cls: 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10' },
  checking: { label: 'checking…', cls: 'border-amber-500/25 text-amber-400 bg-amber-500/10 animate-pulse' },
};

// Older responses may omit `health`; derive it from `configured` so the chip and
// the transition tracking agree on a single health value.
const deriveHealth = (p: ProviderSummary): ProviderHealth =>
  p.health ?? (p.configured ? 'unknown' : 'not-configured');

// Compact relative duration ("5s", "3m", "2h", "1d") for the last-changed chip.
// Exported for unit tests (see ArtLibrary.status-chip.test.tsx).
export function relativeDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Absolute wall-clock timestamp for a transition ("Jun 16, 2026, 2:04:31 PM"),
// used in tooltips/titles alongside the relative "Nm ago" so admins can correlate
// a backend flip with errors elsewhere. Exported for unit tests.
export function absoluteTime(at: number): string {
  return new Date(at).toLocaleString();
}

// Plain-text, newline-separated dump of a backend's recent transitions for
// pasting straight into an incident ticket or chat. First line is the backend
// label; each subsequent line is "<health> · <absolute time>". Exported for
// unit tests.
export function buildHistoryCopyText(label: string, history: ProviderHealthEvent[]): string {
  const lines = history.map(
    ev => `${HEALTH_BADGE[ev.health]?.label ?? ev.health} · ${absoluteTime(ev.at)}`,
  );
  return [label, ...lines].join('\n');
}

// Full-fleet health tally. Counts every backend by its derived health so the
// summary always accounts for the complete fleet, not just online/offline.
// 'unknown' folds in 'checking' (both mean "configured but not yet confirmed").
// Exported for unit tests and shared by the on-screen summary + copied report.
export interface FleetHealthSummary {
  online: number;
  offline: number;
  notConfigured: number;
  unknown: number;
}

export function summarizeFleetHealth(providers: ProviderSummary[]): FleetHealthSummary {
  let online = 0;
  let offline = 0;
  let notConfigured = 0;
  let unknown = 0;
  for (const p of providers) {
    const h = deriveHealth(p);
    if (h === 'online') online += 1;
    else if (h === 'offline') offline += 1;
    else if (h === 'not-configured') notConfigured += 1;
    else unknown += 1; // 'unknown' or 'checking'
  }
  return { online, offline, notConfigured, unknown };
}

// One-line fleet summary parts ("2 online", "1 offline", …). Online/offline are
// always shown; not-configured / unknown only when present. Shared by the copied
// incident report and the on-screen summary so their wording stays identical.
export function buildHealthSummaryParts(summary: FleetHealthSummary): string[] {
  const parts = [`${summary.online} online`, `${summary.offline} offline`];
  if (summary.notConfigured > 0) parts.push(`${summary.notConfigured} not configured`);
  if (summary.unknown > 0) parts.push(`${summary.unknown} unknown`);
  return parts;
}

// Full plain-text incident report for the "Copy all" action: a header line with
// the absolute report time and a one-line summary of how many backends are
// currently online vs offline (plus not-configured / unknown-or-checking when
// any are present, so the summary always accounts for the full fleet), followed
// by each backend's recent-transition block (grouped by label, blank-line
// separated). Self-contained and timestamped so it can be pasted straight into
// an incident ticket. Exported for unit tests.
export function buildAllHistoryCopyText(providers: ProviderSummary[], at: number): string {
  const parts = buildHealthSummaryParts(summarizeFleetHealth(providers));
  const header = `Backend downtime report · ${absoluteTime(at)}\n${parts.join(' · ')}`;
  const blocks = providers.map(p =>
    buildHistoryCopyText(p.label, (p.healthHistory ?? []).slice(1)),
  );
  return [header, ...blocks].join('\n\n');
}

/** The two incident destinations a report can be delivered to. */
type IncidentChannelId = 'discord' | 'email';

/** Human label for a channel id (tolerates unknown ids from older servers). */
function channelLabel(c: string): string {
  return c === 'discord' ? 'Discord' : c === 'email' ? 'Email' : c;
}

/**
 * Shape of the 409 body the incident-report route returns when a send is deduped.
 * Every field is optional so an older server (or a malformed body) degrades to the
 * generic note rather than throwing.
 */
interface DedupeInfo {
  channels?: string[];
  sentAgoMs?: number;
  windowMs?: number;
}

/**
 * Build the admin-facing "blocked duplicate" note from a 409 body. Names which
 * channel(s) the duplicate targeted (so a per-channel cooldown is distinguishable
 * from the same report aimed elsewhere) and a rough countdown to when the window
 * clears, derived from sentAgoMs/windowMs. Falls back gracefully field-by-field so
 * an older server that omits any piece still gets a sensible message — and both
 * the single-backend and all-backends notes stay identical.
 */
export function formatDedupeNote(data: DedupeInfo | null | undefined): string {
  const channels = Array.isArray(data?.channels)
    ? data!.channels.filter((c): c is string => typeof c === 'string')
    : [];
  const where = channels.length ? ` to ${channels.map(channelLabel).join(' + ')}` : '';
  let countdown = '';
  if (typeof data?.sentAgoMs === 'number' && typeof data?.windowMs === 'number') {
    const remainingMs = data.windowMs - data.sentAgoMs;
    if (remainingMs > 0) countdown = ` — retry in ${Math.ceil(remainingMs / 1000)}s`;
  }
  return `Already sent${where} moments ago${countdown}`;
}

// Overall outcome of a send, derived from the server's delivered/failed/skipped
// arrays so a partial failure (some delivered, some failed/skipped) is visually
// distinct from a full success and a full failure. 'error' covers the cases
// where no per-channel breakdown exists (no channel configured, deduped, network
// error). Exported for unit tests.
export type IncidentOutcome = 'success' | 'partial' | 'failed';

export function classifyIncidentDelivery(
  delivered: readonly string[],
  failed: readonly string[],
  skipped: readonly string[],
): IncidentOutcome {
  if (delivered.length === 0) return 'failed';
  if (failed.length === 0 && skipped.length === 0) return 'success';
  return 'partial';
}

/** Full per-channel result of a send, surfaced as a persistent breakdown. */
interface IncidentResult {
  // 'error' = no breakdown available (no channel set up, deduped, network fail).
  outcome: IncidentOutcome | 'error';
  delivered: string[];
  failed: string[];
  skipped: string[];
  // Human message for the 'error' outcome (e.g. "Already sent moments ago").
  message?: string;
}

/** Which incident destinations the server currently has configured. */
interface IncidentChannelsConfig {
  discord: boolean;
  email: boolean;
  any: boolean;
}

interface LibraryResponse {
  configured: boolean;
  providers: ProviderSummary[];
  polishConfigured: boolean;
  incidentChannels?: IncidentChannelsConfig;
  total: number;
  ready: number;
  pending: number;
  failed: number;
  needsReview?: number;
  testRenderCount?: number;
  assets: ArtAsset[];
}

interface TestRenderJob {
  key: string;
  jobType: string;
  asset: ArtAsset;
}

interface TestRenderResponse {
  backend: string;
  configured: boolean;
  jobs: TestRenderJob[];
}

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  needs_review: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  failed: 'bg-red-500/15 text-red-400 border-red-500/25',
};

const BACKEND_STYLES: Record<string, string> = {
  'nano-banana': 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  fal: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20',
  unreal: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  blender: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
};

export default function ArtLibrary() {
  const [assets, setAssets] = useState<ArtAsset[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  // Timestamp of the last successful providers fetch (drives "checked Ns ago" for
  // older servers that don't return a server-tracked lastChangedAt).
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  // Providers currently flashing a transition highlight (online↔offline).
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  // Which provider's recent-history list is expanded (one at a time).
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  // Triage filter: when on, hide healthy (online) backends so only
  // offline / not-configured / unknown chips show. Resets on reload.
  const [showOnlyTroubled, setShowOnlyTroubled] = useState(false);
  // Which provider just had its history copied (drives the brief "copied" note).
  const [copiedHistory, setCopiedHistory] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which provider just had its history downloaded (drives the brief "saved" note).
  const [downloadedHistory, setDownloadedHistory] = useState<string | null>(null);
  const downloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which provider's history is currently being sent to the incident channel.
  const [sendingHistory, setSendingHistory] = useState<string | null>(null);
  // Brief per-backend send result note (keyed by id so only the clicked backend shows it).
  const [sentHistoryNote, setSentHistoryNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const sendHistoryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Brief "copied" confirmation for the "copy all backends" incident dump.
  const [copiedAll, setCopiedAll] = useState(false);
  const copyAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Send to incident channel" in-flight + brief result confirmation/error note.
  const [sendingIncident, setSendingIncident] = useState(false);
  // Persistent per-channel result of the last send (delivered / failed / skipped)
  // so an admin gets a clear breakdown that stays visible long enough to read.
  const [incidentResult, setIncidentResult] = useState<IncidentResult | null>(null);
  const incidentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Exact report text of the most recent fresh send, captured so a retry reuses
  // it verbatim. Regenerating would stamp a new "as of" time and change the
  // server's dedup fingerprint, weakening the per-channel re-broadcast guard.
  const lastSentReportRef = useRef<string | null>(null);
  // Brief "downloaded" confirmation for the "download all backends" .txt export.
  const [downloadedAll, setDownloadedAll] = useState(false);
  const downloadAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which incident destinations the server has configured (Discord / email).
  const [incidentChannels, setIncidentChannels] = useState<IncidentChannelsConfig | null>(null);
  // Which configured channels the admin has selected to send to (defaults to all
  // configured ones). Only configured channels can ever be selected.
  const [selectedChannels, setSelectedChannels] = useState<Set<'discord' | 'email'>>(new Set());
  // 1s ticker so the relative "… ago" labels count up between polls.
  const [now, setNow] = useState(() => Date.now());
  // Last health value seen per provider, to detect transitions across polls.
  const prevHealthRef = useRef<Record<string, ProviderHealth>>({});
  // Per-provider flash-clear timers.
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [polishConfigured, setPolishConfigured] = useState(false);
  const [stats, setStats] = useState({ total: 0, ready: 0, pending: 0, failed: 0, needsReview: 0 });
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Per-asset chosen backend for the next regenerate (defaults to current backend).
  const [pickBackend, setPickBackend] = useState<Record<string, string>>({});
  // Per-asset chosen render job type (only used by the Unreal node backend).
  const [pickJobType, setPickJobType] = useState<Record<string, string>>({});
  // One-click "Test render" — which backend to smoke-test and its live results.
  const [testBackend, setTestBackend] = useState<string>('');
  const [testRunning, setTestRunning] = useState(false);
  const [testNotConfigured, setTestNotConfigured] = useState(false);
  const [testJobs, setTestJobs] = useState<TestRenderJob[]>([]);
  const [testError, setTestError] = useState<string | null>(null);
  // How many throwaway test-render rows are stored (category "__test__").
  const [testRenderCount, setTestRenderCount] = useState(0);
  // Last "Cleared N test results" confirmation after a successful clear.
  const [testClearedMsg, setTestClearedMsg] = useState<string | null>(null);
  const testPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Bake portraits" — admin trigger to force-bake all 9 char-template portraits.
  const [bakingPortraits, setBakingPortraits] = useState(false);
  const [bakePortraitsResult, setBakePortraitsResult] = useState<{ kicked: number; ready: number; results: { key: string; status: string }[] } | null>(null);
  const [bakePortraitsError, setBakePortraitsError] = useState<string | null>(null);

  // Single place that ingests a fresh providers list: stores it, stamps the
  // "checked" time, and detects per-provider health transitions so each chip can
  // flash when a node flips online↔offline. The "changed … ago" timeline itself
  // now comes from the server (p.lastChangedAt), so it survives reloads.
  const applyProviders = useCallback((list: ProviderSummary[]) => {
    const ts = Date.now();
    setProviders(list);
    setLastCheckedAt(ts);
    const prev = prevHealthRef.current;
    const next: Record<string, ProviderHealth> = {};
    const transitioned: string[] = [];
    for (const p of list) {
      const h = deriveHealth(p);
      next[p.id] = h;
      // Only count a real transition (we've seen this provider before and it changed).
      if (prev[p.id] !== undefined && prev[p.id] !== h) transitioned.push(p.id);
    }
    prevHealthRef.current = next;
    if (transitioned.length === 0) return;
    setFlashing(f => {
      const copy = { ...f };
      for (const id of transitioned) copy[id] = true;
      return copy;
    });
    for (const id of transitioned) {
      if (flashTimers.current[id]) clearTimeout(flashTimers.current[id]);
      flashTimers.current[id] = setTimeout(() => {
        setFlashing(f => { const c = { ...f }; delete c[id]; return c; });
        delete flashTimers.current[id];
      }, 1800);
    }
  }, []);

  // Clear any pending flash timers on unmount.
  useEffect(() => () => {
    Object.values(flashTimers.current).forEach(clearTimeout);
    flashTimers.current = {};
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (downloadTimer.current) clearTimeout(downloadTimer.current);
    if (sendHistoryTimer.current) clearTimeout(sendHistoryTimer.current);
    if (copyAllTimer.current) clearTimeout(copyAllTimer.current);
    if (incidentTimer.current) clearTimeout(incidentTimer.current);
    if (downloadAllTimer.current) clearTimeout(downloadAllTimer.current);
  }, []);

  // Copy a backend's recent transition history (label + each health + absolute
  // time) to the clipboard as plain text for pasting into an incident ticket.
  const copyHistory = useCallback(async (p: ProviderSummary, history: ProviderHealthEvent[]) => {
    const out = buildHistoryCopyText(p.label, history);
    try {
      await navigator.clipboard?.writeText(out);
    } catch {
      // Clipboard may be unavailable (insecure context / denied permission); we
      // still flash the confirmation so the action feels responsive.
    }
    setCopiedHistory(p.id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedHistory(null), 1500);
  }, []);

  // Save a SINGLE backend's recent transitions (the SAME buildHistoryCopyText
  // dump as its "copy" action — no divergent format) to a timestamped .txt file,
  // so an admin investigating one flaky backend can archive just that backend's
  // history without the noise of every other backend.
  const downloadHistory = useCallback((p: ProviderSummary, history: ProviderHealthEvent[]) => {
    const out = buildHistoryCopyText(p.label, history);
    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    // Filename-safe local timestamp, e.g. "backend-downtime-falai-2026-06-16T14-04-31.txt".
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.href = url;
    a.download = `backend-downtime-${p.id}-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloadedHistory(p.id);
    if (downloadTimer.current) clearTimeout(downloadTimer.current);
    downloadTimer.current = setTimeout(() => setDownloadedHistory(null), 1500);
  }, []);

  // Push a SINGLE backend's recent transitions (the SAME buildHistoryCopyText
  // dump as its "copy"/"download" actions — no divergent format) straight to the
  // configured shared incident channel(s), so an admin investigating one flaky
  // backend can alert on-call about just that backend without the noise of every
  // other backend. Reuses the all-backends sendIncidentReport delivery + note
  // pattern, but the in-flight + result state is keyed by backend id.
  const sendHistory = useCallback(async (p: ProviderSummary, history: ProviderHealthEvent[]) => {
    if (sendingHistory) return;
    if (selectedChannels.size === 0) return;
    setSendingHistory(p.id);
    setSentHistoryNote(null);
    const out = buildHistoryCopyText(p.label, history);
    try {
      const res = await apiFetch('/api/art/incident-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Honour the same destination picker the all-backends send uses, so an
        // admin can route one flaky backend's alert to just Discord (or just
        // email) instead of broadcasting to every configured channel.
        body: JSON.stringify({ text: out, channels: Array.from(selectedChannels) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const channels = Array.isArray(data.delivered) ? data.delivered : [];
        const label = channels.length ? `Sent (${channels.join(' + ')})` : 'Sent';
        setSentHistoryNote({ id: p.id, ok: true, text: label });
      } else if (res.status === 503) {
        setSentHistoryNote({ id: p.id, ok: false, text: 'No channel set up' });
      } else if (res.status === 409 && data?.deduped) {
        setSentHistoryNote({ id: p.id, ok: false, text: formatDedupeNote(data) });
      } else {
        setSentHistoryNote({ id: p.id, ok: false, text: 'Send failed' });
      }
    } catch {
      setSentHistoryNote({ id: p.id, ok: false, text: 'Send failed' });
    } finally {
      setSendingHistory(null);
      if (sendHistoryTimer.current) clearTimeout(sendHistoryTimer.current);
      sendHistoryTimer.current = setTimeout(() => setSentHistoryNote(null), 3000);
    }
  }, [sendingHistory, selectedChannels]);

  // Copy EVERY backend's recent transitions in one plain-text block (grouped by
  // backend label, separated by blank lines) for a broad-incident report, so an
  // admin doesn't have to expand and copy each backend one at a time.
  const copyAllHistory = useCallback(async () => {
    const out = buildAllHistoryCopyText(providers, Date.now());
    try {
      await navigator.clipboard?.writeText(out);
    } catch {
      // Clipboard may be unavailable (insecure context / denied permission); we
      // still flash the confirmation so the action feels responsive.
    }
    setCopiedAll(true);
    if (copyAllTimer.current) clearTimeout(copyAllTimer.current);
    copyAllTimer.current = setTimeout(() => setCopiedAll(false), 1500);
  }, [providers]);

  // Push the SAME report (buildAllHistoryCopyText output — no divergent format)
  // straight to the configured shared incident channel(s) so the on-call team
  // sees it without a manual paste. Confirmation/error mirrors the "Copied" note.
  // `channelOverride` lets a retry target only a subset (e.g. just the channels
  // that failed); when omitted the admin's current picker selection is used.
  // `reportTextOverride` lets a retry reuse the EXACT text of the original send
  // (so the server's fingerprint matches and an already-delivered channel stays
  // deduped); when omitted a fresh report is built and captured for later retry.
  const sendIncidentReport = useCallback(async (channelOverride?: IncidentChannelId[], reportTextOverride?: string) => {
    if (sendingIncident) return;
    const channels = channelOverride ?? Array.from(selectedChannels);
    if (channels.length === 0) return;
    setSendingIncident(true);
    setIncidentResult(null);
    if (incidentTimer.current) { clearTimeout(incidentTimer.current); incidentTimer.current = null; }
    const out = reportTextOverride ?? buildAllHistoryCopyText(providers, Date.now());
    // Capture the text of a fresh (non-retry) send so a later retry can resend it
    // verbatim instead of regenerating with a new timestamp.
    if (reportTextOverride === undefined) lastSentReportRef.current = out;
    let result: IncidentResult;
    try {
      const res = await apiFetch('/api/art/incident-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: out, channels }),
      });
      const data = await res.json().catch(() => ({}));
      const delivered = Array.isArray(data.delivered) ? data.delivered : [];
      const failed = Array.isArray(data.failed) ? data.failed : [];
      const skipped = Array.isArray(data.skipped) ? data.skipped : [];
      const hasBreakdown = delivered.length > 0 || failed.length > 0 || skipped.length > 0;
      if (res.ok || hasBreakdown) {
        // Both the 200 (some delivered) and 502 (none delivered) responses carry
        // the full per-channel breakdown — classify it into a clear outcome.
        result = { outcome: classifyIncidentDelivery(delivered, failed, skipped), delivered, failed, skipped };
      } else if (res.status === 503) {
        result = { outcome: 'error', delivered, failed, skipped, message: 'No incident channel configured' };
      } else if (res.status === 409 && data?.deduped) {
        result = { outcome: 'error', delivered, failed, skipped, message: formatDedupeNote(data) };
      } else {
        result = { outcome: 'error', delivered, failed, skipped, message: 'Send failed' };
      }
    } catch {
      result = { outcome: 'error', delivered: [], failed: [], skipped: [], message: 'Send failed' };
    } finally {
      setSendingIncident(false);
    }
    setIncidentResult(result);
    // A clean full success can quietly fade; anything an admin needs to act on
    // (partial, failed, error) stays pinned until the next send.
    if (result.outcome === 'success') {
      incidentTimer.current = setTimeout(() => setIncidentResult(null), 6000);
    }
  }, [providers, sendingIncident, selectedChannels]);

  // Re-send ONLY the channels that failed on the last attempt. The per-channel
  // dedup window on the server means this won't be blocked by — nor re-broadcast
  // to — the channels that already delivered. Discards unknown/legacy channel ids.
  const retryFailedChannels = useCallback(() => {
    if (sendingIncident) return;
    const failed = (incidentResult?.failed ?? []).filter(
      (c): c is IncidentChannelId => c === 'discord' || c === 'email',
    );
    if (failed.length === 0) return;
    // Resend the EXACT report from the original send (if captured) so the server
    // fingerprint matches and an already-delivered channel stays deduped; fall
    // back to a fresh report only if nothing was captured.
    void sendIncidentReport(failed, lastSentReportRef.current ?? undefined);
  }, [incidentResult, sendingIncident, sendIncidentReport]);

  // Toggle one channel in the picker (only configured channels are interactive).
  const toggleChannel = useCallback((channel: 'discord' | 'email') => {
    setSelectedChannels(prev => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }, []);

  // Save the SAME all-backends transition dump as "Copy all" to a timestamped
  // .txt file, for archiving longer incident records or sharing as an
  // attachment. Reuses buildAllHistoryCopyText so copied and downloaded content
  // never diverge.
  const downloadAllHistory = useCallback(() => {
    const out = buildAllHistoryCopyText(providers, Date.now());
    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    // Filename-safe local timestamp, e.g. "backend-downtime-2026-06-16T14-04-31.txt".
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.href = url;
    a.download = `backend-downtime-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloadedAll(true);
    if (downloadAllTimer.current) clearTimeout(downloadAllTimer.current);
    downloadAllTimer.current = setTimeout(() => setDownloadedAll(false), 1500);
  }, [providers]);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const res = await apiFetch('/api/art/library', { credentials: 'include' });
      if (res.status === 403 || res.status === 401) { setAccessDenied(true); return; }
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as LibraryResponse;
      const sorted = (data.assets ?? []).slice().sort((a, b) => a.key.localeCompare(b.key));
      setAssets(sorted);
      applyProviders(data.providers ?? []);
      setTestBackend(prev => {
        if (prev) return prev;
        const def = (data.providers ?? []).find(p => p.isDefault) ?? (data.providers ?? [])[0];
        return def?.id ?? '';
      });
      setPolishConfigured(Boolean(data.polishConfigured));
      const channels = data.incidentChannels ?? null;
      setIncidentChannels(channels);
      // Default the picker to every configured channel the first time we learn
      // the config; once the admin has touched it we leave their choice alone.
      if (channels) {
        setSelectedChannels(prev => {
          if (prev.size > 0) return prev;
          const next = new Set<'discord' | 'email'>();
          if (channels.discord) next.add('discord');
          if (channels.email) next.add('email');
          return next;
        });
      }
      setStats({
        total: data.total ?? 0,
        ready: data.ready ?? 0,
        pending: data.pending ?? 0,
        failed: data.failed ?? 0,
        needsReview: data.needsReview ?? 0,
      });
      setTestRenderCount(data.testRenderCount ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lightweight status poll — re-fetches ONLY /art/providers (backend health +
  // polish config) on a fixed cadence so an admin can watch a node go up/down in
  // near real time without reloading the whole asset grid. Pauses while the tab
  // is hidden to avoid needless requests.
  const refreshProviders = useCallback(async (fresh = false) => {
    try {
      // ?fresh=1 forces the server to bypass its ~20s health cache and re-probe
      // every backend live — used by the explicit "Refresh status" button. The
      // background poll omits it so it keeps serving from cache.
      const res = await apiFetch(`/api/art/providers${fresh ? '?fresh=1' : ''}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { providers?: ProviderSummary[]; polishConfigured?: boolean };
      if (data.providers) applyProviders(data.providers);
      if (typeof data.polishConfigured === 'boolean') setPolishConfigured(data.polishConfigured);
    } catch {
      // Transient failure — keep the last known status, try again next tick.
    }
  }, [applyProviders]);

  // Tick once a second so the relative "changed/checked Ns ago" labels stay live
  // between the 25s polls. Paused while the tab is hidden.
  useEffect(() => {
    if (accessDenied) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => setNow(Date.now()), 1000); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => { document.hidden ? stop() : (setNow(Date.now()), start()); };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [accessDenied]);

  // Explicit on-demand live re-check (bypasses the server health cache) for when
  // an admin just brought a backend online and wants to confirm it immediately.
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const refreshStatus = useCallback(async () => {
    setRefreshingStatus(true);
    try {
      await refreshProviders(true);
    } finally {
      setRefreshingStatus(false);
    }
  }, [refreshProviders]);

  useEffect(() => {
    if (accessDenied) return;
    const INTERVAL_MS = 25_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(refreshProviders, INTERVAL_MS);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        refreshProviders();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [accessDenied, refreshProviders]);

  // While any backend is mid-probe ("checking"), poll quickly so the transient
  // state flips to online/offline as soon as the probe resolves — independent of
  // the slow 25s background cadence. Re-runs on every providers change, so it
  // keeps re-scheduling until nothing is checking (or stops if the tab hides).
  useEffect(() => {
    if (accessDenied || document.hidden) return;
    if (!providers.some(p => p.health === 'checking')) return;
    const t = setTimeout(refreshProviders, 1500);
    return () => clearTimeout(t);
  }, [providers, accessDenied, refreshProviders]);

  const categories = useMemo(() => {
    const set = new Set<string>(assets.map(a => a.category));
    return ['all', ...Array.from(set).sort()];
  }, [assets]);

  const visible = useMemo(
    () => (filterCategory === 'all' ? assets : assets.filter(a => a.category === filterCategory)),
    [assets, filterCategory],
  );

  const regenerate = async (key: string) => {
    setBusyKey(key);
    try {
      const backend = pickBackend[key];
      const jobType = pickJobType[key];
      const body: Record<string, string> = {};
      if (backend) body.backend = backend;
      // Job type only matters for the Unreal render node; harmless to send otherwise.
      if (jobType && backend === 'unreal') body.jobType = jobType;
      const res = await apiFetch(`/api/art/asset/${encodeURIComponent(key)}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('regenerate failed');
      const { asset } = await res.json();
      setAssets(prev => prev.map(a => (a.key === key ? { ...a, ...asset } : a)));
    } catch (e) {
      console.error(e);
    } finally {
      setBusyKey(null);
    }
  };

  const approve = async (key: string) => {
    setBusyKey(key);
    try {
      const res = await apiFetch(`/api/art/asset/${encodeURIComponent(key)}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'approval failed');
      if (body.asset) setAssets(prev => prev.map(a => (a.key === key ? { ...a, ...body.asset } : a)));
    } catch (e) {
      console.error(e);
    } finally {
      setBusyKey(null);
    }
  };

  const polish = async (key: string, op: 'upscale' | 'remove_bg' | 'enhance') => {
    setBusyKey(key);
    try {
      const res = await apiFetch(`/api/art/asset/${encodeURIComponent(key)}/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ op }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'polish failed');
      }
      // Video "enhance" returns immediately in a "processing" state; the polling
      // effect below picks it up and swaps in the enhanced clip when ready.
      // Image ops return the finished URL synchronously.
      const { asset } = await res.json();
      setAssets(prev => prev.map(a => (a.key === key ? { ...a, ...asset } : a)));
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

  // Re-query the authoritative stored test-render count from the server so the
  // "N stored" badge reflects the true total across ALL backends — the
  // optimistic bump in runTestRender only knows about the current backend's jobs.
  const refreshTestRenderCount = useCallback(async () => {
    try {
      const res = await apiFetch('/api/art/library', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as LibraryResponse;
      setTestRenderCount(data.testRenderCount ?? 0);
    } catch {
      // Transient failure — keep the optimistic count, it refreshes on reload.
    }
  }, []);

  // Poll the in-flight test-render keys until each settles (ready/failed). Reuses
  // GET /api/art/asset/:key, the same path the game polls, so the test exercises
  // the real ingest pipeline end-to-end.
  const pollTestJobs = useCallback(async (keys: string[]) => {
    const results = await Promise.all(
      keys.map(async key => {
        try {
          const res = await apiFetch(`/api/art/asset/${encodeURIComponent(key)}`, { credentials: 'include' });
          if (!res.ok) return null;
          const { asset } = await res.json();
          return asset as ArtAsset;
        } catch {
          return null;
        }
      }),
    );
    // Determine completion from the freshly fetched results directly. A job is
    // still in flight if its fetch failed (null) or the asset is still pending.
    // Computing this here — rather than from a flag mutated inside the
    // setTestJobs updater — guarantees we never settle a run while jobs remain.
    const stillPending = keys.some(key => {
      const fresh = results.find(a => a && a.key === key);
      return !fresh || fresh.status === 'pending';
    });
    setTestJobs(prev =>
      prev.map(job => {
        const fresh = results.find(a => a && a.key === job.key);
        return { ...job, asset: fresh ?? job.asset };
      }),
    );
    if (stillPending) {
      testPollRef.current = setTimeout(() => pollTestJobs(keys), 3000);
    } else {
      setTestRunning(false);
      // All jobs settled — re-query the authoritative total so the badge is exact.
      void refreshTestRenderCount();
    }
  }, [refreshTestRenderCount]);

  const bakePortraits = async (force: boolean) => {
    setBakingPortraits(true);
    setBakePortraitsResult(null);
    setBakePortraitsError(null);
    try {
      const res = await apiFetch('/api/art/bake-portraits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'bake portraits failed');
      }
      const data = await res.json();
      setBakePortraitsResult(data);
      // Refresh the library so newly-kicked rows show up.
      const libRes = await apiFetch('/api/art/library', { credentials: 'include' });
      if (libRes.ok) {
        const libData = await libRes.json();
        if (Array.isArray(libData?.assets)) setAssets(libData.assets);
        setStats({
          total: libData.total ?? 0,
          ready: libData.ready ?? 0,
          pending: libData.pending ?? 0,
          failed: libData.failed ?? 0,
          needsReview: libData.needsReview ?? 0,
        });
      }
    } catch (e) {
      setBakePortraitsError((e as Error).message);
    } finally {
      setBakingPortraits(false);
    }
  };

  const runTestRender = async () => {
    if (testPollRef.current) { clearTimeout(testPollRef.current); testPollRef.current = null; }
    setTestRunning(true);
    setTestError(null);
    setTestNotConfigured(false);
    setTestClearedMsg(null);
    setTestJobs([]);
    try {
      const body: Record<string, string> = {};
      if (testBackend) body.backend = testBackend;
      const res = await apiFetch('/api/art/test-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'test render failed');
      }
      const data = (await res.json()) as TestRenderResponse;
      if (!data.configured) {
        setTestNotConfigured(true);
        setTestRunning(false);
        return;
      }
      const jobs = data.jobs ?? [];
      setTestJobs(jobs);
      // Rows persist (reused by stable per-backend key), so reflect that at least
      // this backend's rows are now stored; the precise total refreshes on reload.
      setTestRenderCount(prev => Math.max(prev, jobs.length));
      const pendingKeys = jobs.filter(j => j.asset.status === 'pending').map(j => j.key);
      if (pendingKeys.length > 0) {
        testPollRef.current = setTimeout(() => pollTestJobs(pendingKeys), 3000);
      } else {
        setTestRunning(false);
        // Nothing to poll — all jobs already settled, so refresh the true total now.
        void refreshTestRenderCount();
      }
    } catch (e) {
      console.error(e);
      setTestError((e as Error).message);
      setTestRunning(false);
    }
  };

  const [testClearing, setTestClearing] = useState(false);

  const clearTestRender = async () => {
    if (testPollRef.current) { clearTimeout(testPollRef.current); testPollRef.current = null; }
    setTestClearing(true);
    setTestError(null);
    setTestClearedMsg(null);
    try {
      const res = await apiFetch('/api/art/test-render', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || 'failed to clear test results');
      }
      const { deleted = 0 } = (await res.json().catch(() => ({}))) as { deleted?: number };
      setTestJobs([]);
      setTestNotConfigured(false);
      setTestRunning(false);
      setTestRenderCount(0);
      setTestClearedMsg(`Cleared ${deleted} test result${deleted === 1 ? '' : 's'}`);
    } catch (e) {
      console.error(e);
      setTestError((e as Error).message);
    } finally {
      setTestClearing(false);
    }
  };

  // Tidy up the poll timer on unmount.
  useEffect(() => () => { if (testPollRef.current) clearTimeout(testPollRef.current); }, []);

  // While any asset has an in-flight video enhancement, poll those rows so the
  // UI can show progress and swap in the enhanced clip the moment it's ready.
  const processingKeys = useMemo(
    () => assets.filter(a => a.polish?.state === 'processing').map(a => a.key),
    [assets],
  );
  const processingKey = processingKeys.join('|');
  useEffect(() => {
    if (!processingKey) return;
    let cancelled = false;
    const keys = processingKey.split('|');
    const tick = async () => {
      await Promise.all(
        keys.map(async key => {
          try {
            const res = await apiFetch(`/api/art/asset/${encodeURIComponent(key)}`, {
              credentials: 'include',
            });
            if (!res.ok) return;
            const { asset } = await res.json();
            if (!cancelled && asset) {
              setAssets(prev => prev.map(a => (a.key === key ? { ...a, ...asset } : a)));
            }
          } catch {
            /* transient — try again next tick */
          }
        }),
      );
    };
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [processingKey]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-fuchsia-400" />
            <div>
              <h1 className="font-mono text-lg text-zinc-100 tracking-widest uppercase">Art Factory</h1>
              <p className="font-mono text-[10px] text-zinc-600 tracking-wide">
                {stats.total} assets · {stats.ready} ready · {stats.needsReview ?? 0} review · {stats.pending} pending · {stats.failed} failed
              </p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[11px] tracking-widest uppercase text-zinc-500 border border-white/[0.08] hover:text-zinc-300 hover:bg-white/4 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>

        {/* Full-fleet health summary — same breakdown (online / offline /
            not configured / unknown) and wording as the copied incident report,
            so admins get the complete picture at a glance without copying. */}
        {!accessDenied && providers.length > 0 && (() => {
          const summary = summarizeFleetHealth(providers);
          const chips: { key: string; label: string; count: number; cls: string }[] = [
            { key: 'online', label: 'online', count: summary.online, cls: 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10' },
            { key: 'offline', label: 'offline', count: summary.offline, cls: 'border-red-500/25 text-red-400 bg-red-500/10' },
            { key: 'not-configured', label: 'not configured', count: summary.notConfigured, cls: 'border-zinc-600/25 text-zinc-500 bg-zinc-600/10' },
            { key: 'unknown', label: 'unknown', count: summary.unknown, cls: 'border-amber-500/25 text-amber-400 bg-amber-500/10' },
          ];
          const troubledCount = summary.offline + summary.notConfigured + summary.unknown;
          return (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[9px] tracking-widest uppercase text-zinc-600 mr-0.5">Backends</span>
              {chips.map(c => (
                <span
                  key={c.key}
                  className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border tabular-nums ${c.cls}`}
                >
                  {c.count} {c.label}
                </span>
              ))}
              {(troubledCount > 0 || showOnlyTroubled) && (
                <button
                  type="button"
                  onClick={() => setShowOnlyTroubled(v => !v)}
                  aria-pressed={showOnlyTroubled}
                  title={showOnlyTroubled ? 'Show all backends' : 'Hide online backends and show only offline / not-configured / unknown'}
                  className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border transition-colors ${
                    showOnlyTroubled
                      ? 'border-amber-500/40 text-amber-300 bg-amber-500/15'
                      : 'border-white/[0.12] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {showOnlyTroubled ? 'show all' : 'only troubled'}
                </button>
              )}
            </div>
          );
        })()}

        {!accessDenied && <GodotArtPreview />}
        {!accessDenied && <ArtFamilyMatrix />}
        {!accessDenied && <GameAssetGallery />}
        {!accessDenied && <GeneratedArtReviewBoard />}

        {/* Backends */}
        {!accessDenied && (
          <div className="mb-5 flex flex-wrap gap-2">
            {providers.filter(p => !showOnlyTroubled || deriveHealth(p) !== 'online').map(p => {
              const health = deriveHealth(p);
              const badge = HEALTH_BADGE[health];
              const isFlashing = flashing[p.id];
              // Server-tracked: when the current health began (survives reloads &
              // is shared across admins). Fall back to "checked Ns ago" only for
              // older servers that don't return lastChangedAt.
              const sinceLabel = typeof p.lastChangedAt === 'number'
                ? `${health === 'online' ? 'up' : health === 'offline' ? 'down' : 'set'} ${relativeDuration(now - p.lastChangedAt)} ago`
                : lastCheckedAt
                  ? `checked ${relativeDuration(now - lastCheckedAt)} ago`
                  : '';
              // Recent transitions (newest first), excluding the current run which
              // is already shown by the "since" label.
              const history = (p.healthHistory ?? []).slice(1);
              const hasHistory = history.length > 0;
              const isOpen = openHistory === p.id;
              const flashRing = isFlashing
                ? health === 'online'
                  ? 'ring-2 ring-emerald-400/70 bg-emerald-500/[0.06]'
                  : health === 'offline'
                    ? 'ring-2 ring-red-400/70 bg-red-500/[0.06]'
                    : 'ring-2 ring-fuchsia-400/70'
                : '';
              const baseBorder = p.configured
                ? 'border-white/[0.10] bg-white/[0.03]'
                : 'border-white/[0.06] bg-white/[0.01] opacity-60';
              const title = [
                p.description,
                sinceLabel
                  ? typeof p.lastChangedAt === 'number'
                    ? `Status ${sinceLabel} (since ${absoluteTime(p.lastChangedAt)})`
                    : `Status ${sinceLabel}`
                  : '',
                p.lastError ? `Last error: ${p.lastError}` : '',
              ].filter(Boolean).join('\n\n');
              return (
                <div key={p.id} className="flex flex-col gap-1">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all duration-700 ${baseBorder} ${flashRing}`}
                    title={title}
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${p.configured ? 'text-fuchsia-400' : 'text-zinc-600'}`} />
                    <span className="font-mono text-[11px] text-zinc-300">{p.label}</span>
                    <span className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {sinceLabel && (
                      <span className="font-mono text-[9px] tabular-nums text-zinc-600 lowercase">{sinceLabel}</span>
                    )}
                    {hasHistory && (
                      <button
                        type="button"
                        onClick={() => setOpenHistory(cur => (cur === p.id ? null : p.id))}
                        className="font-mono text-[9px] tracking-widest uppercase text-zinc-600 hover:text-zinc-300 transition-colors"
                        title="Recent status changes"
                      >
                        {isOpen ? 'hide' : `log·${history.length}`}
                      </button>
                    )}
                    {p.isDefault && (
                      <span className="font-mono text-[9px] tracking-widest uppercase text-zinc-500">default</span>
                    )}
                  </div>
                  {isOpen && hasHistory && (
                    <div className="ml-2 pl-3 border-l border-white/[0.08] flex flex-col gap-0.5 py-1">
                      <ol className="flex flex-col gap-0.5">
                        {history.map((ev, i) => (
                          <li key={`${ev.at}-${i}`} className="flex items-center gap-1.5 font-mono text-[9px] tabular-nums" title={absoluteTime(ev.at)}>
                            <span className={HEALTH_BADGE[ev.health]?.cls.split(' ').find(c => c.startsWith('text-')) ?? 'text-zinc-500'}>
                              {HEALTH_BADGE[ev.health]?.label ?? ev.health}
                            </span>
                            <span className="text-zinc-600 lowercase">{relativeDuration(now - ev.at)} ago</span>
                            <span className="text-zinc-700 lowercase">· {absoluteTime(ev.at)}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-1 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => copyHistory(p, history)}
                          title="Copy this backend's recent transitions (with absolute times) for an incident report"
                          className="self-start flex items-center gap-1 font-mono text-[9px] tracking-widest uppercase text-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                          {copiedHistory === p.id ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              <span className="text-emerald-400">copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              copy
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadHistory(p, history)}
                          title="Download this backend's recent transitions (with absolute times) as a timestamped .txt file"
                          className="self-start flex items-center gap-1 font-mono text-[9px] tracking-widest uppercase text-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                          {downloadedHistory === p.id ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              <span className="text-emerald-400">saved</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-2.5 h-2.5" />
                              download
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => sendHistory(p, history)}
                          disabled={sendingHistory === p.id || selectedChannels.size === 0}
                          title={selectedChannels.size === 0
                            ? 'Pick at least one destination channel below to send'
                            : `Send this backend's recent transitions to the selected incident channel(s): ${Array.from(selectedChannels).join(' + ')}`}
                          className="self-start flex items-center gap-1 font-mono text-[9px] tracking-widest uppercase text-zinc-600 hover:text-zinc-300 disabled:opacity-40 transition-colors"
                        >
                          {sendingHistory === p.id ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              sending
                            </>
                          ) : sentHistoryNote?.id === p.id ? (
                            <>
                              {sentHistoryNote.ok ? (
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                              ) : (
                                <XCircle className="w-2.5 h-2.5 text-red-400" />
                              )}
                              <span className={sentHistoryNote.ok ? 'text-emerald-400' : 'text-red-400'}>
                                {sentHistoryNote.text}
                              </span>
                            </>
                          ) : (
                            <>
                              <Send className="w-2.5 h-2.5" />
                              send
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-white/[0.06] bg-white/[0.01]">
              <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-[11px] text-zinc-300">Polish pass</span>
              <span
                className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border ${
                  polishConfigured
                    ? 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10'
                    : 'border-zinc-600/25 text-zinc-500 bg-zinc-600/10'
                }`}
              >
                {polishConfigured ? 'ready' : 'no key'}
              </span>
            </div>
            {/* Force an immediate live re-check, bypassing the ~20s health cache. */}
            <button
              onClick={refreshStatus}
              disabled={refreshingStatus}
              title="Force an immediate live re-check of every backend (bypasses the status cache)"
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-white/[0.10] bg-white/[0.03] font-mono text-[11px] text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingStatus ? 'animate-spin' : ''}`} />
              {refreshingStatus ? 'Checking…' : 'Refresh status'}
            </button>
            {/* Dump every backend's recent transitions at once for a broad incident. */}
            {providers.length > 0 && (
              <button
                onClick={copyAllHistory}
                title="Copy every backend's recent transitions (with absolute times) in one block for an incident report"
                className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-white/[0.10] bg-white/[0.03] font-mono text-[11px] text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy all
                  </>
                )}
              </button>
            )}
            {/* Push the SAME report straight to the shared on-call incident
                channel — with a destination picker so an admin can pick which
                configured channels (Discord / email) to broadcast to. */}
            {providers.length > 0 && (
              incidentChannels && !incidentChannels.any ? (
                // Graceful empty state: nothing is wired up to receive a report.
                <span
                  title="Set INCIDENT_DISCORD_WEBHOOK_URL (or DISCORD_WEBHOOK_URL) and/or ART_BACKEND_ALERT_EMAIL to enable sending"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-white/[0.06] bg-white/[0.02] font-mono text-[11px] text-zinc-500"
                >
                  <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                  No incident channel configured
                </span>
              ) : (
                <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  {/* Destination toggles — one per channel, disabled when the
                      channel isn't configured on the server. */}
                  {(['discord', 'email'] as const).map(ch => {
                    const configured = Boolean(incidentChannels?.[ch]);
                    const selected = selectedChannels.has(ch);
                    const label = ch === 'discord' ? 'Discord' : 'Email';
                    return (
                      <button
                        key={ch}
                        onClick={() => configured && toggleChannel(ch)}
                        disabled={!configured}
                        title={configured
                          ? `${selected ? 'Sending to' : 'Skipping'} ${label} — click to ${selected ? 'exclude' : 'include'}`
                          : `${label} not configured on the server`}
                        className={`flex items-center gap-1 px-2.5 py-2 rounded-md border font-mono text-[11px] transition-colors ${
                          !configured
                            ? 'border-white/[0.06] bg-white/[0.01] text-zinc-600 cursor-not-allowed line-through'
                            : selected
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'border-white/[0.10] bg-white/[0.03] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
                        }`}
                      >
                        {configured && selected && <Check className="w-3 h-3" />}
                        {label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => sendIncidentReport()}
                    disabled={sendingIncident || selectedChannels.size === 0}
                    title="Send this downtime report to the selected incident channels so the on-call team sees it without a manual paste"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-white/[0.10] bg-white/[0.03] font-mono text-[11px] text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-white/[0.03] transition-colors"
                  >
                    {sendingIncident ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send report
                      </>
                    )}
                  </button>
                </div>
                {/* Persistent per-channel breakdown of the last send: delivered /
                    failed / skipped. A partial failure (amber) is visually
                    distinct from a full success (emerald) and a full failure
                    (red), and stays pinned until the next send unless it's a
                    clean success. */}
                {incidentResult && (() => {
                  const o = incidentResult.outcome;
                  const tone =
                    o === 'success'
                      ? { wrap: 'border-emerald-500/30 bg-emerald-500/[0.06]', text: 'text-emerald-300', label: 'Report delivered' }
                      : o === 'partial'
                        ? { wrap: 'border-amber-500/30 bg-amber-500/[0.06]', text: 'text-amber-300', label: 'Partially delivered' }
                        : { wrap: 'border-red-500/30 bg-red-500/[0.06]', text: 'text-red-300', label: o === 'failed' ? 'Delivery failed' : (incidentResult.message ?? 'Send failed') };
                  const hasBreakdown =
                    incidentResult.delivered.length > 0 ||
                    incidentResult.failed.length > 0 ||
                    incidentResult.skipped.length > 0;
                  return (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`flex flex-col gap-1.5 px-3 py-2 rounded-md border font-mono text-[11px] ${tone.wrap}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {o === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : o === 'partial' ? (
                          <XCircle className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className={`tracking-wide ${tone.text}`}>{tone.label}</span>
                      </div>
                      {hasBreakdown && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {incidentResult.delivered.map(c => (
                            <span
                              key={`d-${c}`}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/25 text-emerald-300 bg-emerald-500/10"
                            >
                              <Check className="w-3 h-3" />
                              {channelLabel(c)} delivered
                            </span>
                          ))}
                          {incidentResult.failed.map(c => (
                            <span
                              key={`f-${c}`}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/25 text-red-300 bg-red-500/10"
                            >
                              <XCircle className="w-3 h-3" />
                              {channelLabel(c)} failed
                            </span>
                          ))}
                          {incidentResult.skipped.map(c => (
                            <span
                              key={`s-${c}`}
                              title="This channel isn't configured on the server, so it was skipped"
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-600/30 text-zinc-400 bg-zinc-600/10"
                            >
                              {channelLabel(c)} skipped — not configured
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Re-send ONLY the failed channels. The server's per-channel
                          dedup means this won't be blocked by, nor re-broadcast to,
                          the channels that already delivered. */}
                      {incidentResult.failed.length > 0 && (
                        <button
                          onClick={retryFailedChannels}
                          disabled={sendingIncident}
                          title={`Re-send only to the channel(s) that failed: ${incidentResult.failed.map(channelLabel).join(', ')}`}
                          className="self-start flex items-center gap-1.5 mt-0.5 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 disabled:hover:bg-amber-500/10 transition-colors"
                        >
                          {sendingIncident ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Retry failed ({incidentResult.failed.length})
                        </button>
                      )}
                    </div>
                  );
                })()}
                </div>
              )
            )}
            {/* Save the SAME all-backends dump to a timestamped .txt file for archiving. */}
            {providers.length > 0 && (
              <button
                onClick={downloadAllHistory}
                title="Download every backend's recent transitions (with absolute times) as a timestamped .txt file"
                className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-white/[0.10] bg-white/[0.03] font-mono text-[11px] text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
              >
                {downloadedAll ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Downloaded</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Bake portraits — pre-render all 9 intake character-template portraits. */}
        {!accessDenied && (
          <div className="mb-5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span className="font-mono text-[12px] text-zinc-200 tracking-wide uppercase">Bake portraits</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-600">
                Pre-renders all 9 intake character-template portraits so new players see them instantly
              </span>
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={() => bakePortraits(false)}
                  disabled={bakingPortraits}
                  title="Kick off any un-started portrait rows (safe, skips already-baking rows)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[11px] tracking-widest uppercase text-sky-300 border border-sky-500/30 hover:bg-sky-500/10 disabled:opacity-40 transition-colors"
                >
                  {bakingPortraits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {bakingPortraits ? 'Baking…' : 'Bake missing'}
                </button>
                <button
                  onClick={() => bakePortraits(true)}
                  disabled={bakingPortraits}
                  title="Force-reset all un-baked portrait rows and re-kick. Use after topping up apipass credit or setting UNREAL_RENDER_URL."
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[11px] tracking-widest uppercase text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/10 disabled:opacity-40 transition-colors"
                >
                  {bakingPortraits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Force re-bake
                </button>
              </div>
            </div>
            {bakePortraitsError && (
              <p className="mt-3 font-mono text-[10px] text-red-400/90">{bakePortraitsError}</p>
            )}
            {bakePortraitsResult && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  {bakePortraitsResult.ready} already ready · {bakePortraitsResult.kicked} kicked off
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {bakePortraitsResult.results.map(r => (
                    <span
                      key={r.key}
                      className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border ${
                        r.status === 'ready'
                          ? 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10'
                          : r.status === 'pending'
                          ? 'border-amber-500/25 text-amber-400 bg-amber-500/10'
                          : 'border-red-500/25 text-red-400 bg-red-500/10'
                      }`}
                    >
                      {r.key.replace('char_template_', '')} · {r.status}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Test render — one-click smoke test against a chosen backend. */}
        {!accessDenied && (
          <div className="mb-5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-fuchsia-400" />
                <span className="font-mono text-[12px] text-zinc-200 tracking-wide uppercase">Test render</span>
                {testRenderCount > 0 && (
                  <span
                    title="Stored throwaway test-render rows"
                    className="font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border border-fuchsia-500/25 text-fuchsia-300 bg-fuchsia-500/10"
                  >
                    {testRenderCount} stored
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] text-zinc-600">
                Fires one object · one landscape · one cinematic through the selected backend
              </span>
              <div className="flex items-center gap-1.5 ml-auto">
                <select
                  value={testBackend}
                  onChange={e => setTestBackend(e.target.value)}
                  disabled={testRunning}
                  className="bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 font-mono text-[11px] text-zinc-300 outline-none disabled:opacity-50"
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label}{p.configured ? '' : ' (no key)'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={runTestRender}
                  disabled={testRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[11px] tracking-widest uppercase text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/10 disabled:opacity-40 transition-colors"
                >
                  {testRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                  {testRunning ? 'Rendering…' : 'Run test'}
                </button>
                <button
                  onClick={clearTestRender}
                  disabled={testRunning || testClearing}
                  title="Delete all stored test-render results"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[11px] tracking-widest uppercase text-zinc-400 border border-white/[0.08] hover:text-red-300 hover:border-red-500/30 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                >
                  {testClearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Clear
                </button>
              </div>
            </div>

            {testError && (
              <p className="mt-3 font-mono text-[10px] text-red-400/90">{testError}</p>
            )}

            {testClearedMsg && (
              <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                {testClearedMsg}
              </div>
            )}

            {testNotConfigured && (
              <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-amber-400">
                <XCircle className="w-4 h-4" />
                This backend isn’t configured — set its key/URL secret before testing.
              </div>
            )}

            {testJobs.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {testJobs.map(job => {
                  const a = job.asset;
                  return (
                    <div key={job.key} className="rounded-md border border-white/[0.08] bg-[#06070b] overflow-hidden">
                      <div className="aspect-video bg-black/40 flex items-center justify-center overflow-hidden">
                        {a.url ? (
                          a.mediaType === 'video' ? (
                            <video src={a.url} className="w-full h-full object-contain" controls loop muted playsInline preload="metadata" />
                          ) : (
                            <img src={a.url} alt={job.jobType} className="w-full h-full object-contain" loading="lazy" />
                          )
                        ) : (
                          <span className="font-mono text-[10px] text-zinc-700">
                            {a.status === 'failed' ? 'failed' : 'rendering…'}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-zinc-300 tracking-widest uppercase">{job.jobType}</span>
                          {a.status === 'ready' ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] tracking-widest uppercase text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> ok
                            </span>
                          ) : a.status === 'failed' ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] tracking-widest uppercase text-red-400">
                              <XCircle className="w-3 h-3" /> failed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-[9px] tracking-widest uppercase text-amber-400">
                              <Loader2 className="w-3 h-3 animate-spin" /> pending
                            </span>
                          )}
                        </div>
                        {a.failMsg && (
                          <p className="font-mono text-[9px] text-red-400/80 line-clamp-3" title={a.failMsg}>{a.failMsg}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Category filter */}
        {!accessDenied && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded-md border transition-colors ${
                  filterCategory === c
                    ? 'border-fuchsia-500/40 text-fuchsia-300 bg-fuchsia-500/10'
                    : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {accessDenied ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ImageOff className="w-8 h-8 text-zinc-700" />
            <p className="font-mono text-sm text-zinc-500">Owner access required.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map(a => {
              const chosen = pickBackend[a.key] ?? a.backend;
              const isBusy = busyKey === a.key;
              return (
                <div key={a.key} className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <div className="relative aspect-video bg-[#06070b] flex items-center justify-center overflow-hidden">
                    {a.url ? (
                      a.mediaType === 'video' ? (
                        <video
                          src={a.url}
                          className="w-full h-full object-contain"
                          controls
                          loop
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img src={a.url} alt={a.key} className="w-full h-full object-contain" loading="lazy" />
                      )
                    ) : (
                      <span className="font-mono text-[10px] text-zinc-700">
                        {a.status === 'failed' ? 'failed' : 'baking…'}
                      </span>
                    )}
                    {/* In-flight video enhancement: keep showing the current clip
                        but overlay a clear, indeterminate progress indicator. */}
                    {a.polish?.state === 'processing' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 backdrop-blur-[1px]">
                        <Loader2 className="w-5 h-5 text-cyan-300 animate-spin" />
                        <span className="font-mono text-[10px] tracking-widest uppercase text-cyan-200">
                          Enhancing…
                        </span>
                        <span className="font-mono text-[8px] text-zinc-400">
                          this can take a few minutes
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-zinc-300 truncate" title={a.key}>{a.key}</span>
                      <span className={`font-mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 rounded border ${STATUS_STYLES[a.status] || 'border-zinc-600/25 text-zinc-500'}`}>
                        {a.status}
                      </span>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono text-[8px] text-zinc-600 tracking-widest uppercase">{a.category}</span>
                      <span className={`font-mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 rounded border ${BACKEND_STYLES[a.backend] || 'border-zinc-600/25 text-zinc-500'}`}>
                        {a.backend}
                      </span>
                      {a.jobType && (
                        <span className="font-mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 rounded border border-sky-500/20 text-sky-300/80">
                          {a.jobType}
                        </span>
                      )}
                      {a.mediaType === 'video' && (
                        <span className="font-mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 rounded border border-fuchsia-500/20 text-fuchsia-300/80">
                          video
                        </span>
                      )}
                    </div>
                    {a.failMsg && (
                      <p className="font-mono text-[9px] text-red-400/80 line-clamp-2" title={a.failMsg}>{a.failMsg}</p>
                    )}
                    {a.qa && (
                      <div className="rounded border border-white/[0.06] bg-black/20 px-2 py-1.5 space-y-0.5">
                        <p className="font-mono text-[9px] text-zinc-400">
                          QA: {a.qa.width && a.qa.height ? `${a.qa.width}×${a.qa.height}` : 'unknown'} · {a.qa.mimeType ?? 'unknown'} · {a.qa.hasAlpha === null ? 'alpha unknown' : a.qa.hasAlpha ? 'alpha' : 'opaque'}
                        </p>
                        {[...a.qa.failures, ...a.qa.reviewReasons].slice(0, 2).map(reason => (
                          <p key={reason} className={`font-mono text-[9px] line-clamp-2 ${a.qa?.failures.includes(reason) ? 'text-red-400/80' : 'text-orange-300/80'}`}>
                            {reason}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <select
                        value={chosen}
                        onChange={e => setPickBackend(prev => ({ ...prev, [a.key]: e.target.value }))}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 font-mono text-[10px] text-zinc-300 outline-none"
                      >
                        {providers.map(p => (
                          <option key={p.id} value={p.id} disabled={!p.configured}>
                            {p.label}{p.configured ? '' : ' (no key)'}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => regenerate(a.key)}
                        disabled={isBusy}
                        className="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-widest uppercase text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/10 disabled:opacity-40 transition-colors"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Bake
                      </button>
                    </div>
                    {/* Render job type — used by remote 3D render nodes. */}
                    {(chosen === 'unreal' || chosen === 'blender') && (
                      <select
                        value={pickJobType[a.key] ?? a.jobType ?? 'object'}
                        onChange={e => setPickJobType(prev => ({ ...prev, [a.key]: e.target.value }))}
                        className="w-full bg-white/[0.04] border border-sky-500/20 rounded px-2 py-1 font-mono text-[10px] text-sky-200 outline-none"
                        title="Unreal render job type"
                      >
                        {JOB_TYPES.map(jt => (
                          <option key={jt} value={jt}>
                            {jt === 'cinematic' ? 'cinematic (video)' : jt}
                          </option>
                        ))}
                      </select>
                    )}
                    {a.polish?.state === 'failed' && a.polish.error && (
                      <p className="font-mono text-[9px] text-red-400/80 line-clamp-2" title={a.polish.error}>
                        {a.polish.error}
                      </p>
                    )}
                    {a.status === 'needs_review' && (
                      <button
                        onClick={() => approve(a.key)}
                        disabled={isBusy}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-widest uppercase text-orange-200 border border-orange-500/30 hover:bg-orange-500/10 disabled:opacity-40 transition-colors"
                        title="Approve this technically valid result for game use after visual review"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Approve for game
                      </button>
                    )}
                    <div className="flex items-center gap-1.5">
                      {a.mediaType === 'video' ? (
                        <button
                          onClick={() => polish(a.key, 'enhance')}
                          disabled={isBusy || !polishConfigured || a.status !== 'ready' || a.polish?.state === 'processing'}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-widest uppercase text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 disabled:opacity-30 transition-colors"
                          title={polishConfigured ? 'Video super-resolution' : 'Set FAL_KEY to enable'}
                        >
                          {isBusy || a.polish?.state === 'processing' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" /> Enhancing…
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-3 h-3" /> {a.polish?.state === 'failed' ? 'Retry' : 'Enhance'}
                            </>
                          )}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => polish(a.key, 'upscale')}
                            disabled={isBusy || !polishConfigured || a.status !== 'ready'}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-widest uppercase text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 disabled:opacity-30 transition-colors"
                            title={polishConfigured ? 'Upscale' : 'Set FAL_KEY to enable'}
                          >
                            <Wand2 className="w-3 h-3" /> Upscale
                          </button>
                          <button
                            onClick={() => polish(a.key, 'remove_bg')}
                            disabled={isBusy || !polishConfigured || a.status !== 'ready'}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-widest uppercase text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 disabled:opacity-30 transition-colors"
                            title={polishConfigured ? 'Remove background' : 'Set FAL_KEY to enable'}
                          >
                            <Scissors className="w-3 h-3" /> Cut BG
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
