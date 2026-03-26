import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, X, Loader2, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform } from './PhoneLayout';
import {
  crt, red, amber, blue, purple, formatPhone, formatDuration,
  addActiveCall,
  type CRMContact, type CallRecord,
} from '@/lib/phone-utils';
import { useCalllHomeNavigate } from './CalllHomeContext';

const DIAL_LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO',
  '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+',
};

export default function PhoneDialerPage() {
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };
  const userId = user?.id ?? '';
  const callerName = user?.firstName ?? user?.email?.split('@')[0];

  const [manualNumber, setManualNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentContacts, setRecentContacts] = useState<CRMContact[]>([]);
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [speedDials, setSpeedDials] = useState<CRMContact[]>([]);
  const [dtmfTone, setDtmfTone] = useState<string | null>(null);
  const [callStarting, setCallStarting] = useState(false);
  const audioCtx = useRef<AudioContext | null>(null);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const handleFetchError = useCallback(async (r: Response) => {
    if (r.status === 403) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Access denied — phone system subscription required.');
      navigate('/features');
      return true;
    }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || `Request failed (${r.status})`);
      return true;
    }
    return false;
  }, [navigate]);

  useEffect(() => {
    fetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`))
      .then(r => {
        if (r.status === 403) { rawNavigate('/upgrade'); return null; }
        return r.ok ? r.json() : null;
      })
      .then(d => {
        if (d?.contacts) {
          setRecentContacts(d.contacts.slice(0, 8));
          setSpeedDials(d.contacts.slice(0, 4));
        }
      })
      .catch(() => setError('Network error loading contacts'));

    fetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}`))
      .then(r => {
        if (r.status === 403) { rawNavigate('/upgrade'); return null; }
        return r.ok ? r.json() : null;
      })
      .then(d => { if (d?.calls) setRecentCalls(d.calls.slice(0, 6)); })
      .catch(() => { setError('Failed to load recent calls'); });
  }, [userId, apiUrl, rawNavigate]);

  const playDTMF = (key: string) => {
    setDtmfTone(key);
    setTimeout(() => setDtmfTone(null), 150);
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const freqs: Record<string, [number, number]> = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
      };
      const [f1, f2] = freqs[key] || [440, 480];
      const osc1 = ctx.createOscillator(); const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.frequency.value = f1; osc2.frequency.value = f2;
      gain.gain.value = 0.05;
      osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
      osc1.start(); osc2.start();
      setTimeout(() => { osc1.stop(); osc2.stop(); }, 100);
    } catch { /* WebAudio not available — DTMF tone silently skipped */ }
  };

  const pressKey = (key: string) => {
    setManualNumber(prev => prev + key);
    playDTMF(key);
  };

  const callSingle = async (phone: string, name?: string, contactId?: number) => {
    setError('');
    setLoading(true);
    setCallStarting(true);
    try {
      const r = await fetch(apiUrl('twilio/call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientNumber: phone, userId, callerName, contactName: name, contactId }),
      });
      if (await handleFetchError(r)) { setLoading(false); setCallStarting(false); return; }
      const d = await r.json();
      if (d.callSid) {
        addActiveCall({ callSid: d.callSid, phone, name: name ?? phone, status: 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound' });
      }
      setTimeout(() => navigate('/phone/active'), 600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error — check your connection and try again');
      setCallStarting(false);
    }
    setLoading(false);
  };

  const dialKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  const formattedDisplay = manualNumber ? formatPhone(manualNumber) : '';

  return (
    <PhonePageLayout
      title="DIALER"
      subtitle="Direct dial interface with DTMF tone generation"
      icon={<Phone size={24} style={{ color: crt(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MiniWaveform active={!!dtmfTone} bars={4} />
          <span style={{ color: crt(0.25) }}>DTMF {dtmfTone ? `[${dtmfTone}]` : 'IDLE'}</span>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'linear-gradient(90deg, rgba(255,40,40,0.08), rgba(255,40,40,0.03))', border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: red(0.8), animation: 'pulse 1s infinite' }} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard glow={callStarting}>
            <PhoneCardHeader accent={callStarting ? amber(0.8) : undefined}>
              {callStarting ? 'CONNECTING...' : 'DIAL PAD'}
            </PhoneCardHeader>
            <div style={{ padding: '20px 24px' }}>
              <div style={{
                background: 'rgba(0,12,0,0.9)', border: `1px solid ${crt(manualNumber ? 0.3 : 0.12)}`,
                padding: '14px 18px', marginBottom: 8, borderRadius: 8,
                transition: 'border-color 0.3s ease',
                boxShadow: manualNumber ? `inset 0 0 20px ${crt(0.03)}` : 'none',
              }}>
                <div style={{ fontSize: '0.4rem', color: crt(0.2), letterSpacing: '0.2em', marginBottom: 4 }}>NUMBER INPUT</div>
                <input
                  value={manualNumber}
                  onChange={e => setManualNumber(e.target.value)}
                  placeholder="Enter phone number..."
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    color: crt(0.95), fontSize: '1.6rem', fontFamily: "'Share Tech Mono', monospace",
                    outline: 'none', letterSpacing: '0.08em',
                    textShadow: manualNumber ? `0 0 10px ${crt(0.2)}` : 'none',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && manualNumber.trim()) callSingle(manualNumber); }}
                />
                {formattedDisplay && formattedDisplay !== manualNumber && (
                  <div style={{ fontSize: '0.55rem', color: crt(0.3), marginTop: 4 }}>{formattedDisplay}</div>
                )}
              </div>

              {manualNumber && (
                <div style={{ textAlign: 'right', marginBottom: 6 }}>
                  <button onClick={() => setManualNumber('')} style={{ background: 'none', border: 'none', color: crt(0.25), cursor: 'pointer', fontSize: '0.45rem', letterSpacing: '0.1em' }}>
                    CLEAR ✕
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                {dialKeys.map(key => (
                  <button
                    key={key}
                    onClick={() => pressKey(key)}
                    style={{
                      height: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      background: dtmfTone === key ? crt(0.15) : 'rgba(56,189,248,0.035)',
                      border: `1px solid ${dtmfTone === key ? crt(0.4) : crt(0.1)}`,
                      color: crt(0.85), cursor: 'pointer', borderRadius: 8,
                      transition: 'all 0.08s',
                      boxShadow: dtmfTone === key ? `0 0 15px ${crt(0.15)}, inset 0 0 10px ${crt(0.05)}` : `inset 0 1px 0 ${crt(0.04)}`,
                    }}
                  >
                    <span style={{ fontSize: '1.5rem', fontFamily: "'Share Tech Mono', monospace", lineHeight: 1 }}>{key}</span>
                    {DIAL_LETTERS[key] && (
                      <span style={{ fontSize: '0.35rem', color: crt(0.25), letterSpacing: '0.15em', marginTop: 2 }}>{DIAL_LETTERS[key]}</span>
                    )}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <PhoneBtn
                  onClick={() => setManualNumber(prev => prev.slice(0, -1))}
                  disabled={!manualNumber}
                  style={{ flex: 1, justifyContent: 'center', height: 48 }}
                >
                  ← DEL
                </PhoneBtn>
                <PhoneBtn
                  onClick={() => { if (manualNumber.trim()) callSingle(manualNumber); }}
                  disabled={!manualNumber.trim() || loading}
                  color={manualNumber.trim() ? (o: number) => `rgba(0,220,60,${o})` : crt}
                  glow={!!manualNumber.trim()}
                  style={{ flex: 2, justifyContent: 'center', height: 48 }}
                  size="lg"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
                  {loading ? 'INITIATING CALL...' : 'CALL NOW'}
                </PhoneBtn>
              </div>
            </div>
          </PhoneCard>

          {speedDials.length > 0 && (
            <PhoneCard>
              <PhoneCardHeader accent={amber(0.5)}>SPEED DIAL</PhoneCardHeader>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {speedDials.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => callSingle(c.phone, c.name, c.id)}
                    style={{
                      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                      background: 'rgba(0,12,0,0.6)', border: `1px solid ${crt(0.1)}`,
                      borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 6,
                      background: `linear-gradient(135deg, ${[crt(0.12), blue(0.12), amber(0.12), purple(0.12)][i % 4]} 0%, transparent 100%)`,
                      border: `1px solid ${[crt(0.2), blue(0.2), amber(0.2), purple(0.2)][i % 4]}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', color: [crt(0.7), blue(0.7), amber(0.7), purple(0.7)][i % 4],
                      flexShrink: 0,
                    }}>
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.6rem', color: crt(0.75), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: '0.42rem', color: crt(0.25) }}>{formatPhone(c.phone)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </PhoneCard>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <StatBlock label="CONTACTS" value={recentContacts.length} sub="with phone" />
            <StatBlock label="CALLS TODAY" value={recentCalls.filter(c => new Date(c.startedAt).toDateString() === new Date().toDateString()).length} sub="outbound" color={blue} />
            <StatBlock label="SYSTEM" value="READY" sub="all lines open" color={crt} />
          </div>

          <PhoneCard>
            <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>RECENT CONTACTS</span>
              <button onClick={() => navigate('/phone/contacts')} style={{ background: 'none', border: 'none', color: crt(0.35), cursor: 'pointer', fontSize: '0.42rem', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 4 }}>
                VIEW ALL <ArrowRight size={8} />
              </button>
            </PhoneCardHeader>
            {recentContacts.length === 0 ? (
              <EmptyState message="NO CONTACTS WITH PHONE NUMBERS — ADD CONTACTS IN THE CRM" icon={<Users size={28} />} />
            ) : (
              <div>
                {recentContacts.map(c => (
                  <div key={c.id} style={{
                    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: `1px solid ${crt(0.04)}`,
                    transition: 'background 0.15s',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(56,189,248,0.02))',
                      border: `1px solid ${crt(0.12)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '0.7rem', color: crt(0.55) }}>{c.name[0]?.toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.7rem', color: crt(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: '0.48rem', color: crt(0.3), marginTop: 2 }}>
                        {formatPhone(c.phone)}
                        {c.company && <span style={{ marginLeft: 8, color: crt(0.2) }}>· {c.company}</span>}
                      </div>
                    </div>
                    <PhoneBtn onClick={() => callSingle(c.phone, c.name, c.id)} color={(o: number) => `rgba(0,220,60,${o})`} size="sm">
                      <Phone size={11} /> CALL
                    </PhoneBtn>
                  </div>
                ))}
              </div>
            )}
          </PhoneCard>

          {recentCalls.length > 0 && (
            <PhoneCard>
              <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>RECENT CALLS</span>
                <button onClick={() => navigate('/phone/history')} style={{ background: 'none', border: 'none', color: crt(0.35), cursor: 'pointer', fontSize: '0.42rem', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  FULL LOG <ArrowRight size={8} />
                </button>
              </PhoneCardHeader>
              <div>
                {recentCalls.map(h => (
                  <div key={h.id} style={{ padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${crt(0.04)}` }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: h.status === 'completed' ? crt(0.5) : ['failed', 'busy', 'no-answer'].includes(h.status) ? red(0.6) : amber(0.5),
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.6rem', color: crt(0.65), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {h.callerName || formatPhone(h.recipientNumber)}
                      </div>
                      <div style={{ fontSize: '0.42rem', color: crt(0.25) }}>
                        {h.status} {h.durationSeconds ? `· ${formatDuration(h.durationSeconds)}` : ''} · {new Date(h.startedAt).toLocaleDateString()}
                        {h.direction === 'inbound' && <span style={{ color: blue(0.5), marginLeft: 4 }}>↙</span>}
                      </div>
                    </div>
                    <PhoneBtn onClick={() => callSingle(h.recipientNumber, h.callerName || undefined)} size="sm" style={{ padding: '4px 8px' }}>
                      <Phone size={10} />
                    </PhoneBtn>
                  </div>
                ))}
              </div>
            </PhoneCard>
          )}

          <PhoneCard>
            <PhoneCardHeader accent={amber(0.4)}>KEYBOARD SHORTCUTS</PhoneCardHeader>
            <div style={{ padding: '14px 16px' }}>
              {[
                ['0-9, *, #', 'Dial keys (type directly)'],
                ['Enter', 'Initiate call immediately'],
                ['Backspace', 'Delete last digit'],
                ['Esc', 'Clear number field'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.52rem', color: amber(0.6), letterSpacing: '0.06em',
                    padding: '2px 8px', border: `1px solid ${amber(0.2)}`, borderRadius: 4,
                    background: amber(0.04), minWidth: 80, textAlign: 'center', flexShrink: 0,
                  }}>{k}</span>
                  <span style={{ fontSize: '0.52rem', color: crt(0.3) }}>{v}</span>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>
      </div>
    </PhonePageLayout>
  );
}
