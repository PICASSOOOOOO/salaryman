import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Loader2, RefreshCw, Sparkles, Palette, Wand2, Scissors, ImageOff } from 'lucide-react';

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

interface ProviderSummary {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  isDefault: boolean;
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
      setProviders(data.providers ?? []);
      setPolishConfigured(Boolean(data.polishConfigured));
      setStats({ total: data.total ?? 0, ready: data.ready ?? 0, pending: data.pending ?? 0, failed: data.failed ?? 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
            {providers.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border ${
                  p.configured ? 'border-white/[0.10] bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.01] opacity-60'
                }`}
                title={p.description}
              >
                <Sparkles className={`w-3.5 h-3.5 ${p.configured ? 'text-fuchsia-400' : 'text-zinc-600'}`} />
                <span className="font-mono text-[11px] text-zinc-300">{p.label}</span>
                <span
                  className={`font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border ${
                    p.configured
                      ? 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10'
                      : 'border-zinc-600/25 text-zinc-500 bg-zinc-600/10'
                  }`}
                >
                  {p.configured ? 'ready' : 'no key'}
                </span>
                {p.isDefault && (
                  <span className="font-mono text-[9px] tracking-widest uppercase text-zinc-500">default</span>
                )}
              </div>
            ))}
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
