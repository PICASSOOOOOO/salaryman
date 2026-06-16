import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Loader2, RefreshCw, Sparkles, Palette, Wand2, Scissors, ImageOff, FlaskConical, CheckCircle2, XCircle } from 'lucide-react';

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
}

type JobType = 'object' | 'landscape' | 'cinematic';
const JOB_TYPES: JobType[] = ['object', 'landscape', 'cinematic'];

type ProviderHealth = 'online' | 'offline' | 'not-configured' | 'unknown';

interface ProviderSummary {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  isDefault: boolean;
  health?: ProviderHealth;
  lastError?: string | null;
}

// Reachability badge styling + label per health state.
const HEALTH_BADGE: Record<ProviderHealth, { label: string; cls: string }> = {
  online: { label: 'online', cls: 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10' },
  offline: { label: 'offline', cls: 'border-red-500/25 text-red-400 bg-red-500/10' },
  'not-configured': { label: 'no key', cls: 'border-zinc-600/25 text-zinc-500 bg-zinc-600/10' },
  unknown: { label: 'ready', cls: 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10' },
};

// Older responses may omit `health`; derive it from `configured` so the chip and
// the transition tracking agree on a single health value.
const deriveHealth = (p: ProviderSummary): ProviderHealth =>
  p.health ?? (p.configured ? 'unknown' : 'not-configured');

// Compact relative duration ("5s", "3m", "2h", "1d") for the last-changed chip.
function relativeDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface LibraryResponse {
  configured: boolean;
  providers: ProviderSummary[];
  polishConfigured: boolean;
  total: number;
  ready: number;
  pending: number;
  failed: number;
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
  failed: 'bg-red-500/15 text-red-400 border-red-500/25',
};

const BACKEND_STYLES: Record<string, string> = {
  'nano-banana': 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  fal: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20',
  unreal: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
};

export default function ArtLibrary() {
  const [assets, setAssets] = useState<ArtAsset[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  // When each provider's health last changed (client-tracked — the server returns
  // a fresh live probe each poll with no history of its own).
  const [healthChangedAt, setHealthChangedAt] = useState<Record<string, number>>({});
  // Timestamp of the last successful providers fetch (drives "checked Ns ago").
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  // Providers currently flashing a transition highlight (online↔offline).
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  // 1s ticker so the relative "… ago" labels count up between polls.
  const [now, setNow] = useState(() => Date.now());
  // Last health value seen per provider, to detect transitions across polls.
  const prevHealthRef = useRef<Record<string, ProviderHealth>>({});
  // Per-provider flash-clear timers.
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [polishConfigured, setPolishConfigured] = useState(false);
  const [stats, setStats] = useState({ total: 0, ready: 0, pending: 0, failed: 0 });
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
  const testPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single place that ingests a fresh providers list: stores it, stamps the
  // "checked" time, and detects per-provider health transitions so each chip can
  // show "changed Ns ago" and flash when a node flips online↔offline.
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
    setHealthChangedAt(m => {
      const copy = { ...m };
      for (const id of transitioned) copy[id] = ts;
      return copy;
    });
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
  }, []);

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
      setStats({ total: data.total ?? 0, ready: data.ready ?? 0, pending: data.pending ?? 0, failed: data.failed ?? 0 });
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
  const refreshProviders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/art/providers', { credentials: 'include' });
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
      const { asset } = await res.json();
      setAssets(prev => prev.map(a => (a.key === key ? { ...a, ...asset } : a)));
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };

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
    let allSettled = true;
    setTestJobs(prev =>
      prev.map(job => {
        const fresh = results.find(a => a && a.key === job.key);
        const asset = fresh ?? job.asset;
        if (asset.status === 'pending') allSettled = false;
        return { ...job, asset };
      }),
    );
    if (!allSettled) {
      testPollRef.current = setTimeout(() => pollTestJobs(keys), 3000);
    } else {
      setTestRunning(false);
    }
  }, []);

  const runTestRender = async () => {
    if (testPollRef.current) { clearTimeout(testPollRef.current); testPollRef.current = null; }
    setTestRunning(true);
    setTestError(null);
    setTestNotConfigured(false);
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
      setTestJobs(data.jobs ?? []);
      const pendingKeys = (data.jobs ?? []).filter(j => j.asset.status === 'pending').map(j => j.key);
      if (pendingKeys.length > 0) {
        testPollRef.current = setTimeout(() => pollTestJobs(pendingKeys), 3000);
      } else {
        setTestRunning(false);
      }
    } catch (e) {
      console.error(e);
      setTestError((e as Error).message);
      setTestRunning(false);
    }
  };

  // Tidy up the poll timer on unmount.
  useEffect(() => () => { if (testPollRef.current) clearTimeout(testPollRef.current); }, []);

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
                {stats.total} assets · {stats.ready} ready · {stats.pending} pending · {stats.failed} failed
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

        {/* Backends */}
        {!accessDenied && (
          <div className="mb-5 flex flex-wrap gap-2">
            {providers.map(p => {
              const health = deriveHealth(p);
              const badge = HEALTH_BADGE[health];
              const isFlashing = flashing[p.id];
              const changedAt = healthChangedAt[p.id];
              // Prefer "changed Ns ago" once we've observed a transition; otherwise
              // fall back to "checked Ns ago" from the last successful poll.
              const sinceLabel = changedAt
                ? `changed ${relativeDuration(now - changedAt)} ago`
                : lastCheckedAt
                  ? `checked ${relativeDuration(now - lastCheckedAt)} ago`
                  : '';
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
                sinceLabel ? `Status ${sinceLabel}` : '',
                p.lastError ? `Last error: ${p.lastError}` : '',
              ].filter(Boolean).join('\n\n');
              return (
                <div
                  key={p.id}
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
                  {p.isDefault && (
                    <span className="font-mono text-[9px] tracking-widest uppercase text-zinc-500">default</span>
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
          </div>
        )}

        {/* Test render — one-click smoke test against a chosen backend. */}
        {!accessDenied && (
          <div className="mb-5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-fuchsia-400" />
                <span className="font-mono text-[12px] text-zinc-200 tracking-wide uppercase">Test render</span>
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
              </div>
            </div>

            {testError && (
              <p className="mt-3 font-mono text-[10px] text-red-400/90">{testError}</p>
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
                  <div className="aspect-video bg-[#06070b] flex items-center justify-center overflow-hidden">
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
                    {/* Render job type — only meaningful for the Unreal node. */}
                    {chosen === 'unreal' && (
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
                    <div className="flex items-center gap-1.5">
                      {a.mediaType === 'video' ? (
                        <button
                          onClick={() => polish(a.key, 'enhance')}
                          disabled={isBusy || !polishConfigured || a.status !== 'ready'}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded font-mono text-[10px] tracking-widest uppercase text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 disabled:opacity-30 transition-colors"
                          title={polishConfigured ? 'Video super-resolution' : 'Set FAL_KEY to enable'}
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Enhance
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
