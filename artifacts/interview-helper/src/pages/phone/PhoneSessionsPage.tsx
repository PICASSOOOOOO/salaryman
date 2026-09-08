import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Radio, Users, Zap, Square, CheckSquare, Loader2, X, Search } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform, INPUT_STYLE } from './PhoneLayout';
import {
  slate, destructive, warning, primary, accent, formatPhone,
  addActiveCallsBatch,
  type CRMContact, type BatchResult, type ActiveCall } from '@/lib/phone-utils';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';

type DialMode = 'power' | 'auto' | 'predictive';

interface DialingSession {
  id: number;
  mode: string;
  total: number;
  dialed: number;
  queue: Array<{ phone: string; name?: string }>;
}

export default function PhoneSessionsPage() {
  const isMobile = useIsMobile();

  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };
  const userId = user?.id ?? '';

  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialingMode, setDialingMode] = useState<DialMode>('power');
  const [dialingSession, setDialingSession] = useState<DialingSession | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  useEffect(() => {
    apiFetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`), { credentials: 'include' })
      .then(async r => {
        if (r.status === 403) { navigate('/pricing'); return; }
        if (r.ok) { const d = await r.json(); if (d?.contacts) setContacts(d.contacts); }
        else { setError(`Failed to load contacts (${r.status})`); }
      })
      .catch(() => setError('Network error loading contacts'));
  }, [userId, apiUrl, navigate]);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.company ?? '').toLowerCase().includes(q));
  }, [contacts, search]);

  const toggleSelect = (id: number) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  };

  const startDialingSession = async () => {
    const selectedContacts = contacts.filter(c => selected.has(c.id));
    if (selectedContacts.length === 0) { setError('Select at least one contact'); return; }
    setLoading(true);
    setError('');
    try {
      const d = await bridgeOutbound(async () => {
        const r = await apiFetch(apiUrl('twilio/dialing/start'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ mode: dialingMode, numbers: selectedContacts.map(c => ({ phone: c.phone, name: c.name })), settings: {} }) });
        const body = await r.json();
        if (r.status === 403) { rawNavigate('/pricing'); throw new Error(body.error || 'Access denied'); }
        if (!r.ok) throw new Error(body.error || 'Failed to start dialing session');
        return body;
      }, created => (created.calls ?? []).filter((c: BatchResult) => c.ok && c.callSid).map((c: BatchResult & { conferenceName?: string }) => ({ callSid: c.callSid!, conferenceName: c.conferenceName })));
      {
        const batchCalls = d.calls as (BatchResult & { conferenceName?: string })[];
        const newActiveCalls: ActiveCall[] = batchCalls
          .filter(c => c.ok && c.callSid)
          .map(c => ({ callSid: c.callSid!, phone: c.phone, name: c.name ?? c.phone, status: c.status ?? 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound', conferenceName: c.conferenceName }));
        addActiveCallsBatch(newActiveCalls);
        const session = { id: d.sessionId, mode: d.mode, total: selectedContacts.length, dialed: batchCalls.filter((c: BatchResult) => c.ok).length, queue: d.queue ?? selectedContacts.map(c => ({ phone: c.phone, name: c.name })) };
        setDialingSession(session);
        try { sessionStorage.setItem('phone_dialing_session', JSON.stringify(session)); } catch {}
        setSelected(new Set());
        navigate('/phone/active');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dialing failed');
    }
    setLoading(false);
  };

  const stopDialingSession = async () => {
    if (!dialingSession) return;
    try {
      const r = await apiFetch(apiUrl(`twilio/dialing/${dialingSession.id}/stop`), { method: 'POST', credentials: 'include' });
      if (r.ok) {
        setDialingSession(null);
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Failed to stop session');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error — could not stop session');
    }
  };

  const MODES: { key: DialMode; label: string; desc: string; details: string; color: (o: number) => string; icon: React.ReactNode }[] = [
    { key: 'power', label: 'POWER DIALING', desc: 'Manual queue advancement', details: 'Call one contact at a time. When a call ends, you manually advance to the next contact in the queue.', color: slate, icon: <Zap size={14} /> },
    { key: 'auto', label: 'AUTO DIALING', desc: 'Automatic queue progression', details: 'Automatically dials the next contact after the current call completes. Configurable delay between calls.', color: primary, icon: '🔄' },
    { key: 'predictive', label: 'PREDICTIVE DIALING', desc: 'Multi-line simultaneous (3x)', details: 'Dials multiple numbers simultaneously to maximize connect rate. Connects you to the first person who answers.', color: accent, icon: '🚀' },
  ];

  const sessionProgress = dialingSession ? Math.round((dialingSession.dialed / dialingSession.total) * 100) : 0;

  return (
    <PhonePageLayout
      title="DIALING SESSIONS"
      subtitle="Power, auto, and predictive batch dialing — build call queues and launch"
      icon={<Radio size={24} style={{ color: slate(0.8) }} />}
      statusLine={
        dialingSession ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MiniWaveform active bars={5} color={MODES.find(m => m.key === dialingSession.mode)?.color || slate} />
            <span style={{ color: slate(0.5) }}>SESSION ACTIVE</span>
          </div>
        ) : (
          <span style={{ color: slate(0.55) }}>NO ACTIVE SESSION</span>
        )
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: destructive(0.05), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      {dialingSession && (
        <PhoneCard style={{ marginBottom: 20 }}>
          <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 50, height: 50, borderRadius: 10,
                background: slate(0.02),
                border: `1px solid ${slate(0.25)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'none 2s infinite' }}>
                <Radio size={22} style={{ color: slate(0.8) }} />
              </div>
              <div>
                <div style={{ fontSize: '0.45rem', color: slate(0.55), letterSpacing: '0.2em', marginBottom: 4 }}>ACTIVE SESSION</div>
                <div style={{ fontSize: '1rem', color: slate(0.9) }}>
                  {dialingSession.mode.toUpperCase()} · {dialingSession.dialed} / {dialingSession.total} INITIATED
                </div>
                <div style={{ marginTop: 8, width: 200, height: 4, background: slate(0.06), borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${sessionProgress}%`, background: slate(0.02), borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <PhoneBtn onClick={() => navigate('/phone/active')} color={primary}>
                <Zap size={12} /> VIEW CALLS
              </PhoneBtn>
              <PhoneBtn onClick={stopDialingSession} color={destructive}>
                <X size={12} /> STOP SESSION
              </PhoneBtn>
            </div>
          </div>
        </PhoneCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL CONTACTS" value={contacts.length} />
        <StatBlock label="SELECTED" value={selected.size} color={selected.size > 0 ? warning : undefined} sub={selected.size > 0 ? 'in queue' : undefined} />
        <StatBlock label="MODE" value={dialingMode.toUpperCase()} color={MODES.find(m => m.key === dialingMode)?.color} />
        <StatBlock label="EST. TIME" value={selected.size > 0 ? `~${Math.ceil(selected.size * 1.5)}m` : '--'} color={primary} sub={selected.size > 0 ? 'approximate' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '360px 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader>DIALING MODE</PhoneCardHeader>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODES.map(m => {
                const isSel = dialingMode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setDialingMode(m.key)}
                    style={{
                      padding: '14px 16px', textAlign: 'left', borderRadius: 8, cursor: 'pointer',
                      background: isSel ? slate(0.06) : slate(0.04),
                      border: `1px solid ${isSel ? m.color(0.35) : slate(0.08)}`,
                      transition: 'all 0.15s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1rem' }}>{m.icon}</span>
                      <div>
                        <div style={{ fontSize: '0.6rem', color: isSel ? m.color(0.9) : slate(0.5), letterSpacing: '0.1em', marginBottom: 3 }}>{m.label}</div>
                        <div style={{ fontSize: '0.45rem', color: isSel ? m.color(0.45) : slate(0.2) }}>{m.desc}</div>
                      </div>
                    </div>
                    {isSel && (
                      <div style={{ fontSize: '0.42rem', color: m.color(0.35), marginTop: 8, lineHeight: 1.6, paddingLeft: 28 }}>
                        {m.details}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={selected.size > 0 ? warning(0.5) : undefined}>SESSION CONTROLS</PhoneCardHeader>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.52rem', color: slate(0.55), lineHeight: 1.7, marginBottom: 4 }}>
                {selected.size === 0 ? 'Select contacts from the list to build a dialing queue.' : `${selected.size} contact${selected.size !== 1 ? 's' : ''} ready in queue.`}
              </div>
              {selected.size > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  background: warning(0.04), border: `1px solid ${warning(0.15)}`, borderRadius: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: warning(0.7) }} />
                  <span style={{ fontSize: '0.48rem', color: warning(0.6) }}>{selected.size} contacts × {dialingMode} mode</span>
                </div>
              )}
              <PhoneBtn
                onClick={startDialingSession}
                disabled={selected.size === 0 || loading || !!dialingSession}
                color={primary}

                style={{ justifyContent: 'center', height: 48 }}
                size="lg"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {loading ? 'GOING ACTIVE...' : `GO ACTIVE (${selected.size})`}
              </PhoneBtn>
            </div>
          </PhoneCard>
        </div>

        <PhoneCard>
          <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>BUILD CALL QUEUE</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>{selected.size} / {filtered.length}</span>
              <PhoneBtn onClick={selectAll} size="sm">
                {selected.size === filtered.length && filtered.length > 0 ? 'NONE' : 'ALL'}
              </PhoneBtn>
            </div>
          </PhoneCardHeader>

          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${slate(0.06)}` }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: slate(0.55) }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter contacts..."
                style={{ ...INPUT_STYLE, paddingLeft: 30 }}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState message="NO CONTACTS WITH PHONE NUMBERS" icon={<Users size={28} />} />
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {filtered.map((c, i) => {
                const isSel = selected.has(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleSelect(c.id)}
                    style={{
                      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                      borderBottom: `1px solid ${slate(0.04)}`,
                      background: isSel ? slate(0.04) : 'transparent',
                      cursor: 'pointer', transition: 'background 0.1s' }}
                  >
                    <div style={{ color: isSel ? slate(0.8) : slate(0.15), flexShrink: 0 }}>
                      {isSel ? <CheckSquare size={14} /> : <Square size={14} />}
                    </div>
                    {isSel && (
                      <div style={{
                        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                        background: MODES.find(m => m.key === dialingMode)?.color(0.1) ?? slate(0.1),
                        border: `1px solid ${MODES.find(m => m.key === dialingMode)?.color(0.25) ?? slate(0.25)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.5rem', color: MODES.find(m => m.key === dialingMode)?.color(0.7) ?? slate(0.7) }}>
                        #{Array.from(selected).sort().indexOf(c.id) + 1}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.65rem', color: slate(isSel ? 0.9 : 0.7) }}>{c.name}</div>
                      <div style={{ fontSize: '0.45rem', color: slate(0.55), marginTop: 1 }}>
                        {formatPhone(c.phone)}{c.company ? ` · ${c.company}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PhoneCard>
      </div>
    </PhonePageLayout>
  );
}
