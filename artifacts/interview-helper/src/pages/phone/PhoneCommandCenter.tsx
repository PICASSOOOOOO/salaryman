import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import {
  Phone, PhoneOff, Mic, MicOff, PauseCircle, PlayCircle,
  X, Loader2, Hash, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useActiveCallContext } from '@/contexts/ActiveCallContext';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';
import {
  slate, destructive, warning, formatPhone, formatDuration, ENDED_STATUSES,
  type ActiveCall, type CRMContact } from '@/lib/phone-utils';

function validatePhoneNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits[0] === '1') return true;
  if (raw.startsWith('+') && digits.length >= 7 && digits.length <= 15) return true;
  return false;
}

function DialPad({ onKey }: { onKey: (k: string) => void }) {
  const isMobile = useIsMobile();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 6, maxWidth: 240, margin: '0 auto' }}>
      {keys.map(k => (
        <button key={k} onClick={() => onKey(k)} style={{
          background: slate(0.05), border: `1px solid ${slate(0.12)}`, borderRadius: 8,
          color: slate(0.85), fontSize: '1.1rem', padding: '12px 0', cursor: 'pointer',
          transition: 'all 0.1s' }}>
          {k}
        </button>
      ))}
    </div>
  );
}

function ActiveCallCard({
  call, onMute, onHold, onHangup, boomer }: {
  call: ActiveCall;
  onMute: () => void;
  onHold: () => void;
  onHangup: () => void;
  boomer: boolean;
}) {
  const isLive = call.status === 'in-progress';
  const isRinging = call.status === 'ringing' || call.status === 'queued' || call.status === 'initiated';

  return (
    <div style={{
      padding: 16,
      background: isLive ? slate(0.04) : slate(0.02),
      border: `1px solid ${isLive ? slate(0.2) : slate(0.1)}`,
      borderRadius: 10,
      marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.95rem', color: slate(0.9), fontWeight: 600 }}>
            {call.name || formatPhone(call.phone)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: '0.8rem', color: slate(0.55) }}>{formatPhone(call.phone)}</span>
            <span style={{
              fontSize: '0.7rem',
              color: isLive ? slate(0.7) : isRinging ? warning(0.8) : slate(0.4),
              textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {call.status}
            </span>
            {call.muted && <span style={{ fontSize: '0.7rem', color: destructive(0.8), fontWeight: 600 }}>MUTED</span>}
            {call.onHold && <span style={{ fontSize: '0.7rem', color: warning(0.8), fontWeight: 600 }}>HOLD</span>}
          </div>
        </div>
        <div style={{
          fontSize: '1.1rem', color: slate(0.6),
          fontVariantNumeric: 'tabular-nums',
          ...(boomer ? {} : { fontFamily: "var(--font-sans)" }) }}>
          {formatDuration(call.elapsed)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onMute} style={{
          flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
          background: call.muted ? destructive(0.15) : slate(0.06),
          border: `1px solid ${call.muted ? destructive(0.35) : slate(0.15)}`,
          color: call.muted ? destructive(0.9) : slate(0.7),
          fontSize: '0.75rem', letterSpacing: '0.05em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {call.muted ? <MicOff size={16} /> : <Mic size={16} />}
          {call.muted ? 'UNMUTE' : 'MUTE'}
        </button>

        <button onClick={onHold} style={{
          flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
          background: call.onHold ? warning(0.15) : slate(0.06),
          border: `1px solid ${call.onHold ? warning(0.35) : slate(0.15)}`,
          color: call.onHold ? warning(0.9) : slate(0.7),
          fontSize: '0.75rem', letterSpacing: '0.05em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {call.onHold ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
          {call.onHold ? 'RESUME' : 'HOLD'}
        </button>

        <button onClick={onHangup} style={{
          flex: 1.5, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
          background: destructive(0.2),
          border: `1px solid ${destructive(0.45)}`,
          color: '#fff',
          fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <PhoneOff size={18} />
          END CALL
        </button>
      </div>
    </div>
  );
}

export default function PhoneCommandCenter() {
  const isMobile = useIsMobile();

  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const userId = user?.id ?? '';
  const callerName = user?.firstName ?? user?.email?.split('@')[0];

  const { deviceState, deviceError, ensureDeviceReady, reconnect } = useTwilioDeviceContext();
  const { activeCalls, setActiveCalls, toggleMute, toggleHold, hangupOne, hangupAll } = useActiveCallContext();

  const [manualNumber, setManualNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [showDialPad, setShowDialPad] = useState(false);
  const [callStarting, setCallStarting] = useState(false);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  useEffect(() => {
    void ensureDeviceReady().catch(() => {
      // The provider owns the visible error state and exponential retry loop.
    });
  }, [ensureDeviceReady]);

  const liveCalls = useMemo(() => activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)), [activeCalls]);

  useEffect(() => {
    apiFetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`), { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.contacts) setContacts(d.contacts.slice(0, 20)); })
      .catch(() => {});
  }, [userId, apiUrl]);

  const readFetchError = useCallback(async (r: Response): Promise<string | null> => {
    if (r.ok) return null;
    if (r.status === 403) rawNavigate('/pledge?view=prime');
    const d = await r.json().catch(() => ({}));
    return d.error || `Request failed (${r.status})`;
  }, [rawNavigate]);

  const callSingle = async (phone: string, name?: string, contactId?: number) => {
    if (!validatePhoneNumber(phone)) { setError('Invalid phone number'); return; }
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
        const requestError = await readFetchError(r);
        if (requestError) throw new Error(requestError);
        return r.json();
      }, created => [{ callSid: created.callSid, conferenceName: created.conferenceName }]);
      if (d.callSid) {
        const newCall: ActiveCall = {
          callSid: d.callSid, phone, name: name ?? phone, status: 'queued',
          startTime: Date.now(), elapsed: 0, direction: 'outbound', conferenceName: d.conferenceName };
        setActiveCalls(prev => [...prev.filter(c => c.callSid !== d.callSid), newCall]);
      }
      setManualNumber('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
    setCallStarting(false);
  };

  const hasLiveCalls = liveCalls.length > 0;

  return (
    <div style={{ padding: '16px 0', maxWidth: 520, margin: '0 auto' }}>

      {/* STATUS BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={18} style={{ color: slate(0.6) }} />
          <span style={{ fontSize: '0.9rem', letterSpacing: '0.15em', color: slate(0.7) }}>DIALER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            title={deviceError ?? (deviceState === 'ready' ? 'Phone is ready' : deviceState === 'initializing' ? 'Connecting…' : 'Phone is not connected')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 6, border: `1px solid ${slate(0.1)}`,
              fontSize: '0.75rem', color: slate(0.55), letterSpacing: '0.08em' }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: deviceState === 'ready' ? slate(0.7) : deviceState === 'error' ? destructive(0.7) : warning(0.5) }} />
            {deviceState === 'ready' ? 'READY' : deviceState === 'initializing' ? 'CONNECTING' : deviceState === 'error' ? 'ERROR' : 'OFFLINE'}
          </div>
          {(deviceState === 'error' || deviceState === 'uninitialized' || deviceState === 'initializing') && (
            <button
              onClick={() => { void reconnect(); }}
              disabled={deviceState === 'initializing'}
              title={deviceState === 'initializing' ? 'Reconnecting…' : 'Retry phone connection'}
              style={{
                padding: '4px 10px', borderRadius: 6,
                cursor: deviceState === 'initializing' ? 'wait' : 'pointer',
                opacity: deviceState === 'initializing' ? 0.55 : 1,
                background: warning(0.12), border: `1px solid ${warning(0.35)}`,
                color: warning(0.95), fontSize: '0.7rem', letterSpacing: '0.08em' }}
            >{deviceState === 'initializing' ? 'CONNECTING…' : 'RECONNECT'}</button>
          )}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: destructive(0.08), border: `1px solid ${destructive(0.25)}`, borderRadius: 8,
          fontSize: '0.8rem', color: destructive(0.85), display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: destructive(0.5), cursor: 'pointer', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ACTIVE CALLS — shown above dialer when calls are live */}
      {hasLiveCalls && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8, padding: '0 4px' }}>
            <span style={{ fontSize: '0.8rem', color: slate(0.5), letterSpacing: '0.12em' }}>
              {liveCalls.length} ACTIVE {liveCalls.length === 1 ? 'CALL' : 'CALLS'}
            </span>
            {liveCalls.length > 1 && (
              <button onClick={() => hangupAll()} style={{
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                background: destructive(0.15), border: `1px solid ${destructive(0.35)}`,
                color: destructive(0.9), fontSize: '0.75rem', fontWeight: 600,
                letterSpacing: '0.06em',
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <PhoneOff size={14} /> END ALL
              </button>
            )}
          </div>
          {liveCalls.map(call => (
            <ActiveCallCard
              key={call.callSid}
              call={call}
              boomer={boomerMode}
              onMute={() => toggleMute(call.callSid, !!call.muted)}
              onHold={() => toggleHold(call.callSid, !!call.onHold)}
              onHangup={() => hangupOne(call.callSid)}
            />
          ))}
        </div>
      )}

      {/* DIALER */}
      <div style={{
        background: slate(0.03), border: `1px solid ${slate(0.1)}`,
        borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            value={manualNumber}
            onChange={e => setManualNumber(e.target.value)}
            placeholder="Enter phone number..."
            onKeyDown={e => { if (e.key === 'Enter' && manualNumber) callSingle(manualNumber); }}
            style={{
              flex: 1, background: slate(0.04), border: `1px solid ${slate(0.15)}`,
              color: slate(0.9), padding: '12px 14px', fontSize: '1rem',
              borderRadius: 8, outline: 'none',
              ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}
          />
          <button
            onClick={() => callSingle(manualNumber)}
            disabled={!manualNumber || loading}
            style={{
              width: 52, borderRadius: 8, cursor: !manualNumber || loading ? 'not-allowed' : 'pointer',
              background: !manualNumber || loading ? slate(0.04) : slate(0.15),
              border: `1px solid ${!manualNumber || loading ? slate(0.1) : slate(0.35)}`,
              color: !manualNumber || loading ? slate(0.2) : slate(0.9),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s' }}
          >
            {loading && callStarting ? <Loader2 size={20} className="spin" /> : <Phone size={20} />}
          </button>
        </div>

        <button
          onClick={() => setShowDialPad(!showDialPad)}
          style={{
            width: '100%', background: 'none', border: `1px solid ${slate(0.08)}`,
            color: slate(0.55), fontSize: '0.75rem', padding: '8px 0',
            cursor: 'pointer', borderRadius: 6, letterSpacing: '0.1em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Hash size={14} /> KEYPAD {showDialPad ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showDialPad && (
          <div style={{ marginTop: 12 }}>
            <DialPad onKey={k => setManualNumber(prev => prev + k)} />
          </div>
        )}
      </div>

      {/* SPEED DIAL */}
      {contacts.length > 0 && (
        <div style={{
          background: slate(0.02), border: `1px solid ${slate(0.08)}`,
          borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 16px', fontSize: '0.75rem', color: slate(0.55),
            letterSpacing: '0.15em', borderBottom: `1px solid ${slate(0.06)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>SPEED DIAL</span>
            <span style={{ color: slate(0.55) }}>{contacts.length}</span>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {contacts.slice(0, 15).map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderBottom: `1px solid ${slate(0.04)}`,
                cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => callSingle(c.phone, c.name, c.id)}
                onMouseEnter={e => (e.currentTarget.style.background = slate(0.04))}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', color: slate(0.8) }}>{c.name}</div>
                  <div style={{ fontSize: '0.75rem', color: slate(0.55), marginTop: 2 }}>{formatPhone(c.phone)}</div>
                </div>
                <Phone size={16} style={{ color: slate(0.55), flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
