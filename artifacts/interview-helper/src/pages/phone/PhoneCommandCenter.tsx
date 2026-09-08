import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import {
  Phone, PhoneOff, Mic, MicOff, PauseCircle, PlayCircle,
  X, Loader2, AlertCircle, Delete, Users, Radio
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useActiveCallContext } from '@/contexts/ActiveCallContext';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';
import {
  slate, destructive, warning, formatPhone, formatDuration, ENDED_STATUSES,
  type ActiveCall, type CRMContact 
} from '@/lib/phone-utils';
import { useCalllHomeNav } from './CalllHomeContext';

function validatePhoneNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits[0] === '1') return true;
  if (raw.startsWith('+') && digits.length >= 7 && digits.length <= 15) return true;
  return false;
}

const KEYS = [
  { k: '1', sub: '' }, { k: '2', sub: 'ABC' }, { k: '3', sub: 'DEF' },
  { k: '4', sub: 'GHI' }, { k: '5', sub: 'JKL' }, { k: '6', sub: 'MNO' },
  { k: '7', sub: 'PQRS'}, { k: '8', sub: 'TUV' }, { k: '9', sub: 'WXYZ'},
  { k: '*', sub: '' }, { k: '0', sub: '+' }, { k: '#', sub: '' }
];

function DialPad({ onKey, boomer }: { onKey: (k: string) => void, boomer: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '0 auto', width: '100%', maxWidth: 320 }}>
      {KEYS.map(({ k, sub }) => (
        <button key={k} className="keypad-btn" onClick={() => onKey(k)} style={boomer ? {} : { fontFamily: "var(--font-sans)" }}>
          <div className="digit">{k}</div>
          <div className="letters">{sub}</div>
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
      padding: '20px 24px',
      background: isLive ? slate(0.04) : slate(0.02),
      border: `1px solid ${isLive ? slate(0.3) : slate(0.1)}`,
      borderRadius: 20,
      marginBottom: 16,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {isLive && (
         <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '60%', height: 1, background: `linear-gradient(90deg, transparent, ${slate(0.5)}, transparent)`, boxShadow: `0 0 20px 2px ${slate(0.2)}` }} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: '1.25rem', color: slate(0.95), fontWeight: 300, letterSpacing: '0.02em', marginBottom: 6 }}>
            {call.name || formatPhone(call.phone)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.85rem', color: slate(0.5) }}>{formatPhone(call.phone)}</span>
            <span style={{ color: slate(0.3) }}>•</span>
            <span style={{
              fontSize: '0.7rem',
              color: isLive ? slate(0.8) : isRinging ? warning(0.9) : slate(0.5),
              textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
              {call.status}
            </span>
            {call.muted && <span style={{ fontSize: '0.7rem', color: destructive(0.9), fontWeight: 600, letterSpacing: '0.1em' }}>MUTED</span>}
            {call.onHold && <span style={{ fontSize: '0.7rem', color: warning(0.9), fontWeight: 600, letterSpacing: '0.1em' }}>HOLD</span>}
          </div>
        </div>
        <div style={{
          fontSize: '1.5rem', color: isLive ? slate(0.9) : slate(0.5),
          fontWeight: 200,
          fontVariantNumeric: 'tabular-nums',
          ...(boomer ? {} : { fontFamily: "var(--font-sans)" }) }}>
          {formatDuration(call.elapsed)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onMute} className={`ctrl-btn ${call.muted ? 'active-destructive' : ''}`}>
          {call.muted ? <MicOff size={18} /> : <Mic size={18} />}
          <span>{call.muted ? 'UNMUTE' : 'MUTE'}</span>
        </button>

        <button onClick={onHold} className={`ctrl-btn ${call.onHold ? 'active-warning' : ''}`}>
          {call.onHold ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
          <span>{call.onHold ? 'RESUME' : 'HOLD'}</span>
        </button>

        <button onClick={onHangup} className="end-btn">
          <PhoneOff size={18} />
          <span>END CALL</span>
        </button>
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

  const { deviceState, deviceError, ensureDeviceReady, reconnect } = useTwilioDeviceContext();
  const { activeCalls, setActiveCalls, toggleMute, toggleHold, hangupOne, hangupAll } = useActiveCallContext();

  const [manualNumber, setManualNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [callStarting, setCallStarting] = useState(false);

  const switchTab = useCalllHomeNav();

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  useEffect(() => {
    void ensureDeviceReady().catch(() => {});
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

  const match = useMemo(() => {
    const digits = manualNumber.replace(/\D/g, '');
    if (digits.length < 7) return null;
    return contacts.find(c => c.phone.replace(/\D/g, '').endsWith(digits)) || null;
  }, [manualNumber, contacts]);

  return (
    <div className="dialer-container" style={{ padding: '16px 0 40px', maxWidth: 460, margin: '0 auto' }}>
      
      {/* STATUS & TOP NAV */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 32, padding: '0 8px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: deviceState === 'ready' ? slate(0.7) : deviceState === 'error' ? destructive(0.7) : warning(0.5),
            boxShadow: `0 0 12px ${deviceState === 'ready' ? slate(0.5) : deviceState === 'error' ? destructive(0.5) : warning(0.4)}`
          }} />
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: slate(0.6), textTransform: 'uppercase', fontWeight: 600 }} title={deviceError || undefined}>
             {deviceState === 'ready' ? 'CALLING READY' : deviceState === 'initializing' ? 'CONNECTING' : deviceState === 'error' ? 'CALLING ERROR' : 'STARTING'}
          </span>
          {(deviceState === 'error' || deviceState === 'uninitialized' || deviceState === 'initializing') && (
            <button
              onClick={() => { void reconnect(); }}
              disabled={deviceState === 'initializing'}
              className="status-btn"
              style={{ marginLeft: 8 }}
            >{deviceState === 'initializing' ? '...' : 'RETRY'}</button>
          )}
        </div>

        {switchTab && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="nav-pill" onClick={() => switchTab('contacts')} title="Open CRM">
              <Users size={12} /> <span style={{ paddingRight: 4 }}>CRM</span>
            </button>
            <button className="nav-pill" onClick={() => switchTab('dial')} title="Open Autodialer">
              <Radio size={12} /> <span style={{ paddingRight: 4 }}>AUTODIALER</span>
            </button>
          </div>
        )}
      </div>

      {deviceState === 'error' && deviceError && (
        <div style={{
          margin: '-16px 8px 24px',
          padding: '10px 12px',
          border: `1px solid ${destructive(0.28)}`,
          borderRadius: 8,
          background: destructive(0.06),
          color: destructive(0.82),
          fontSize: '0.68rem',
          lineHeight: 1.5,
        }}>
          Browser calling could not connect. Check microphone permission and tap Retry.
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: 24,
          background: destructive(0.08), border: `1px solid ${destructive(0.25)}`, borderRadius: 12,
          fontSize: '0.75rem', color: destructive(0.85), display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: destructive(0.5), cursor: 'pointer', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ACTIVE CALLS */}
      {hasLiveCalls && (
        <div style={{ marginBottom: 32 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12, padding: '0 8px' }}>
            <span style={{ fontSize: '0.7rem', color: slate(0.5), letterSpacing: '0.15em', fontWeight: 500 }}>
              {liveCalls.length} ACTIVE {liveCalls.length === 1 ? 'CALL' : 'CALLS'}
            </span>
            {liveCalls.length > 1 && (
              <button onClick={() => hangupAll()} style={{
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                background: destructive(0.1), border: `1px solid ${destructive(0.25)}`,
                color: destructive(0.9), fontSize: '0.65rem', fontWeight: 600,
                letterSpacing: '0.1em',
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

      {/* PHONE NUMBER DISPLAY */}
      <div className="number-container">
        <input
          className="number-input"
          value={manualNumber}
          onChange={e => setManualNumber(e.target.value)}
          placeholder="ENTER NUMBER"
          onKeyDown={e => { if (e.key === 'Enter' && manualNumber) callSingle(manualNumber); }}
          style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
        />
        <div style={{ height: 20, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {match ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: slate(0.7), fontSize: '0.75rem', letterSpacing: '0.1em', fontWeight: 500 }}>
              <Users size={14} /> {match.name.toUpperCase()}
            </div>
          ) : manualNumber.length > 0 ? (
            <div style={{ color: slate(0.3), fontSize: '0.7rem', letterSpacing: '0.15em' }}>UNKNOWN NUMBER</div>
          ) : null}
        </div>
      </div>

      {/* QUICK CONTACTS RAIL */}
      {contacts.length > 0 && !hasLiveCalls && !manualNumber && (
        <div className="contacts-rail">
          {contacts.slice(0, 10).map(c => {
            const initials = c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '?';
            const firstName = c.name.split(' ')[0];
            return (
              <div key={c.id} className="contact-pill" onClick={() => callSingle(c.phone, c.name, c.id)}>
                <div className="initials">{initials}</div>
                <div className="name">{firstName}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* KEYPAD */}
      <DialPad onKey={k => setManualNumber(prev => prev + k)} boomer={boomerMode} />

      {/* BOTTOM ACTION ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: 16, margin: '24px auto 0', width: '100%', maxWidth: 320 }}>
        
        <button className="action-btn" onClick={() => switchTab?.('contacts')} title="Open CRM">
           <Users size={22} />
           <span>CRM</span>
        </button>
        
        <button 
          className="call-btn" 
          onClick={() => callSingle(manualNumber)} 
          disabled={!manualNumber || loading}
        >
          {loading && callStarting ? <Loader2 size={26} className="spin" /> : <Phone size={26} />}
        </button>
        
        <button 
          className="action-btn" 
          onClick={() => setManualNumber(prev => prev.slice(0, -1))}
          style={{ visibility: manualNumber ? 'visible' : 'hidden' }}
        >
          <Delete size={22} />
          <span>CLEAR</span>
        </button>

      </div>

      <style>{`
        .dialer-container {
          --c-bg: ${slate(0.02)};
          --c-border: ${slate(0.1)};
          --c-border-hover: ${slate(0.2)};
          --c-text: ${slate(0.9)};
          --c-text-muted: ${slate(0.4)};
        }
        .status-btn {
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          background: ${warning(0.1)};
          border: 1px solid ${warning(0.3)};
          color: ${warning(0.9)};
          font-size: 0.6rem;
          letter-spacing: 0.1em;
          transition: all 0.2s;
        }
        .status-btn:hover:not(:disabled) {
          background: ${warning(0.15)};
          border-color: ${warning(0.4)};
        }
        .nav-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: ${slate(0.03)};
          border: 1px solid ${slate(0.15)};
          border-radius: 24px;
          color: ${slate(0.65)};
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .nav-pill:hover {
          background: ${slate(0.08)};
          border-color: ${slate(0.25)};
          color: ${slate(0.9)};
        }
        .number-container {
          height: 100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
        }
        .number-input {
          width: 100%;
          background: transparent;
          border: none;
          text-align: center;
          font-size: 2.75rem;
          letter-spacing: 0.08em;
          color: var(--c-text);
          outline: none;
          font-weight: 200;
        }
        .number-input::placeholder {
          color: ${slate(0.12)};
          font-weight: 200;
        }
        .contacts-rail {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 16px;
          margin-bottom: 8px;
          scrollbar-width: none;
        }
        .contacts-rail::-webkit-scrollbar { display: none; }
        .contact-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px 6px 6px;
          background: ${slate(0.03)};
          border: 1px solid ${slate(0.12)};
          border-radius: 24px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .contact-pill:hover {
          background: ${slate(0.08)};
          border-color: ${slate(0.25)};
          transform: translateY(-1px);
        }
        .contact-pill .name {
          font-size: 0.75rem;
          color: ${slate(0.8)};
          font-weight: 500;
        }
        .contact-pill .initials {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${slate(0.15)};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.55rem;
          color: ${slate(0.9)};
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .keypad-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 76px;
          background: var(--c-bg);
          border: 1px solid var(--c-border);
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          color: var(--c-text);
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .keypad-btn:hover {
          background: ${slate(0.06)};
          border-color: var(--c-border-hover);
        }
        .keypad-btn:active {
          background: ${slate(0.12)};
          transform: scale(0.95);
        }
        .keypad-btn .digit {
          font-size: 1.85rem;
          font-weight: 300;
          line-height: 1;
        }
        .keypad-btn .letters {
          font-size: 0.55rem;
          letter-spacing: 0.2em;
          color: var(--c-text-muted);
          margin-top: 6px;
          height: 10px;
        }
        .call-btn {
          background: ${slate(0.15)};
          border: 1px solid ${slate(0.3)};
          color: ${slate(0.95)};
          display: flex;
          align-items: center;
          justify-content: center;
          height: 76px;
          border-radius: 24px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .call-btn:hover:not(:disabled) {
          background: ${slate(0.25)};
          border-color: ${slate(0.4)};
          transform: translateY(-2px);
          box-shadow: 0 8px 24px ${slate(0.1)};
        }
        .call-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.95);
        }
        .call-btn:disabled {
          background: ${slate(0.04)};
          border-color: ${slate(0.1)};
          color: ${slate(0.2)};
          cursor: not-allowed;
        }
        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 76px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: ${slate(0.5)};
          transition: all 0.2s ease;
          gap: 8px;
        }
        .action-btn:hover {
          color: ${slate(0.9)};
        }
        .action-btn:active {
          transform: scale(0.92);
        }
        .action-btn span {
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          font-weight: 600;
        }
        
        /* Active Call Cards */
        .ctrl-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 70px;
          border-radius: 16px;
          background: ${slate(0.04)};
          border: 1px solid ${slate(0.12)};
          color: ${slate(0.7)};
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .ctrl-btn:hover {
          background: ${slate(0.08)};
          border-color: ${slate(0.25)};
          color: ${slate(0.95)};
        }
        .ctrl-btn span {
          font-size: 0.65rem;
          letter-spacing: 0.12em;
          font-weight: 600;
        }
        .ctrl-btn.active-destructive {
          background: ${destructive(0.1)};
          border-color: ${destructive(0.3)};
          color: ${destructive(0.9)};
        }
        .ctrl-btn.active-warning {
          background: ${warning(0.1)};
          border-color: ${warning(0.3)};
          color: ${warning(0.9)};
        }
        .end-btn {
          flex: 1.5;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 70px;
          border-radius: 16px;
          background: ${destructive(0.15)};
          border: 1px solid ${destructive(0.3)};
          color: ${destructive(0.95)};
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .end-btn:hover {
          background: ${destructive(0.25)};
          border-color: ${destructive(0.45)};
        }
        .end-btn span {
          font-size: 0.65rem;
          letter-spacing: 0.12em;
          font-weight: 700;
        }
        
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
