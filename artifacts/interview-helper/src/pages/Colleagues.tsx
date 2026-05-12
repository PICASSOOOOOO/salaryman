import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { Users, UserPlus, Check, X, Loader2, Inbox, Send, Trash2 } from 'lucide-react';

interface Colleague {
  userId: string;
  name: string;
  email: string | null;
  profileImageUrl?: string | null;
}
interface PendingRequest {
  userId: string;
  name: string;
  email: string | null;
  createdAt: string;
}
interface Coworker {
  userId: string;
  name: string;
  email: string | null;
  relation: 'coworker' | 'colleague';
}

export default function Colleagues() {
  const { isAuthenticated } = useAuth();
  const boomerMode = getDefaultBoomerMode();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [incoming, setIncoming] = useState<PendingRequest[]>([]);
  const [outgoing, setOutgoing] = useState<PendingRequest[]>([]);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [sending, setSending] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, contacts] = await Promise.all([
        apiFetch('/api/colleagues').then(x => x.ok ? x.json() : { colleagues: [] }),
        apiFetch('/api/colleagues/requests').then(x => x.ok ? x.json() : { incoming: [], outgoing: [] }),
        apiFetch('/api/colleagues/contacts').then(x => x.ok ? x.json() : { contacts: [] }),
      ]);
      setColleagues(c.colleagues ?? []);
      setIncoming(r.incoming ?? []);
      setOutgoing(r.outgoing ?? []);
      setCoworkers(((contacts.contacts ?? []) as Coworker[]).filter(x => x.relation === 'coworker'));
    } catch {
      setError('Failed to load');
    }
    setLoading(false);
  }, []);
  useEffect(() => { if (isAuthenticated) reload(); }, [isAuthenticated, reload]);

  const sendRequest = async () => {
    const email = emailInput.trim();
    if (!email) return;
    setSending(true); setError(null); setInfo(null);
    const r = await apiFetch('/api/colleagues/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(data.error || 'Could not send request');
    } else {
      setInfo(data.status === 'accepted' ? 'They had already requested you — now accepted.' : 'Request sent.');
      setEmailInput('');
      reload();
    }
    setSending(false);
  };

  const accept = async (userId: string) => {
    setActionId(userId); setError(null);
    const r = await apiFetch(`/api/colleagues/${encodeURIComponent(userId)}/accept`, { method: 'POST' });
    if (!r.ok) setError('Failed to accept');
    setActionId(null); reload();
  };
  const decline = async (userId: string) => {
    setActionId(userId); setError(null);
    const r = await apiFetch(`/api/colleagues/${encodeURIComponent(userId)}/decline`, { method: 'POST' });
    if (!r.ok) setError('Failed to decline');
    setActionId(null); reload();
  };
  const remove = async (userId: string) => {
    setActionId(userId); setError(null);
    const r = await apiFetch(`/api/colleagues/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!r.ok) setError('Failed to remove');
    setActionId(null); reload();
  };

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to manage colleagues.' : 'Salaryman credentials required.'} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0d0a] text-cyan-300 font-mono">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-cyan-400" style={{ fontFamily: "'VT323',monospace" }}>
            <Users className="inline w-5 h-5 mr-2" />
            {boomerMode ? 'COLLEAGUES' : 'COLLEAGUES NETWORK'}
          </h1>
          <p className="text-[10px] tracking-wider text-cyan-400/30 uppercase mt-1">
            COWORKERS ARE AUTOMATIC. ADD COLLEAGUES TO SHARE FILES ACROSS ORGS.
          </p>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 text-[11px] tracking-wider bg-red-500/10 border border-red-500/30 rounded text-red-300 flex items-center justify-between">
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        )}
        {info && (
          <div className="mb-3 px-3 py-2 text-[11px] tracking-wider bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-300 flex items-center justify-between">
            <span>✓ {info}</span>
            <button onClick={() => setInfo(null)}><X size={12} /></button>
          </div>
        )}

        <section className="mb-6 bg-[#0d100d] border border-cyan-500/15 rounded-lg p-4">
          <h2 className="text-xs tracking-widest text-cyan-400/70 mb-3 flex items-center gap-2">
            <UserPlus size={14} /> ADD A COLLEAGUE
          </h2>
          <div className="flex gap-2">
            <input
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendRequest(); }}
              placeholder="email@example.com"
              type="email"
              className="flex-1 px-3 py-1.5 text-xs tracking-wider bg-[#080b08] border border-cyan-500/15 rounded text-cyan-300 placeholder:text-cyan-400/20 outline-none focus:border-cyan-500/40"
            />
            <button
              onClick={sendRequest}
              disabled={sending || !emailInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider bg-cyan-500/15 border border-cyan-500/30 rounded hover:bg-cyan-500/25 disabled:opacity-40"
            >
              {sending ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
              REQUEST
            </button>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-cyan-400/40" size={24}/></div>
        ) : (
          <>
            {incoming.length > 0 && (
              <Section title="INCOMING REQUESTS" icon={<Inbox size={14}/>} count={incoming.length}>
                {incoming.map(p => (
                  <Row key={p.userId} name={p.name} sub={p.email}>
                    <button onClick={() => accept(p.userId)} disabled={actionId === p.userId}
                      className="px-2 py-1 text-[10px] tracking-wider rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                      {actionId === p.userId ? <Loader2 size={12} className="animate-spin"/> : <><Check size={12} className="inline"/> ACCEPT</>}
                    </button>
                    <button onClick={() => decline(p.userId)} disabled={actionId === p.userId}
                      className="px-2 py-1 text-[10px] tracking-wider rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <X size={12} className="inline"/> DECLINE
                    </button>
                  </Row>
                ))}
              </Section>
            )}

            {outgoing.length > 0 && (
              <Section title="SENT REQUESTS" icon={<Send size={14}/>} count={outgoing.length}>
                {outgoing.map(p => (
                  <Row key={p.userId} name={p.name} sub={p.email ? `${p.email} · awaiting reply` : 'awaiting reply'}>
                    <button onClick={() => decline(p.userId)} disabled={actionId === p.userId}
                      className="px-2 py-1 text-[10px] tracking-wider rounded border border-zinc-600 text-zinc-400 hover:text-red-300 hover:border-red-500/40 disabled:opacity-50">
                      CANCEL
                    </button>
                  </Row>
                ))}
              </Section>
            )}

            <Section title={`COLLEAGUES (CROSS-ORG)`} icon={<Users size={14}/>} count={colleagues.length}>
              {colleagues.length === 0 ? (
                <div className="text-[11px] text-cyan-400/30 px-3 py-4 text-center">No colleagues yet — send a request above.</div>
              ) : colleagues.map(c => (
                <Row key={c.userId} name={c.name} sub={c.email}>
                  <button onClick={() => remove(c.userId)} disabled={actionId === c.userId}
                    className="px-2 py-1 text-[10px] tracking-wider rounded border border-zinc-700 text-zinc-500 hover:text-red-300 hover:border-red-500/40 disabled:opacity-50">
                    {actionId === c.userId ? <Loader2 size={12} className="animate-spin"/> : <><Trash2 size={12} className="inline"/> REMOVE</>}
                  </button>
                </Row>
              ))}
            </Section>

            <Section title="COWORKERS (SAME ORG · AUTO)" icon={<Users size={14}/>} count={coworkers.length}>
              {coworkers.length === 0 ? (
                <div className="text-[11px] text-cyan-400/30 px-3 py-4 text-center">You're not in an organization, or no other members yet.</div>
              ) : coworkers.map(c => (
                <Row key={c.userId} name={c.name} sub={c.email ? `${c.email} · automatic` : 'automatic'} />
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6 bg-[#0d100d] border border-cyan-500/15 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-cyan-500/10 flex items-center justify-between">
        <h2 className="text-xs tracking-widest text-cyan-400/70 flex items-center gap-2">{icon} {title}</h2>
        <span className="text-[10px] text-cyan-400/30">{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({ name, sub, children }: { name: string; sub?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-cyan-500/5 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-cyan-200 truncate">{name}</div>
        {sub && <div className="text-[10px] text-cyan-400/30 truncate">{sub}</div>}
      </div>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}
