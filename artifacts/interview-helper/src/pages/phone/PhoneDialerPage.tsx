import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Phone, X, Loader2, Users, ArrowRight, Radio, Zap, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform } from './PhoneLayout';
import {
  slate, destructive, warning, primary, accent, formatPhone, formatDuration,
  addActiveCall, addActiveCallsBatch,
  type CRMContact, type CallRecord, type BatchResult, type ActiveCall } from '@/lib/phone-utils';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';

const DIAL_LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO',
  '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+' };

type DialMode = 'power' | 'auto' | 'predictive';

const MODES: { key: DialMode; label: string; desc: string; color: (o: number) => string; icon: React.ReactNode }[] = [
  { key: 'power', label: 'POWER', desc: 'Manual queue — one at a time', color: slate, icon: <Zap size={14} /> },
  { key: 'auto', label: 'AUTO', desc: 'Auto-advance after each call', color: primary, icon: '🔄' },
  { key: 'predictive', label: 'PREDICTIVE', desc: 'Dials 3× simultaneously', color: accent, icon: '🚀' },
];

function validatePhoneNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits[0] === '1') return true;
  if (raw.startsWith('+') && digits.length >= 7 && digits.length <= 15) return true;
  return false;
}

export default function PhoneDialerPage() {
  const isMobile = useIsMobile();

  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };
  const userId = user?.id ?? '';
  const callerName = user?.firstName ?? user?.email?.split('@')[0];
  const { disconnect: disconnectDevice } = useTwilioDeviceContext();

  const [manualNumber, setManualNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentContacts, setRecentContacts] = useState<CRMContact[]>([]);
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [speedDials, setSpeedDials] = useState<CRMContact[]>([]);
  const [dtmfTone, setDtmfTone] = useState<string | null>(null);
  const [callStarting, setCallStarting] = useState(false);
  const [dialingMode, setDialingMode] = useState<DialMode>('power');
  const audioCtx = useRef<AudioContext | null>(null);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  const isValidNumber = useMemo(() => validatePhoneNumber(manualNumber), [manualNumber]);
  const numberHasInput = manualNumber.trim().length > 0;
  const showValidationError = numberHasInput && !isValidNumber;

  const handleFetchError = useCallback(async (r: Response) => {
    if (r.status === 403) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Access denied — phone system subscription required.');
      navigate('/upgrade');
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
    apiFetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`), { credentials: 'include' })
      .then(r => {
        if (r.status === 403) { rawNavigate('/pricing'); return null; }
        return r.ok ? r.json() : null;
      })
      .then(d => {
        if (d?.contacts) {
          setRecentContacts(d.contacts.slice(0, 8));
          setSpeedDials(d.contacts.slice(0, 4));
        }
      })
      .catch(() => setError('Network error loading contacts'));

    apiFetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}`), { credentials: 'include' })
      .then(r => {
        if (r.status === 403) { rawNavigate('/pricing'); return null; }
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
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477] };
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
    if (!validatePhoneNumber(phone)) { setError('Invalid phone number format'); return; }
    setError('');
    setLoading(true);
    setCallStarting(true);
    try {
      const d = await bridgeOutbound(async () => {
        const r = await apiFetch(apiUrl('twilio/call'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ recipientNumber: phone, userId, callerName, contactName: name, contactId }) });
        if (await handleFetchError(r)) throw new Error('Call request failed');
        return r.json();
      }, created => [{ callSid: created.callSid, conferenceName: created.conferenceName }]);
      if (d.callSid) {
        addActiveCall({ callSid: d.callSid, phone, name: name ?? phone, status: 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound', conferenceName: d.conferenceName });
      }
      navigate('/phone/active');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error — check your connection and try again');
      setCallStarting(false);
    }
    setLoading(false);
  };

  const launchDialingSession = async () => {
    const nums = recentContacts.map(c => ({ phone: c.phone, name: c.name }));
    if (nums.length === 0) { navigate('/phone/sessions'); return; }
    setLoading(true);
    setError('');
    try {
      const d = await bridgeOutbound(async () => {
        const r = await apiFetch(apiUrl('twilio/dialing/start'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ mode: dialingMode, numbers: nums, settings: {} }) });
        if (await handleFetchError(r)) throw new Error('Dialing session request failed');
        return r.json();
      }, created => (created.calls ?? []).filter((c: BatchResult) => c.ok && c.callSid).map((c: BatchResult & { conferenceName?: string }) => ({ callSid: c.callSid!, conferenceName: c.conferenceName })));
      const batchCalls = d.calls as (BatchResult & { conferenceName?: string })[];
      const newActiveCalls: ActiveCall[] = batchCalls
        .filter(c => c.ok && c.callSid)
        .map(c => ({ callSid: c.callSid!, phone: c.phone, name: c.name ?? c.phone, status: c.status ?? 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound', conferenceName: c.conferenceName }));
      addActiveCallsBatch(newActiveCalls);
      const session = { id: d.sessionId, mode: d.mode, total: nums.length, dialed: batchCalls.filter((c: BatchResult) => c.ok).length, queue: d.queue ?? nums };
      try { sessionStorage.setItem('phone_dialing_session', JSON.stringify(session)); } catch {}
      navigate('/phone/active');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
  };

  const dialKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  const formattedDisplay = manualNumber ? formatPhone(manualNumber) : '';

  return (
    <PhonePageLayout
      title="DIALER"
      subtitle="Direct dial interface with DTMF tone generation"
      icon={<Phone size={24} style={{ color: slate(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MiniWaveform active={!!dtmfTone} bars={4} />
          <span style={{ color: slate(0.55) }}>DTMF {dtmfTone ? `[${dtmfTone}]` : 'IDLE'}</span>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: slate(0.02), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: destructive(0.8), animation: 'pulse 1s infinite' }} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '400px 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={callStarting ? warning(0.8) : undefined}>
              {callStarting ? 'CONNECTING...' : 'DIAL PAD'}
            </PhoneCardHeader>
            <div style={{ padding: '20px 24px' }}>
              <div style={{
                background: slate(0.9),
                border: `1px solid ${showValidationError ? destructive(0.4) : slate(manualNumber ? 0.3 : 0.12)}`,
                padding: '14px 18px', marginBottom: 8, borderRadius: 8,
                transition: 'border-color 0.3s ease' }}>
                <div style={{ fontSize: '0.4rem', color: showValidationError ? destructive(0.6) : slate(0.2), letterSpacing: '0.2em', marginBottom: 4 }}>NUMBER INPUT</div>
                <input
                  value={manualNumber}
                  onChange={e => setManualNumber(e.target.value)}
                  placeholder="Enter phone number..."
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    color: showValidationError ? destructive(0.8) : slate(0.95), fontSize: '1.6rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
                    outline: 'none', letterSpacing: '0.08em' }}
                  onKeyDown={e => { if (e.key === 'Enter' && isValidNumber) callSingle(manualNumber); }}
                />
                {formattedDisplay && formattedDisplay !== manualNumber && !showValidationError && (
                  <div style={{ fontSize: '0.55rem', color: slate(0.55), marginTop: 4 }}>{formattedDisplay}</div>
                )}
                {showValidationError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <AlertCircle size={10} style={{ color: destructive(0.7), flexShrink: 0 }} />
                    <span style={{ fontSize: '0.48rem', color: destructive(0.7) }}>Invalid format — enter 10-digit US or E.164 number</span>
                  </div>
                )}
              </div>

              {manualNumber && (
                <div style={{ textAlign: 'right', marginBottom: 6 }}>
                  <button onClick={() => setManualNumber('')} style={{ background: 'none', border: 'none', color: slate(0.55), cursor: 'pointer', fontSize: '0.45rem', letterSpacing: '0.1em' }}>
                    CLEAR <X size={10} />
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                {dialKeys.map(key => (
                  <button
                    key={key}
                    onClick={() => pressKey(key)}
                    style={{
                      height: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      background: dtmfTone === key ? slate(0.15) : slate(0.02),
                      border: `1px solid ${dtmfTone === key ? slate(0.4) : slate(0.1)}`,
                      color: slate(0.85), cursor: 'pointer', borderRadius: 8,
                      transition: 'all 0.08s' }}
                  >
                    <span style={{ fontSize: '1.5rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), lineHeight: 1 }}>{key}</span>
                    {DIAL_LETTERS[key] && (
                      <span style={{ fontSize: '0.35rem', color: slate(0.55), letterSpacing: '0.15em', marginTop: 2 }}>{DIAL_LETTERS[key]}</span>
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
                  onClick={() => { if (isValidNumber) callSingle(manualNumber); }}
                  disabled={!isValidNumber || loading}
                  color={isValidNumber ? (o: number) => primary(o) : slate}

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
              <PhoneCardHeader accent={warning(0.5)}>SPEED DIAL</PhoneCardHeader>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {speedDials.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => callSingle(c.phone, c.name, c.id)}
                    style={{
                      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                      background: slate(0.6), border: `1px solid ${slate(0.1)}`,
                      borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                      textAlign: 'left' }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 6,
                      background: slate(0.02),
                      border: `1px solid ${[slate(0.2), primary(0.2), warning(0.2), accent(0.2)][i % 4]}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', color: [slate(0.7), primary(0.7), warning(0.7), accent(0.7)][i % 4],
                      flexShrink: 0 }}>
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.6rem', color: slate(0.75), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: '0.42rem', color: slate(0.55) }}>{formatPhone(c.phone)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </PhoneCard>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
            <StatBlock label="CONTACTS" value={recentContacts.length} sub="with phone" />
            <StatBlock label="CALLS TODAY" value={recentCalls.filter(c => new Date(c.startedAt).toDateString() === new Date().toDateString()).length} sub="outbound" color={primary} />
            <StatBlock label="SYSTEM" value="READY" sub="all lines open" color={slate} />
          </div>

          <PhoneCard>
            <PhoneCardHeader accent={accent(0.6)}>DIALING MODE</PhoneCardHeader>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {MODES.map(m => {
                  const isSel = dialingMode === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setDialingMode(m.key)}
                      style={{
                        flex: 1, padding: '10px 8px', textAlign: 'center', borderRadius: 8, cursor: 'pointer',
                        background: isSel ? slate(0.06) : slate(0.04),
                        border: `1px solid ${isSel ? m.color(0.35) : slate(0.08)}`,
                        transition: 'all 0.15s' }}
                    >
                      <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>{m.icon}</div>
                      <div style={{ fontSize: '0.52rem', color: isSel ? m.color(0.9) : slate(0.5), letterSpacing: '0.08em', marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: '0.38rem', color: isSel ? m.color(0.45) : slate(0.2), lineHeight: 1.4 }}>{m.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <PhoneBtn
                  onClick={launchDialingSession}
                  disabled={recentContacts.length === 0 || loading}
                  color={primary}

                  style={{ flex: 1, justifyContent: 'center', height: 44 }}
                  size="lg"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
                  {loading ? 'STARTING...' : `GO ACTIVE (${recentContacts.length} contacts)`}
                </PhoneBtn>
                <PhoneBtn onClick={() => navigate('/phone/sessions')} style={{ flexShrink: 0 }} title="Full session controls">
                  <ArrowRight size={13} />
                </PhoneBtn>
              </div>
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>RECENT CONTACTS</span>
              <button onClick={() => navigate('/phone/contacts')} style={{ background: 'none', border: 'none', color: slate(0.55), cursor: 'pointer', fontSize: '0.42rem', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                    borderBottom: `1px solid ${slate(0.04)}`,
                    transition: 'background 0.15s' }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: slate(0.02),
                      border: `1px solid ${slate(0.12)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.7rem', color: slate(0.55) }}>{c.name[0]?.toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.7rem', color: slate(0.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 2 }}>
                        {formatPhone(c.phone)}
                        {c.company && <span style={{ marginLeft: 8, color: slate(0.55) }}>· {c.company}</span>}
                      </div>
                    </div>
                    <PhoneBtn onClick={() => callSingle(c.phone, c.name, c.id)} color={primary} size="sm">
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
                <button onClick={() => navigate('/phone/history')} style={{ background: 'none', border: 'none', color: slate(0.55), cursor: 'pointer', fontSize: '0.42rem', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  FULL LOG <ArrowRight size={8} />
                </button>
              </PhoneCardHeader>
              <div>
                {recentCalls.map(h => (
                  <div key={h.id} style={{ padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${slate(0.04)}` }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: h.status === 'completed' ? slate(0.5) : ['failed', 'busy', 'no-answer'].includes(h.status) ? destructive(0.6) : warning(0.5) }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.6rem', color: slate(0.65), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {h.callerName || formatPhone(h.recipientNumber)}
                      </div>
                      <div style={{ fontSize: '0.42rem', color: slate(0.55) }}>
                        {h.status} {h.durationSeconds ? `· ${formatDuration(h.durationSeconds)}` : ''} · {new Date(h.startedAt).toLocaleDateString()}
                        {h.direction === 'inbound' && <span style={{ color: primary(0.5), marginLeft: 4 }}>↙</span>}
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
            <PhoneCardHeader accent={warning(0.4)}>KEYBOARD SHORTCUTS</PhoneCardHeader>
            <div style={{ padding: '14px 16px' }}>
              {[
                ['0-9, *, #', 'Dial keys (type directly)'],
                ['Enter', 'Initiate call (valid numbers only)'],
                ['Backspace', 'Delete last digit'],
                ['Esc', 'Clear number field'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.52rem', color: warning(0.6), letterSpacing: '0.06em',
                    padding: '2px 8px', border: `1px solid ${warning(0.2)}`, borderRadius: 4,
                    background: warning(0.04), minWidth: 80, textAlign: 'center', flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: '0.52rem', color: slate(0.55) }}>{v}</span>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>
      </div>
    </PhonePageLayout>
  );
}
