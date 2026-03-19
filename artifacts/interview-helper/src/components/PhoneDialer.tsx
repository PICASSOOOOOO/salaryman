import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, X, Clock, ChevronDown, ChevronUp, Users, Zap, CheckSquare, Square, PhoneCall, Loader2 } from 'lucide-react';

interface CRMContact {
  id: number;
  name: string;
  phone: string;
  email: string;
  hometown: string;
}

interface ActiveCall {
  callSid: string;
  phone: string;
  name: string;
  status: string;
  startTime: number;
  elapsed: number;
}

interface BatchResult {
  ok: boolean;
  phone: string;
  name?: string;
  callSid?: string;
  error?: string;
  status?: string;
}

interface CallRecord {
  id: number;
  recipientNumber: string;
  status: string;
  durationSeconds: number | null;
  startedAt: string;
  callerName: string | null;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPhone(num: string): string {
  const digits = num.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return num;
}

type TabMode = 'contacts' | 'dialer' | 'active' | 'history';

export function PhoneDialer({
  userId,
  callerName,
  compact = false,
  onClose,
}: {
  userId: string;
  callerName?: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const BASE = import.meta.env.BASE_URL;
  const [tab, setTab] = useState<TabMode>('contacts');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [blasting, setBlasting] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallsRef = useRef<ActiveCall[]>(activeCalls);
  activeCallsRef.current = activeCalls;

  const crt = (opacity: number) => `rgba(0,255,65,${opacity})`;
  const red = (opacity: number) => `rgba(255,40,40,${opacity})`;
  const amber = (opacity: number) => `rgba(255,180,0,${opacity})`;

  const fetchContacts = useCallback(() => {
    fetch(`${BASE}api/twilio/contacts/${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.contacts) setContacts(d.contacts); })
      .catch(() => {});
  }, [userId, BASE]);

  const fetchHistory = useCallback(() => {
    fetch(`${BASE}api/twilio/history/${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.calls) setHistory(d.calls); })
      .catch(() => {});
  }, [userId, BASE]);

  useEffect(() => { fetchContacts(); fetchHistory(); }, [fetchContacts, fetchHistory]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (calls: ActiveCall[]) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    const startTs = Date.now();
    timerRef.current = setInterval(() => {
      setActiveCalls(prev => prev.map(c => ({ ...c, elapsed: Math.floor((Date.now() - c.startTime) / 1000) })));
    }, 1000);
    pollRef.current = setInterval(async () => {
      const current = activeCallsRef.current.filter(c => c.callSid && !['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(c.status));
      if (current.length === 0) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        fetchHistory();
        return;
      }
      try {
        for (const c of current) {
          const r = await fetch(`${BASE}api/twilio/call-status/${c.callSid}`);
          if (!r.ok) continue;
          const d = await r.json();
          setActiveCalls(prev => prev.map(ac => ac.callSid === c.callSid ? { ...ac, status: d.status } : ac));
        }
      } catch {}
    }, 3000);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const filtered = filteredContacts();
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.id)));
    }
  };

  const filteredContacts = () => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.hometown.toLowerCase().includes(q)
    );
  };

  const blastSelected = async () => {
    if (selected.size === 0 || blasting) return;
    setBlasting(true);
    setError('');
    const numbers = contacts
      .filter(c => selected.has(c.id))
      .map(c => ({ phone: c.phone, name: c.name }));

    try {
      const r = await fetch(`${BASE}api/twilio/batch-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers, userId, callerName }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Batch call failed'); setBlasting(false); return; }
      const newCalls: ActiveCall[] = (d.calls as BatchResult[])
        .filter((c: BatchResult) => c.ok && c.callSid)
        .map((c: BatchResult) => ({
          callSid: c.callSid!,
          phone: c.phone,
          name: c.name || '',
          status: c.status || 'initiated',
          startTime: Date.now(),
          elapsed: 0,
        }));
      const failCount = d.calls.filter((c: BatchResult) => !c.ok).length;
      if (failCount > 0) setError(`${failCount} call(s) failed to initiate`);
      if (newCalls.length > 0) {
        setActiveCalls(prev => [...prev, ...newCalls]);
        startPolling(newCalls);
        setTab('active');
      }
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
    setBlasting(false);
  };

  const callSingle = async (phone: string, name?: string) => {
    setError('');
    setLoading(true);
    try {
      const r = await fetch(`${BASE}api/twilio/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientNumber: phone, userId, callerName, contactName: name }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Call failed'); setLoading(false); return; }
      const newCall: ActiveCall = {
        callSid: d.callSid,
        phone: d.to || phone,
        name: name || '',
        status: d.status || 'initiated',
        startTime: Date.now(),
        elapsed: 0,
      };
      setActiveCalls(prev => [...prev, newCall]);
      startPolling([newCall]);
      setTab('active');
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
    setLoading(false);
  };

  const hangupOne = async (sid: string) => {
    try {
      await fetch(`${BASE}api/twilio/hangup/${sid}`, { method: 'POST' });
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'completed' } : c));
    } catch {}
  };

  const hangupAll = async () => {
    const sids = activeCalls.filter(c => !['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(c.status)).map(c => c.callSid);
    if (sids.length === 0) return;
    try {
      await fetch(`${BASE}api/twilio/hangup-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSids: sids }),
      });
      setActiveCalls(prev => prev.map(c => ({ ...c, status: 'completed' })));
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      fetchHistory();
    } catch {}
  };

  const liveCount = activeCalls.filter(c => !['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(c.status)).length;
  const filtered = filteredContacts();

  const tabBtn = (t: TabMode, label: string, icon: React.ReactNode, badge?: number) => (
    <button
      onClick={() => setTab(t)}
      style={{
        flex: 1, padding: '6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        background: tab === t ? crt(0.08) : 'transparent',
        border: 'none', borderBottom: tab === t ? `2px solid ${crt(0.6)}` : '2px solid transparent',
        color: tab === t ? crt(0.9) : crt(0.35), cursor: 'pointer',
        fontSize: '0.5rem', letterSpacing: '0.1em', fontFamily: "'Share Tech Mono', monospace",
        position: 'relative',
      }}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{
          background: red(0.8), color: '#fff', fontSize: '0.4rem',
          padding: '1px 4px', borderRadius: 6, minWidth: 14, textAlign: 'center',
        }}>{badge}</span>
      )}
    </button>
  );

  return (
    <div style={{
      background: 'rgba(0,8,0,0.97)',
      border: `1px solid ${crt(0.3)}`,
      boxShadow: `0 0 30px ${crt(0.1)}, inset 0 0 30px rgba(0,0,0,0.5)`,
      fontFamily: "'Share Tech Mono', monospace",
      width: compact ? '300px' : '360px',
      maxHeight: '520px',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      {onClose && (
        <button onClick={onClose} style={{
          position: 'absolute', top: 6, right: 6, color: crt(0.4), background: 'none', border: 'none', cursor: 'pointer', zIndex: 10,
        }}>
          <X size={14} />
        </button>
      )}

      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${crt(0.15)}`,
        background: crt(0.03), display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Phone size={14} style={{ color: crt(0.7) }} />
        <span style={{ fontSize: '0.8rem', color: crt(0.8), letterSpacing: '0.15em', fontWeight: 'bold' }}>
          CALLL HOME
        </span>
        <span style={{ fontSize: '0.45rem', color: crt(0.25), marginLeft: 'auto', letterSpacing: '0.08em' }}>
          POWER DIALER
        </span>
      </div>

      {error && (
        <div style={{
          padding: '6px 12px', fontSize: '0.55rem', color: red(0.9),
          background: red(0.05), borderBottom: `1px solid ${red(0.15)}`,
          letterSpacing: '0.08em',
        }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: red(0.5), cursor: 'pointer', fontSize: '0.5rem' }}>DISMISS</button>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: `1px solid ${crt(0.1)}` }}>
        {tabBtn('contacts', 'CONTACTS', <Users size={10} />, contacts.length)}
        {tabBtn('dialer', 'DIAL', <PhoneCall size={10} />)}
        {tabBtn('active', 'LIVE', <Zap size={10} />, liveCount)}
        {tabBtn('history', 'LOG', <Clock size={10} />)}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>

        {tab === 'contacts' && (
          <div>
            <div style={{ padding: '8px 10px', display: 'flex', gap: 6, borderBottom: `1px solid ${crt(0.08)}` }}>
              <input
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                placeholder="Search contacts..."
                style={{
                  flex: 1, background: 'rgba(0,20,0,0.8)', border: `1px solid ${crt(0.2)}`,
                  color: crt(0.9), padding: '5px 8px', fontSize: '0.55rem',
                  fontFamily: "'Share Tech Mono', monospace", outline: 'none',
                }}
              />
              <button onClick={selectAll} style={{
                background: crt(0.06), border: `1px solid ${crt(0.2)}`, color: crt(0.6),
                cursor: 'pointer', padding: '4px 8px', fontSize: '0.45rem',
                fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em',
              }}>
                {selected.size === filtered.length && filtered.length > 0 ? 'NONE' : 'ALL'}
              </button>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: '0.55rem', color: crt(0.25) }}>
                {contacts.length === 0 ? 'NO CONTACTS WITH PHONE NUMBERS' : 'NO MATCHES'}
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {filtered.map(c => (
                  <div
                    key={c.id}
                    style={{
                      padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
                      borderBottom: `1px solid ${crt(0.05)}`, cursor: 'pointer',
                      background: selected.has(c.id) ? crt(0.06) : 'transparent',
                    }}
                    onClick={() => toggleSelect(c.id)}
                  >
                    <div style={{ color: selected.has(c.id) ? crt(0.8) : crt(0.2), flexShrink: 0 }}>
                      {selected.has(c.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.6rem', color: crt(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: '0.45rem', color: crt(0.35) }}>
                        {formatPhone(c.phone)}
                        {c.hometown ? ` · ${c.hometown}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); callSingle(c.phone, c.name); }}
                      style={{
                        background: crt(0.08), border: `1px solid ${crt(0.25)}`, color: crt(0.6),
                        cursor: 'pointer', padding: '3px 6px', display: 'flex', alignItems: 'center', flexShrink: 0,
                      }}
                      title={`Call ${c.name}`}
                    >
                      <Phone size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selected.size > 0 && (
              <div style={{
                padding: '8px 10px', borderTop: `1px solid ${crt(0.15)}`,
                background: crt(0.04), display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: '0.55rem', color: crt(0.6), flex: 1 }}>
                  {selected.size} SELECTED
                </span>
                <button
                  onClick={blastSelected}
                  disabled={blasting}
                  style={{
                    padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6,
                    background: blasting ? amber(0.15) : 'rgba(0,200,50,0.2)',
                    border: `1px solid ${blasting ? amber(0.5) : 'rgba(0,200,50,0.6)'}`,
                    color: blasting ? amber(0.9) : 'rgba(0,255,65,0.95)',
                    cursor: blasting ? 'wait' : 'pointer',
                    fontSize: '0.6rem', letterSpacing: '0.12em', fontWeight: 'bold',
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                >
                  {blasting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                  {blasting ? 'DIALING...' : `BLAST ${selected.size}`}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'dialer' && (
          <div style={{ padding: '12px' }}>
            <div style={{
              background: 'rgba(0,20,0,0.8)', border: `1px solid ${crt(0.2)}`, padding: '10px 12px',
              marginBottom: 10, display: 'flex', alignItems: 'center',
            }}>
              <input
                value={manualNumber}
                onChange={e => setManualNumber(e.target.value)}
                placeholder="Enter phone number..."
                style={{
                  flex: 1, background: 'transparent', border: 'none', color: crt(0.9),
                  fontSize: '1rem', fontFamily: "'Share Tech Mono', monospace",
                  outline: 'none', letterSpacing: '0.08em',
                }}
                onKeyDown={e => { if (e.key === 'Enter' && manualNumber.trim()) callSingle(manualNumber); }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map(key => (
                <button key={key} onClick={() => setManualNumber(prev => prev + key)} style={{
                  height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: crt(0.04), border: `1px solid ${crt(0.15)}`,
                  color: crt(0.8), cursor: 'pointer', fontSize: '1rem',
                  fontFamily: "'Share Tech Mono', monospace",
                }}>
                  {key}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setManualNumber(prev => prev.slice(0, -1))} disabled={!manualNumber} style={{
                flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: crt(0.04), border: `1px solid ${crt(0.15)}`,
                color: manualNumber ? crt(0.6) : crt(0.15), cursor: manualNumber ? 'pointer' : 'default',
                fontSize: '0.6rem', letterSpacing: '0.1em', fontFamily: "'Share Tech Mono', monospace",
              }}>
                DEL
              </button>
              <button
                onClick={() => { if (manualNumber.trim()) callSingle(manualNumber); }}
                disabled={!manualNumber.trim() || loading}
                style={{
                  flex: 2, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: manualNumber ? 'rgba(0,200,50,0.15)' : crt(0.04),
                  border: `1px solid ${manualNumber ? 'rgba(0,200,50,0.5)' : crt(0.15)}`,
                  color: manualNumber ? 'rgba(0,255,65,0.95)' : crt(0.2),
                  cursor: manualNumber ? 'pointer' : 'default',
                  fontSize: '0.65rem', letterSpacing: '0.12em', fontWeight: 'bold',
                  fontFamily: "'Share Tech Mono', monospace",
                }}
              >
                <Phone size={14} />
                {loading ? 'CALLING...' : 'CALL'}
              </button>
            </div>
          </div>
        )}

        {tab === 'active' && (
          <div>
            {activeCalls.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.55rem', color: crt(0.2), letterSpacing: '0.1em' }}>
                NO ACTIVE CALLS
              </div>
            ) : (
              <>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {activeCalls.map((c, i) => {
                    const ended = ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(c.status);
                    return (
                      <div key={c.callSid || i} style={{
                        padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                        borderBottom: `1px solid ${crt(0.06)}`,
                        opacity: ended ? 0.4 : 1,
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: ended ? crt(0.2)
                            : c.status === 'ringing' ? amber(0.8)
                            : c.status === 'in-progress' ? crt(0.8)
                            : crt(0.4),
                          boxShadow: ended ? 'none' : `0 0 6px ${c.status === 'ringing' ? amber(0.5) : crt(0.4)}`,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.6rem', color: crt(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.name || formatPhone(c.phone)}
                          </div>
                          <div style={{ fontSize: '0.45rem', color: crt(0.35) }}>
                            {formatPhone(c.phone)} · {c.status.toUpperCase()} · {formatDuration(c.elapsed)}
                          </div>
                        </div>
                        {!ended && (
                          <button onClick={() => hangupOne(c.callSid)} style={{
                            background: red(0.15), border: `1px solid ${red(0.4)}`, color: red(0.9),
                            cursor: 'pointer', padding: '3px 6px', display: 'flex', alignItems: 'center', flexShrink: 0,
                          }}>
                            <PhoneOff size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {liveCount > 0 && (
                  <div style={{ padding: '8px 10px', borderTop: `1px solid ${crt(0.15)}` }}>
                    <button onClick={hangupAll} style={{
                      width: '100%', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: red(0.15), border: `1px solid ${red(0.4)}`, color: red(0.9),
                      cursor: 'pointer', fontSize: '0.6rem', letterSpacing: '0.1em',
                      fontFamily: "'Share Tech Mono', monospace", fontWeight: 'bold',
                    }}>
                      <PhoneOff size={12} />
                      HANG UP ALL ({liveCount})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: '0.55rem', color: crt(0.2), letterSpacing: '0.1em' }}>
                NO CALL HISTORY
              </div>
            ) : (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {history.map(h => (
                  <div key={h.id} style={{
                    padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: `1px solid ${crt(0.05)}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.6rem', color: crt(0.7) }}>
                        {h.callerName || formatPhone(h.recipientNumber)}
                      </div>
                      <div style={{ fontSize: '0.45rem', color: crt(0.3) }}>
                        {formatPhone(h.recipientNumber)} · {h.status}
                        {h.durationSeconds ? ` · ${formatDuration(h.durationSeconds)}` : ''}
                        {' · '}{new Date(h.startedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => callSingle(h.recipientNumber, h.callerName || undefined)}
                      style={{
                        background: crt(0.06), border: `1px solid ${crt(0.2)}`, color: crt(0.5),
                        cursor: 'pointer', padding: '3px 6px', display: 'flex', alignItems: 'center', flexShrink: 0,
                      }}
                    >
                      <Phone size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{
        padding: '4px 10px', borderTop: `1px solid ${crt(0.1)}`,
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.4rem', color: crt(0.15), letterSpacing: '0.08em',
      }}>
        <span>CALLL HOME v2.0</span>
        <span>TWILIO PSTN</span>
      </div>
    </div>
  );
}
