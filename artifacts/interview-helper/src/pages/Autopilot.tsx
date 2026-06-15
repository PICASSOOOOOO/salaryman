import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import {
  Bot, Loader2, RefreshCw, Power, AlertCircle, Clock,
  Briefcase, Megaphone, PhoneCall, Calculator, ShieldCheck,
} from 'lucide-react';

type AutopilotDomain = 'business_ops' | 'marketing' | 'crm_calls' | 'accounting';

interface DomainConfig {
  orgId: number;
  domain: AutopilotDomain;
  enabled: boolean;
  botId: number | null;
  cadenceMinutes: number | null;
  maxActionsPerTick: number | null;
  budgetCapCents: number | null;
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
  domains: DomainConfig[];
  bots: OrgBot[];
  activity: ActivityRow[];
}

const DOMAIN_ICON: Record<AutopilotDomain, typeof Bot> = {
  business_ops: Briefcase,
  marketing: Megaphone,
  crm_calls: PhoneCall,
  accounting: Calculator,
};

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

export default function Autopilot() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<AutopilotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDomain, setSavingDomain] = useState<AutopilotDomain | null>(null);

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
      setData(await res.json());
    } catch {
      setError('Network error.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
    else setLoading(false);
  }, [isAuthenticated, load]);

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
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <h2 className="font-mono text-[11px] text-cyan-400/80 tracking-widest mb-2">ACTIVITY LOG</h2>
            <div className="bg-[#0c1018] border border-cyan-500/15 rounded-lg divide-y divide-cyan-500/10">
              {data.activity.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-[10px] text-cyan-500/30">
                  No autopilot activity yet.
                </div>
              )}
              {data.activity.map((row) => {
                const oc = OUTCOME_STYLE[row.outcome] ?? { text: 'text-cyan-500/50', label: row.outcome.toUpperCase() };
                const meta = data.meta[row.domain];
                return (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={`font-mono text-[9px] tracking-wider w-16 shrink-0 ${oc.text}`}>{oc.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-cyan-200/80 leading-snug">{row.summary}</p>
                      <p className="font-mono text-[9px] text-cyan-500/35 mt-0.5">
                        {meta?.label ?? row.domain} · {row.action} · {fmtTime(row.createdAt)}
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
