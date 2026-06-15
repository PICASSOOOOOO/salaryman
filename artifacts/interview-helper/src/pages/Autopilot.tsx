import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import {
  Bot, Loader2, RefreshCw, Power, AlertCircle, Clock,
  Briefcase, Megaphone, PhoneCall, Calculator, ShieldCheck,
} from 'lucide-react';

type AutopilotDomain = 'business_ops' | 'marketing' | 'crm_calls' | 'accounting';

interface MarketingPrefs {
  platforms: string[];
  tone: string;
  topics: string[];
}

interface DomainConfig {
  orgId: number;
  domain: AutopilotDomain;
  enabled: boolean;
  botId: number | null;
  cadenceMinutes: number | null;
  maxActionsPerTick: number | null;
  budgetCapCents: number | null;
  prefs: Record<string, unknown>;
  lastRunAt: string | null;
  exists: boolean;
  updatedBy: string | null;
}

interface OrgBot {
  id: number;
  name: string;
  status: string;
  department: string | null;
}

interface ActivityRow {
  id: number;
  domain: AutopilotDomain;
  botId: number | null;
  action: string;
  summary: string;
  outcome: string;
  createdAt: string;
}

interface AutopilotPayload {
  orgId: number;
  meta: Record<AutopilotDomain, { label: string; description: string }>;
  defaults: { cadenceMinutes: number; maxActionsPerTick: number };
  marketing: { tones: string[]; platforms: { id: string; label: string }[] };
  domains: DomainConfig[];
  bots: OrgBot[];
  activity: ActivityRow[];
}

function readMarketingPrefs(prefs: Record<string, unknown>): MarketingPrefs {
  const platforms = Array.isArray(prefs.platforms)
    ? (prefs.platforms.filter((p) => typeof p === 'string') as string[])
    : [];
  const tone = typeof prefs.tone === 'string' ? prefs.tone : '';
  const topics = Array.isArray(prefs.topics)
    ? (prefs.topics.filter((t) => typeof t === 'string') as string[])
    : [];
  return { platforms, tone, topics };
}

function MarketingPrefsEditor({
  cfg,
  options,
  busy,
  onSave,
}: {
  cfg: DomainConfig;
  options: { tones: string[]; platforms: { id: string; label: string }[] };
  busy: boolean;
  onSave: (prefs: MarketingPrefs) => void;
}) {
  const initial = readMarketingPrefs(cfg.prefs);
  const [platforms, setPlatforms] = useState<string[]>(initial.platforms);
  const [tone, setTone] = useState<string>(initial.tone || (options.tones[0] ?? 'professional'));
  const [topicsText, setTopicsText] = useState<string>(initial.topics.join('\n'));

  // Re-sync local state if the server view changes (e.g. after a refresh).
  useEffect(() => {
    const next = readMarketingPrefs(cfg.prefs);
    setPlatforms(next.platforms);
    setTone(next.tone || (options.tones[0] ?? 'professional'));
    setTopicsText(next.topics.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.prefs]);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const save = () => {
    const topics = topicsText
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ platforms, tone, topics });
  };

  return (
    <div className="mt-4 pt-4 border-t border-cyan-500/10">
      <p className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-3">
        POSTING PREFERENCES — steer what the bot posts and where.
      </p>

      <div className="mb-3">
        <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1.5 block">
          ALLOWED PLATFORMS <span className="text-cyan-500/25">(none = rotate connected accounts)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {options.platforms.map((p) => {
            const on = platforms.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => togglePlatform(p.id)}
                className={`px-2.5 py-1 rounded font-mono text-[10px] tracking-wider border transition-colors ${
                  on
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                    : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">TONE</label>
          <select
            disabled={busy}
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none appearance-none capitalize"
          >
            {options.tones.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
            TOPICS / THEMES <span className="text-cyan-500/25">(one per line)</span>
          </label>
          <textarea
            disabled={busy}
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            rows={3}
            placeholder={'e.g. Summer sale\nNew product launch\nCustomer stories'}
            className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[10px] tracking-wider border bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors ${
            busy ? 'opacity-50' : ''
          }`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Megaphone className="w-3 h-3" />}
          SAVE PREFERENCES
        </button>
      </div>
    </div>
  );
}

const DOMAIN_ICON: Record<AutopilotDomain, typeof Bot> = {
  business_ops: Briefcase,
  marketing: Megaphone,
  crm_calls: PhoneCall,
  accounting: Calculator,
};

const AUTOPILOT_DOMAIN_ORDER: AutopilotDomain[] = ['business_ops', 'marketing', 'crm_calls', 'accounting'];

const OUTCOME_STYLE: Record<string, { text: string; label: string }> = {
  success: { text: 'text-green-400', label: 'SUCCESS' },
  noop: { text: 'text-cyan-500/50', label: 'NO-OP' },
  blocked: { text: 'text-amber-400', label: 'BLOCKED' },
  error: { text: 'text-red-400', label: 'ERROR' },
};

function fmtTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Compact "live feed" relative time: 12s, 4m, 3h, 2d, then a date. */
function fmtRelative(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtTime(iso);
}

const ACTIVITY_POLL_MS = 15000;

export default function Autopilot() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<AutopilotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDomain, setSavingDomain] = useState<AutopilotDomain | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityFilter, setActivityFilter] = useState<AutopilotDomain | 'all'>('all');
  const [activityRefreshing, setActivityRefreshing] = useState(false);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/autopilot');
      if (res.status === 401) {
        setError('Sign in required.');
        setData(null);
        return;
      }
      if (res.status === 403) {
        setError('You need owner or manager access to manage autopilot.');
        setData(null);
        return;
      }
      if (res.status === 404) {
        setError('You are not part of an organization yet.');
        setData(null);
        return;
      }
      if (!res.ok) {
        setError('Failed to load autopilot.');
        setData(null);
        return;
      }
      const payload: AutopilotPayload = await res.json();
      setData(payload);
      setActivity(payload.activity ?? []);
      setLastActivityAt(Date.now());
    } catch {
      setError('Network error.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch just the activity feed (filtered), used for live polling and filter
  // changes — keeps the control surface above untouched.
  const loadActivity = useCallback(
    async (filter: AutopilotDomain | 'all') => {
      setActivityRefreshing(true);
      try {
        const qs = filter === 'all' ? '' : `?domain=${encodeURIComponent(filter)}`;
        const res = await apiFetch(`/autopilot/activity${qs}`);
        if (!res.ok) return;
        const payload: { activity?: ActivityRow[] } = await res.json();
        setActivity(payload.activity ?? []);
        setLastActivityAt(Date.now());
      } catch {
        // Silent — polling failures shouldn't surface as page errors.
      } finally {
        setActivityRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isAuthenticated) void load();
    else setLoading(false);
  }, [isAuthenticated, load]);

  // Refetch the feed whenever the domain filter changes (after the first load).
  useEffect(() => {
    if (!data) return;
    void loadActivity(activityFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityFilter]);

  // Live polling: keep the activity feed fresh while the page is open and visible.
  useEffect(() => {
    if (!isAuthenticated || !data) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadActivity(activityFilter);
    }, ACTIVITY_POLL_MS);
    return () => window.clearInterval(id);
  }, [isAuthenticated, data, activityFilter, loadActivity]);

  // Tick once a minute so relative timestamps ("4m ago") stay current.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const patchDomain = useCallback(
    async (domain: AutopilotDomain, body: Record<string, unknown>) => {
      setSavingDomain(domain);
      try {
        const res = await apiFetch(`/autopilot/${domain}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError('Could not save that change.');
          return;
        }
        await load();
      } catch {
        setError('Network error while saving.');
      } finally {
        setSavingDomain(null);
      }
    },
    [load]
  );

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage autopilot." />;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-cyan-100 px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-mono text-base text-cyan-300 tracking-widest flex items-center gap-2">
            <Bot className="w-5 h-5" /> AGENT AUTOPILOT
          </h1>
          <p className="font-mono text-[10px] text-cyan-500/40 tracking-wider mt-1">
            Assign a Pixel Agent to run a business domain on its own. OFF = fully manual, exactly as today.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400/80 font-mono text-[10px] tracking-wider hover:bg-cyan-500/20 transition-colors rounded"
        >
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-amber-500/10 border border-amber-500/20 rounded text-amber-400 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex items-start gap-2 px-3 py-2 mb-4 bg-cyan-500/[0.04] border border-cyan-500/15 rounded text-cyan-500/50 text-[10px] font-mono leading-relaxed">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400/60" />
            Autopilot only does what a human in the same seat could do, and respects entitlement, credit, and
            per-tick limits. Automated behavior for each domain is being rolled out — toggling ON now just arms the
            scheduler and logs activity below.
          </div>

          <div className="space-y-3">
            {data.domains.map((cfg) => {
              const Icon = DOMAIN_ICON[cfg.domain];
              const meta = data.meta[cfg.domain];
              const busy = savingDomain === cfg.domain;
              return (
                <div key={cfg.domain} className="bg-[#0c1018] border border-cyan-500/15 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-cyan-400/80" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-mono text-xs text-cyan-300 tracking-wider">{meta?.label ?? cfg.domain}</h3>
                        <p className="font-mono text-[9px] text-cyan-500/40 leading-relaxed mt-0.5">
                          {meta?.description}
                        </p>
                      </div>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => void patchDomain(cfg.domain, { enabled: !cfg.enabled })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[10px] tracking-wider border transition-colors shrink-0 ${
                        cfg.enabled
                          ? 'bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25'
                          : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
                      } ${busy ? 'opacity-50' : ''}`}
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                      {cfg.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    <div>
                      <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
                        ASSIGNED AGENT
                      </label>
                      <select
                        disabled={busy}
                        value={cfg.botId ?? ''}
                        onChange={(e) =>
                          void patchDomain(cfg.domain, {
                            botId: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none appearance-none"
                      >
                        <option value="">— none —</option>
                        {data.bots.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                            {b.department ? ` · ${b.department}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
                        CADENCE (MIN)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        disabled={busy}
                        defaultValue={cfg.cadenceMinutes ?? data.defaults.cadenceMinutes}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== (cfg.cadenceMinutes ?? data.defaults.cadenceMinutes)) {
                            void patchDomain(cfg.domain, { cadenceMinutes: v });
                          }
                        }}
                        className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
                        MAX ACTIONS / TICK
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        disabled={busy}
                        defaultValue={cfg.maxActionsPerTick ?? data.defaults.maxActionsPerTick}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== (cfg.maxActionsPerTick ?? data.defaults.maxActionsPerTick)) {
                            void patchDomain(cfg.domain, { maxActionsPerTick: v });
                          }
                        }}
                        className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-3 font-mono text-[9px] text-cyan-500/35">
                    <Clock className="w-3 h-3" /> last run: {fmtTime(cfg.lastRunAt)}
                  </div>

                  {cfg.domain === 'marketing' && (
                    <MarketingPrefsEditor
                      cfg={cfg}
                      options={data.marketing}
                      busy={busy}
                      onSave={(prefs) => void patchDomain(cfg.domain, { prefs })}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <h2 className="font-mono text-[11px] text-cyan-400/80 tracking-widest flex items-center gap-2">
                ACTIVITY LOG
                <span className="flex items-center gap-1 text-[8px] text-green-400/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400/80 animate-pulse" /> LIVE
                </span>
              </h2>
              <span className="font-mono text-[8px] text-cyan-500/30 flex items-center gap-1">
                {activityRefreshing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                {lastActivityAt ? `updated ${fmtRelative(new Date(lastActivityAt).toISOString())}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {(['all', ...AUTOPILOT_DOMAIN_ORDER] as const).map((f) => {
                const active = activityFilter === f;
                const label = f === 'all' ? 'ALL' : (data.meta[f]?.label ?? f).toUpperCase();
                return (
                  <button
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    className={`px-2.5 py-1 rounded font-mono text-[9px] tracking-wider border transition-colors ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                        : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="bg-[#0c1018] border border-cyan-500/15 rounded-lg divide-y divide-cyan-500/10">
              {activity.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-[10px] text-cyan-500/30">
                  {activityFilter === 'all'
                    ? 'No autopilot activity yet.'
                    : `No ${(data.meta[activityFilter]?.label ?? activityFilter)} activity yet.`}
                </div>
              )}
              {activity.map((row) => {
                const oc = OUTCOME_STYLE[row.outcome] ?? { text: 'text-cyan-500/50', label: row.outcome.toUpperCase() };
                const meta = data.meta[row.domain];
                return (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={`font-mono text-[9px] tracking-wider w-16 shrink-0 ${oc.text}`}>{oc.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-cyan-200/80 leading-snug">{row.summary}</p>
                      <p className="font-mono text-[9px] text-cyan-500/35 mt-0.5">
                        {meta?.label ?? row.domain} · {row.action} ·{' '}
                        <span title={fmtTime(row.createdAt)}>{fmtRelative(row.createdAt)}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
