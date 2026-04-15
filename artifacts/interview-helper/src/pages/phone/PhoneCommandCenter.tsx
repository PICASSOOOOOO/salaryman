import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import {
  Phone, PhoneOff, Mic, MicOff, PauseCircle, PlayCircle, ArrowRightLeft,
  Plus, X, Radio, Zap, Circle, Square, Bot, Users, Activity,
  ChevronDown, ChevronUp, Volume2, Hash, AlertCircle, Loader2,
  Settings, Gauge, SkipForward,
} from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { PhoneCard, PhoneCardHeader, PhoneBtn, MiniWaveform, SignalMeter } from './PhoneLayout';
import { useActiveCallContext } from '@/contexts/ActiveCallContext';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';
import {
  crt, red, amber, blue, purple, formatPhone, formatDuration, ENDED_STATUSES,
  callStatusToSignalLevel,
  type ActiveCall, type CRMContact, type BatchResult,
} from '@/lib/phone-utils';

type DialMode = 'power' | 'auto' | 'predictive';

const MODES: { key: DialMode; label: string; desc: string; color: (o: number) => string; icon: React.ReactNode }[] = [
  { key: 'power', label: 'POWER', desc: 'One at a time', color: crt, icon: <Zap size={10} /> },
  { key: 'auto', label: 'AUTO', desc: 'Auto-advance', color: blue, icon: <SkipForward size={10} /> },
  { key: 'predictive', label: 'PREDICT', desc: '3× simultaneous', color: purple, icon: <Radio size={10} /> },
];

function validatePhoneNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits[0] === '1') return true;
  if (raw.startsWith('+') && digits.length >= 7 && digits.length <= 15) return true;
  return false;
}

function CompactDialPad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
      {keys.map(k => (
        <button key={k} onClick={() => onKey(k)} style={{
          background: crt(0.04), border: `1px solid ${crt(0.1)}`, borderRadius: 6,
          color: crt(0.8), fontSize: '0.85rem', padding: '8px 0', cursor: 'pointer',
          transition: 'all 0.1s',
        }}>
          {k}
        </button>
      ))}
    </div>
  );
}

function LiveCallCard({
  call, onMute, onHold, onTransfer, onHangup, boomer,
}: {
  call: ActiveCall;
  onMute: () => void;
  onHold: () => void;
  onTransfer: () => void;
  onHangup: () => void;
  boomer: boolean;
}) {
  const isEnded = ENDED_STATUSES.includes(call.status);
  const isLive = call.status === 'in-progress';
  const statusColor = isLive ? crt : call.status === 'ringing' ? amber : isEnded ? red : crt;

  return (
    <div style={{
      padding: '10px 12px',
      background: isLive ? crt(0.03) : 'transparent',
      borderBottom: `1px solid ${crt(0.06)}`,
      opacity: isEnded ? 0.4 : 1,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MiniWaveform active={isLive && !call.muted && !call.onHold} color={statusColor} bars={4} />
            <span style={{
              fontSize: '0.7rem', color: crt(0.9), fontWeight: 'bold',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {call.name || formatPhone(call.phone)}
            </span>
            {call.direction === 'inbound' && (
              <span style={{ fontSize: '0.4rem', color: amber(0.6), padding: '1px 4px', border: `1px solid ${amber(0.2)}`, borderRadius: 3 }}>IN</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: '0.5rem', color: crt(0.4) }}>{formatPhone(call.phone)}</span>
            <span style={{ fontSize: '0.5rem', color: statusColor(0.7), textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {call.status}
            </span>
            {!isEnded && (
              <span style={{
                fontSize: '0.5rem', color: crt(0.5), fontVariantNumeric: 'tabular-nums',
                ...(boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
              }}>
                {formatDuration(call.elapsed)}
              </span>
            )}
            {call.muted && <span style={{ fontSize: '0.4rem', color: red(0.7) }}>MUTED</span>}
            {call.onHold && <span style={{ fontSize: '0.4rem', color: amber(0.7) }}>HOLD</span>}
            {call.recordingActive && (
              <span style={{ fontSize: '0.4rem', color: red(0.8), display: 'flex', alignItems: 'center', gap: 2 }}>
                <Circle size={6} fill={red(0.8)} /> REC
              </span>
            )}
          </div>
        </div>
        {!isEnded && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            <ControlBtn icon={call.muted ? <MicOff size={12} /> : <Mic size={12} />} onClick={onMute} active={call.muted} color={call.muted ? red : crt} title="Mute" />
            <ControlBtn icon={call.onHold ? <PlayCircle size={12} /> : <PauseCircle size={12} />} onClick={onHold} active={call.onHold} color={call.onHold ? amber : crt} title="Hold" />
            <ControlBtn icon={<ArrowRightLeft size={12} />} onClick={onTransfer} color={blue} title="Transfer" />
            <ControlBtn icon={<PhoneOff size={12} />} onClick={onHangup} color={red} title="Hangup" />
          </div>
        )}
      </div>
    </div>
  );
}

function ControlBtn({
  icon, onClick, active, color: c = crt, title, size = 28,
}: {
  icon: React.ReactNode; onClick: () => void; active?: boolean;
  color?: (o: number) => string; title?: string; size?: number;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: size, height: size, borderRadius: 6,
      background: active ? c(0.2) : c(0.06),
      border: `1px solid ${c(active ? 0.4 : 0.15)}`,
      color: c(0.85), cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
      {icon}
    </button>
  );
}

function SessionStatusBar({
  session, onNext, onStop, loading,
}: {
  session: { id: number; mode: string; total: number; dialed: number } | null;
  onNext: () => void;
  onStop: () => void;
  loading: boolean;
}) {
  if (!session) return null;
  const pct = session.total > 0 ? (session.dialed / session.total) * 100 : 0;
  return (
    <div style={{
      padding: '8px 12px', background: blue(0.04),
      border: `1px solid ${blue(0.15)}`, borderRadius: 6, marginTop: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={12} style={{ color: blue(0.7) }} />
            <span style={{ fontSize: '0.5rem', color: blue(0.8), letterSpacing: '0.12em' }}>
              {session.mode.toUpperCase()} SESSION
            </span>
            <span style={{ fontSize: '0.5rem', color: crt(0.5) }}>
              {session.dialed} / {session.total}
            </span>
          </div>
          <div style={{ height: 3, background: crt(0.06), borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: blue(0.6), borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {session.mode === 'power' && (
            <PhoneBtn onClick={onNext} disabled={loading} color={blue} size="sm">
              <SkipForward size={10} /> NEXT
            </PhoneBtn>
          )}
          <PhoneBtn onClick={onStop} disabled={loading} color={red} size="sm">
            <Square size={10} /> STOP
          </PhoneBtn>
        </div>
      </div>
    </div>
  );
}

export default function PhoneCommandCenter() {
  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const userId = user?.id ?? '';
  const callerName = user?.firstName ?? user?.email?.split('@')[0];

  const { connectToConference, deviceState } = useTwilioDeviceContext();
  const { activeCalls, setActiveCalls, toggleMute, toggleHold, transferCall: ctxTransfer, hangupOne, hangupAll } = useActiveCallContext();

  const [manualNumber, setManualNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [showDialPad, setShowDialPad] = useState(false);
  const [dialMode, setDialMode] = useState<DialMode>('power');
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferNumber, setTransferNumber] = useState('');
  const [showQueue, setShowQueue] = useState(false);
  const [queueContacts, setQueueContacts] = useState<CRMContact[]>([]);
  const [dialingSession, setDialingSession] = useState<{ id: number; mode: string; total: number; dialed: number } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [showModePanel, setShowModePanel] = useState(false);
  const [callStarting, setCallStarting] = useState(false);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const liveCalls = useMemo(() => activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)), [activeCalls]);
  const endedCalls = useMemo(() => activeCalls.filter(c => ENDED_STATUSES.includes(c.status)).slice(0, 5), [activeCalls]);

  useEffect(() => {
    fetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`), { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.contacts) setContacts(d.contacts.slice(0, 20)); })
      .catch(() => {});
  }, [userId, apiUrl]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('phone_dialing_session');
      if (raw) setDialingSession(JSON.parse(raw));
    } catch {}
  }, []);

  const handleFetchError = useCallback(async (r: Response): Promise<boolean> => {
    if (r.ok) return false;
    if (r.status === 403) { rawNavigate('/pricing'); return true; }
    const d = await r.json().catch(() => ({}));
    setError(d.error || `Request failed (${r.status})`);
    return true;
  }, [rawNavigate]);

  const callSingle = async (phone: string, name?: string, contactId?: number) => {
    if (!validatePhoneNumber(phone)) { setError('Invalid phone number'); return; }
    setError('');
    setLoading(true);
    setCallStarting(true);
    try {
      const r = await fetch(apiUrl('twilio/call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipientNumber: phone, userId, callerName, contactName: name, contactId }),
      });
      if (await handleFetchError(r)) { setLoading(false); setCallStarting(false); return; }
      const d = await r.json();
      if (d.callSid) {
        const newCall: ActiveCall = {
          callSid: d.callSid, phone, name: name ?? phone, status: 'queued',
          startTime: Date.now(), elapsed: 0, direction: 'outbound', conferenceName: d.conferenceName,
        };
        setActiveCalls(prev => [...prev.filter(c => c.callSid !== d.callSid), newCall]);
        if (d.conferenceName) {
          connectToConference(d.conferenceName).catch(err => {
            console.warn('[CMD] browser connect failed:', err instanceof Error ? err.message : err);
          });
        }
      }
      setManualNumber('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
    setTimeout(() => setCallStarting(false), 2000);
  };

  const launchSession = async () => {
    const nums = queueContacts.map(c => ({ phone: c.phone, name: c.name }));
    if (nums.length === 0) { setError('Add contacts to queue first'); return; }
    setSessionLoading(true);
    setError('');
    try {
      const r = await fetch(apiUrl('twilio/dialing/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: dialMode, numbers: nums, settings: {} }),
      });
      if (await handleFetchError(r)) { setSessionLoading(false); return; }
      const d = await r.json();
      const batchCalls = d.calls as (BatchResult & { conferenceName?: string })[];
      const newActiveCalls: ActiveCall[] = batchCalls
        .filter(c => c.ok && c.callSid)
        .map(c => ({
          callSid: c.callSid!, phone: c.phone, name: c.name ?? c.phone,
          status: c.status ?? 'queued', startTime: Date.now(), elapsed: 0,
          direction: 'outbound', conferenceName: c.conferenceName,
        }));
      setActiveCalls(prev => {
        const existingSids = new Set(prev.map(c => c.callSid));
        const fresh = newActiveCalls.filter(c => !existingSids.has(c.callSid));
        return [...prev, ...fresh];
      });
      const firstConf = batchCalls.find(c => c.ok && c.conferenceName)?.conferenceName;
      if (firstConf) {
        connectToConference(firstConf).catch(err => {
          console.warn('[CMD] browser connect failed:', err instanceof Error ? err.message : err);
        });
      }
      const session = { id: d.sessionId, mode: d.mode, total: nums.length, dialed: batchCalls.filter((c: BatchResult) => c.ok).length };
      setDialingSession(session);
      try { sessionStorage.setItem('phone_dialing_session', JSON.stringify(session)); } catch {}
      setQueueContacts([]);
      setShowQueue(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setSessionLoading(false);
  };

  const nextInSession = async () => {
    if (!dialingSession) return;
    setSessionLoading(true);
    try {
      const r = await fetch(apiUrl(`twilio/dialing/${dialingSession.id}/next`), { method: 'POST', credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        if (d.call?.callSid) {
          const nc: ActiveCall = {
            callSid: d.call.callSid, phone: d.call.phone, name: d.call.name ?? d.call.phone,
            status: 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound',
            conferenceName: d.call.conferenceName,
          };
          setActiveCalls(prev => [...prev.filter(c => c.callSid !== nc.callSid), nc]);
          if (d.call.conferenceName) {
            connectToConference(d.call.conferenceName).catch(() => {});
          }
        }
        setDialingSession(prev => prev ? { ...prev, dialed: (prev.dialed || 0) + 1 } : prev);
      }
    } catch {}
    setSessionLoading(false);
  };

  const stopSession = async () => {
    if (!dialingSession) return;
    setSessionLoading(true);
    try {
      await fetch(apiUrl(`twilio/dialing/${dialingSession.id}/stop`), { method: 'POST', credentials: 'include' });
      setDialingSession(null);
      try { sessionStorage.removeItem('phone_dialing_session'); } catch {}
    } catch {}
    setSessionLoading(false);
  };

  const handleTransfer = async (sid: string) => {
    if (!transferNumber.trim()) return;
    const result = await ctxTransfer(sid, transferNumber);
    if (result.ok) {
      setTransferTarget(null);
      setTransferNumber('');
    } else {
      setError(result.error || 'Transfer failed');
    }
  };

  const toggleContactInQueue = (contact: CRMContact) => {
    setQueueContacts(prev => {
      const exists = prev.find(c => c.id === contact.id);
      return exists ? prev.filter(c => c.id !== contact.id) : [...prev, contact];
    });
  };

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${crt(0.1)}, ${crt(0.03)})`,
            border: `1px solid ${crt(0.2)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Activity size={16} style={{ color: crt(0.7) }} />
          </div>
          <div>
            <h2 style={{ fontSize: '0.85rem', letterSpacing: '0.2em', color: crt(0.85), margin: 0, fontWeight: 'normal' }}>
              COMMAND CENTER
            </h2>
            <div style={{ fontSize: '0.4rem', color: crt(0.25), letterSpacing: '0.1em', marginTop: 2 }}>
              UNIFIED CALL OPERATIONS
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 4, border: `1px solid ${crt(0.1)}`,
            fontSize: '0.42rem', color: crt(0.4), letterSpacing: '0.1em',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: deviceState === 'ready' ? crt(0.7) : deviceState === 'error' ? red(0.7) : amber(0.5),
              boxShadow: deviceState === 'ready' ? `0 0 6px ${crt(0.3)}` : 'none',
            }} />
            {deviceState === 'ready' ? 'DEVICE READY' : deviceState === 'initializing' ? 'CONNECTING...' : deviceState === 'error' ? 'DEVICE ERROR' : 'OFFLINE'}
          </div>
          <div style={{
            padding: '3px 8px', borderRadius: 4, border: `1px solid ${crt(0.1)}`,
            fontSize: '0.42rem', color: crt(0.4),
          }}>
            {liveCalls.length} LIVE
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', marginBottom: 10,
          background: red(0.06), border: `1px solid ${red(0.2)}`, borderRadius: 6,
          fontSize: '0.5rem', color: red(0.8), display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle size={12} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: red(0.5), cursor: 'pointer' }}>
            <X size={12} />
          </button>
        </div>
      )}

      <div className="cmd-grid" style={{ display: 'grid', gap: 10, alignItems: 'start' }}>

        {/* LEFT PANEL — DIALER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PhoneCard>
            <PhoneCardHeader><Phone size={10} /> DIALER</PhoneCardHeader>
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  value={manualNumber}
                  onChange={e => setManualNumber(e.target.value)}
                  placeholder="Enter number..."
                  onKeyDown={e => { if (e.key === 'Enter' && manualNumber) callSingle(manualNumber); }}
                  style={{
                    flex: 1, background: crt(0.04), border: `1px solid ${crt(0.15)}`,
                    color: crt(0.9), padding: '8px 10px', fontSize: '0.75rem',
                    borderRadius: 6, outline: 'none',
                  }}
                />
                <PhoneBtn
                  onClick={() => callSingle(manualNumber)}
                  disabled={!manualNumber || loading}
                  color={crt}
                  glow={!!manualNumber}
                  size="sm"
                >
                  {loading && callStarting ? <Loader2 size={12} className="spin" /> : <Phone size={12} />}
                </PhoneBtn>
              </div>

              <button
                onClick={() => setShowDialPad(!showDialPad)}
                style={{
                  width: '100%', background: 'none', border: `1px solid ${crt(0.08)}`,
                  color: crt(0.3), fontSize: '0.42rem', padding: '4px 0',
                  cursor: 'pointer', borderRadius: 4, letterSpacing: '0.1em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Hash size={10} /> KEYPAD {showDialPad ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>

              {showDialPad && (
                <div style={{ marginTop: 8 }}>
                  <CompactDialPad onKey={k => setManualNumber(prev => prev + k)} />
                </div>
              )}
            </div>
          </PhoneCard>

          {/* SPEED DIAL */}
          <PhoneCard>
            <PhoneCardHeader>
              <Users size={10} /> SPEED DIAL
              <span style={{ marginLeft: 'auto', fontSize: '0.4rem', color: crt(0.2) }}>{contacts.length}</span>
            </PhoneCardHeader>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {contacts.slice(0, 10).map(c => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 12px', borderBottom: `1px solid ${crt(0.04)}`,
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                  onClick={() => callSingle(c.phone, c.name, c.id)}
                  onMouseEnter={e => (e.currentTarget.style.background = crt(0.04))}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <div style={{ fontSize: '0.55rem', color: crt(0.8) }}>{c.name}</div>
                    <div style={{ fontSize: '0.4rem', color: crt(0.3) }}>{formatPhone(c.phone)}</div>
                  </div>
                  <Phone size={10} style={{ color: crt(0.3) }} />
                </div>
              ))}
              {contacts.length === 0 && (
                <div style={{ padding: '16px 12px', fontSize: '0.45rem', color: crt(0.2), textAlign: 'center' }}>
                  No contacts yet
                </div>
              )}
            </div>
          </PhoneCard>
        </div>

        {/* CENTER PANEL — LIVE CALLS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PhoneCard glow={liveCalls.length > 0}>
            <PhoneCardHeader accent={liveCalls.length > 0 ? crt(0.6) : undefined}>
              <Zap size={10} /> ACTIVE LINES
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.4rem', color: crt(0.4) }}>
                  {liveCalls.length} LIVE
                </span>
                {liveCalls.length > 0 && (
                  <PhoneBtn onClick={() => hangupAll()} color={red} size="sm">
                    <PhoneOff size={10} /> END ALL
                  </PhoneBtn>
                )}
              </span>
            </PhoneCardHeader>
            <div style={{ minHeight: 120 }}>
              {liveCalls.length === 0 && endedCalls.length === 0 ? (
                <div style={{
                  padding: '40px 16px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}>
                  <Phone size={24} style={{ opacity: 0.1, color: crt(1) }} />
                  <div style={{ fontSize: '0.55rem', color: crt(0.15), letterSpacing: '0.12em' }}>
                    NO ACTIVE CALLS
                  </div>
                  <div style={{ fontSize: '0.42rem', color: crt(0.1) }}>
                    Dial a number or select a contact to begin
                  </div>
                </div>
              ) : (
                <>
                  {liveCalls.map(call => (
                    <LiveCallCard
                      key={call.callSid}
                      call={call}
                      boomer={boomerMode}
                      onMute={() => toggleMute(call.callSid, !!call.muted)}
                      onHold={() => toggleHold(call.callSid, !!call.onHold)}
                      onTransfer={() => setTransferTarget(transferTarget === call.callSid ? null : call.callSid)}
                      onHangup={() => hangupOne(call.callSid)}
                    />
                  ))}
                  {transferTarget && (
                    <div style={{
                      padding: '8px 12px', background: blue(0.04),
                      borderBottom: `1px solid ${crt(0.06)}`,
                      display: 'flex', gap: 6, alignItems: 'center',
                    }}>
                      <ArrowRightLeft size={12} style={{ color: blue(0.6), flexShrink: 0 }} />
                      <input
                        value={transferNumber}
                        onChange={e => setTransferNumber(e.target.value)}
                        placeholder="Transfer to..."
                        style={{
                          flex: 1, background: crt(0.04), border: `1px solid ${crt(0.12)}`,
                          color: crt(0.9), padding: '5px 8px', fontSize: '0.6rem',
                          borderRadius: 4, outline: 'none',
                        }}
                      />
                      <PhoneBtn size="sm" color={blue} onClick={() => handleTransfer(transferTarget)}>GO</PhoneBtn>
                      <PhoneBtn size="sm" color={crt} onClick={() => { setTransferTarget(null); setTransferNumber(''); }}>
                        <X size={10} />
                      </PhoneBtn>
                    </div>
                  )}
                  {endedCalls.length > 0 && (
                    <>
                      <div style={{ padding: '4px 12px', fontSize: '0.38rem', color: crt(0.15), letterSpacing: '0.15em', borderBottom: `1px solid ${crt(0.04)}` }}>
                        RECENT
                      </div>
                      {endedCalls.map(call => (
                        <LiveCallCard
                          key={call.callSid}
                          call={call}
                          boomer={boomerMode}
                          onMute={() => {}} onHold={() => {}} onTransfer={() => {}} onHangup={() => {}}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </PhoneCard>

          <SessionStatusBar
            session={dialingSession}
            onNext={nextInSession}
            onStop={stopSession}
            loading={sessionLoading}
          />
        </div>

        {/* RIGHT PANEL — CONTROLS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* DIALING MODE */}
          <PhoneCard>
            <PhoneCardHeader>
              <Settings size={10} /> DIAL MODE
              <button
                onClick={() => setShowModePanel(!showModePanel)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  color: crt(0.3), cursor: 'pointer', padding: 0,
                }}
              >
                {showModePanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </PhoneCardHeader>
            <div style={{ padding: '8px 12px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {MODES.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setDialMode(m.key)}
                    style={{
                      flex: 1, padding: '6px 4px', borderRadius: 4,
                      background: dialMode === m.key ? m.color(0.12) : 'transparent',
                      border: `1px solid ${dialMode === m.key ? m.color(0.35) : crt(0.08)}`,
                      color: dialMode === m.key ? m.color(0.9) : crt(0.3),
                      cursor: 'pointer', fontSize: '0.42rem', letterSpacing: '0.08em',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      transition: 'all 0.15s',
                    }}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
              {showModePanel && (
                <div style={{ marginTop: 8, fontSize: '0.42rem', color: crt(0.3), lineHeight: 1.6 }}>
                  {MODES.find(m => m.key === dialMode)?.desc}
                </div>
              )}
            </div>
          </PhoneCard>

          {/* QUEUE BUILDER */}
          <PhoneCard>
            <PhoneCardHeader>
              <Radio size={10} /> SESSION QUEUE
              <span style={{ marginLeft: 'auto', fontSize: '0.4rem', color: queueContacts.length > 0 ? blue(0.6) : crt(0.2) }}>
                {queueContacts.length} QUEUED
              </span>
            </PhoneCardHeader>
            <div style={{ padding: '8px 12px' }}>
              <button
                onClick={() => setShowQueue(!showQueue)}
                style={{
                  width: '100%', padding: '6px 0', borderRadius: 4,
                  background: crt(0.04), border: `1px solid ${crt(0.1)}`,
                  color: crt(0.4), fontSize: '0.42rem', cursor: 'pointer',
                  letterSpacing: '0.1em', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 4,
                }}
              >
                <Plus size={10} /> ADD TO QUEUE
              </button>
              {showQueue && (
                <div style={{ marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {contacts.map(c => {
                    const inQueue = queueContacts.some(q => q.id === c.id);
                    return (
                      <div key={c.id} onClick={() => toggleContactInQueue(c)} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', borderRadius: 3, cursor: 'pointer',
                        background: inQueue ? blue(0.08) : 'transparent',
                        borderBottom: `1px solid ${crt(0.04)}`,
                      }}>
                        <div style={{
                          width: 12, height: 12, borderRadius: 3,
                          border: `1px solid ${inQueue ? blue(0.5) : crt(0.15)}`,
                          background: inQueue ? blue(0.3) : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.4rem', color: blue(0.9),
                        }}>
                          {inQueue && '✓'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.45rem', color: crt(0.7) }}>{c.name}</div>
                          <div style={{ fontSize: '0.35rem', color: crt(0.25) }}>{formatPhone(c.phone)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {queueContacts.length > 0 && (
                <PhoneBtn
                  onClick={launchSession}
                  disabled={sessionLoading || !!dialingSession}
                  color={blue}
                  glow
                  size="sm"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                >
                  {sessionLoading ? <Loader2 size={10} /> : <Radio size={10} />}
                  LAUNCH {dialMode.toUpperCase()}
                </PhoneBtn>
              )}
            </div>
          </PhoneCard>

          {/* RECORDING / BOT CONTROLS */}
          <PhoneCard>
            <PhoneCardHeader><Bot size={10} /> CALL TOOLS</PhoneCardHeader>
            <div style={{ padding: '8px 12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: 4, background: crt(0.03),
                  border: `1px solid ${crt(0.06)}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Circle size={8} style={{ color: liveCalls.some(c => c.recordingActive) ? red(0.8) : crt(0.2) }} />
                    <span style={{ fontSize: '0.45rem', color: crt(0.5), letterSpacing: '0.08em' }}>RECORDING</span>
                  </div>
                  <span style={{
                    fontSize: '0.4rem',
                    color: liveCalls.some(c => c.recordingActive) ? red(0.7) : crt(0.2),
                    letterSpacing: '0.1em',
                  }}>
                    {liveCalls.some(c => c.recordingActive) ? 'ACTIVE' : liveCalls.length > 0 ? 'AUTO' : 'STANDBY'}
                  </span>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: 4, background: crt(0.03),
                  border: `1px solid ${crt(0.06)}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Volume2 size={8} style={{ color: crt(0.3) }} />
                    <span style={{ fontSize: '0.45rem', color: crt(0.5), letterSpacing: '0.08em' }}>TRANSCRIBE</span>
                  </div>
                  <span style={{ fontSize: '0.4rem', color: crt(0.2), letterSpacing: '0.1em' }}>
                    {liveCalls.length > 0 ? 'LIVE' : 'STANDBY'}
                  </span>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: 4, background: crt(0.03),
                  border: `1px solid ${crt(0.06)}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Bot size={8} style={{ color: crt(0.3) }} />
                    <span style={{ fontSize: '0.45rem', color: crt(0.5), letterSpacing: '0.08em' }}>AI COACH</span>
                  </div>
                  <span style={{ fontSize: '0.4rem', color: crt(0.2), letterSpacing: '0.1em' }}>
                    READY
                  </span>
                </div>
              </div>
            </div>
          </PhoneCard>

          {/* STATS */}
          <PhoneCard>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
              background: crt(0.04),
            }}>
              {[
                { label: 'LIVE', value: liveCalls.length, color: liveCalls.length > 0 ? crt : undefined },
                { label: 'TODAY', value: activeCalls.length, color: undefined },
                { label: 'QUEUE', value: queueContacts.length, color: queueContacts.length > 0 ? blue : undefined },
                { label: 'MODE', value: dialMode.toUpperCase().slice(0, 4), color: undefined },
              ].map((s, i) => (
                <div key={i} style={{
                  padding: '8px', textAlign: 'center',
                  background: 'rgba(0,12,0,0.7)',
                }}>
                  <div style={{
                    fontSize: '1rem', color: (s.color || crt)(0.7),
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  }}>
                    {s.value}
                  </div>
                  <div style={{
                    fontSize: '0.35rem', color: crt(0.25),
                    letterSpacing: '0.15em', marginTop: 3,
                  }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .cmd-grid { grid-template-columns: 280px 1fr 240px; }
        @media (max-width: 900px) { .cmd-grid { grid-template-columns: 1fr; } }
        @media (min-width: 901px) and (max-width: 1100px) { .cmd-grid { grid-template-columns: 240px 1fr; } }
      `}</style>
    </div>
  );
}
