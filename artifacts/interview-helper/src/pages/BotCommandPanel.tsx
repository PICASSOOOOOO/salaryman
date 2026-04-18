import { useEffect, useState } from 'react';
import { Loader2, Megaphone, X, Trash2, Users, Bot as BotIcon } from 'lucide-react';

interface Directive {
  id: number;
  orgId: number;
  issuedBy: string;
  message: string;
  scope: 'all' | 'specific';
  targetBotIds: number[];
  status: 'active' | 'rescinded' | 'expired';
  effectiveStatus?: 'active' | 'rescinded' | 'expired';
  expiresAt: string | null;
  createdAt: string;
}

interface OrgBot {
  id: number;
  name: string;
}

export default function BotCommandPanel({ orgId }: { orgId: number }) {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [bots, setBots] = useState<OrgBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState('');
  const [scope, setScope] = useState<'all' | 'specific'>('all');
  const [selectedBots, setSelectedBots] = useState<Set<number>>(new Set());
  const [expiresAt, setExpiresAt] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [dRes, bRes] = await Promise.all([
        fetch(`/api/orgs/${orgId}/bot-directives`, { credentials: 'include' }),
        fetch('/api/bots', { credentials: 'include' }),
      ]);
      if (!dRes.ok) throw new Error('Failed to load directives');
      const dJson = await dRes.json();
      setDirectives(dJson.directives ?? []);
      if (bRes.ok) {
        const bJson = await bRes.json();
        const orgBots = (bJson.bots ?? []).filter((b: any) => b.orgId === orgId);
        setBots(orgBots.map((b: any) => ({ id: b.id, name: b.name })));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: any = { message: trimmed, scope };
      if (scope === 'specific') body.targetBotIds = Array.from(selectedBots);
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();
      const res = await fetch(`/api/orgs/${orgId}/bot-directives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to issue directive');
      }
      setMessage('');
      setScope('all');
      setSelectedBots(new Set());
      setExpiresAt('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function rescind(id: number) {
    if (!confirm('Rescind this directive? Bots will stop receiving it on their next message.')) return;
    try {
      const res = await fetch(`/api/orgs/${orgId}/bot-directives/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Rescind failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rescind failed');
    }
  }

  function toggleBot(id: number) {
    setSelectedBots(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const activeDirectives = directives.filter(d => (d.effectiveStatus ?? d.status) === 'active');
  const archivedDirectives = directives.filter(d => (d.effectiveStatus ?? d.status) !== 'active');

  return (
    <div className="max-w-3xl mx-auto w-full p-4 space-y-6 text-sky-100/90">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-amber-400/80" />
        <h2 className="font-sans text-xs tracking-widest text-amber-300/80">BOT COMMAND PANEL</h2>
      </div>
      <p className="text-xs text-sky-300/50 -mt-3">
        Issue directives that all targeted org bots will follow on their next message.
      </p>

      <div className="border border-amber-400/20 bg-amber-400/5 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-[10px] tracking-widest text-amber-300/70 mb-1">DIRECTIVE</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. This week, prioritize enterprise leads over SMB. Always confirm contract terms before sending."
            className="w-full bg-black/40 border border-amber-400/20 rounded px-3 py-2 text-sm text-amber-50 placeholder-amber-200/20 focus:outline-none focus:border-amber-400/50"
          />
          <div className="text-[10px] text-amber-300/40 text-right">{message.length}/2000</div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setScope('all')}
              className={`px-2 py-1 rounded tracking-widest ${scope === 'all' ? 'bg-amber-400/20 text-amber-200' : 'text-amber-300/40 hover:text-amber-300/70'}`}
            >
              <Users className="w-3 h-3 inline mr-1" />ALL ORG BOTS
            </button>
            <button
              onClick={() => setScope('specific')}
              className={`px-2 py-1 rounded tracking-widest ${scope === 'specific' ? 'bg-amber-400/20 text-amber-200' : 'text-amber-300/40 hover:text-amber-300/70'}`}
            >
              <BotIcon className="w-3 h-3 inline mr-1" />SPECIFIC BOTS
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-amber-300/60">
            <span>EXPIRES</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="bg-black/40 border border-amber-400/20 rounded px-2 py-1 text-xs text-amber-100"
            />
            {expiresAt && (
              <button onClick={() => setExpiresAt('')} className="text-amber-300/40 hover:text-amber-300/80"><X className="w-3 h-3" /></button>
            )}
          </div>
        </div>

        {scope === 'specific' && (
          <div className="border border-amber-400/15 rounded p-2 max-h-40 overflow-y-auto">
            {bots.length === 0 ? (
              <p className="text-[11px] text-amber-300/40 italic">No org bots available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {bots.map(b => (
                  <label key={b.id} className="flex items-center gap-2 text-[11px] cursor-pointer hover:text-amber-200">
                    <input
                      type="checkbox"
                      checked={selectedBots.has(b.id)}
                      onChange={() => toggleBot(b.id)}
                      className="accent-amber-400"
                    />
                    <span className="text-amber-100/80">{b.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-[11px] text-red-400/80">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting || !message.trim() || (scope === 'specific' && selectedBots.size === 0)}
          className="w-full bg-amber-400/20 hover:bg-amber-400/30 disabled:opacity-30 disabled:cursor-not-allowed border border-amber-400/40 rounded py-2 text-xs tracking-widest text-amber-200 transition-colors"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 inline animate-spin" /> : 'ISSUE DIRECTIVE'}
        </button>
      </div>

      <div>
        <h3 className="font-sans text-[11px] tracking-widest text-emerald-300/80 mb-2">ACTIVE DIRECTIVES ({activeDirectives.length})</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-sky-400/40 animate-spin" /></div>
        ) : activeDirectives.length === 0 ? (
          <p className="text-[11px] text-sky-300/30 italic">No active directives.</p>
        ) : (
          <div className="space-y-2">
            {activeDirectives.map(d => (
              <div key={d.id} className="border border-emerald-400/15 bg-emerald-400/5 rounded p-3">
                <div className="flex justify-between items-start gap-3">
                  <p className="text-xs text-emerald-50/90 whitespace-pre-wrap flex-1">{d.message}</p>
                  <button onClick={() => rescind(d.id)} className="text-emerald-300/40 hover:text-red-400" title="Rescind">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-3 text-[10px] text-emerald-300/50 mt-2">
                  <span>{d.scope === 'all' ? 'ALL BOTS' : `${d.targetBotIds.length} BOT(S)`}</span>
                  <span>ISSUED {new Date(d.createdAt).toLocaleString()}</span>
                  {d.expiresAt && <span>EXPIRES {new Date(d.expiresAt).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {archivedDirectives.length > 0 && (
        <div>
          <h3 className="font-sans text-[11px] tracking-widest text-sky-300/40 mb-2">ARCHIVED ({archivedDirectives.length})</h3>
          <div className="space-y-1">
            {archivedDirectives.slice(0, 10).map(d => (
              <div key={d.id} className="border border-sky-400/10 bg-black/20 rounded p-2 opacity-60">
                <p className="text-[11px] text-sky-100/60 line-clamp-2">{d.message}</p>
                <div className="text-[10px] text-sky-300/30 mt-1">
                  {(d.effectiveStatus ?? d.status).toUpperCase()} · {new Date(d.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
