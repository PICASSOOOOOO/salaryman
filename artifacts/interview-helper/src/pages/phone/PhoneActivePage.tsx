import { useState, useEffect, useCallback, useRef } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Zap, PhoneOff, Mic, MicOff, PauseCircle, PlayCircle, ArrowRightLeft, Phone, X, AlertTriangle, Radio, ChevronRight, FileText, MessageSquare, Clock, Shield, Volume2, Hash, User, Activity } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform, SignalMeter, INPUT_STYLE } from './PhoneLayout';
import { useActiveCallContext } from '@/contexts/ActiveCallContext';
import {
  crt, red, amber, blue, purple, formatPhone, formatDuration, ENDED_STATUSES,
  saveActiveCalls, callStatusToSignalLevel,
  type ActiveCall,
} from '@/lib/phone-utils';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';

const SESSION_KEY = 'phone_dialing_session';

interface DialingSession {
  id: number;
  mode: string;
  total: number;
  dialed: number;
}

function loadSession(): DialingSession | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}

function saveSession(s: DialingSession | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function CallWaveformVisualizer({ active, color: c }: { active: boolean; color: (o: number) => string }) {
  const bars = 24;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 32, padding: '0 8px' }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, flex: 1,
          background: c(active ? 0.5 : 0.08),
          height: active ? `${15 + Math.random() * 85}%` : '10%',
          animation: active ? `waveform ${0.3 + Math.random() * 0.6}s ease-in-out infinite alternate` : 'none',
          animationDelay: `${i * 0.04}s`,
          transition: 'background 0.3s ease',
        }} />
      ))}
    </div>
  );
}

function ElapsedTimer({ seconds, boomer }: { seconds: number; boomer: boolean }) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const display = hrs > 0
    ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return (
    <span style={{
      ...(boomer ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
      fontSize: '1.8rem',
      color: crt(0.9),
      letterSpacing: '0.15em',
      fontVariantNumeric: 'tabular-nums',
      textShadow: `0 0 15px ${crt(0.2)}`,
    }}>
      {display}
    </span>
  );
}

export default function PhoneActivePage() {
  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };
  const userId = user?.id ?? '';
  const { connectToConference } = useTwilioDeviceContext();

  const { activeCalls, setActiveCalls, toggleMute, toggleHold, transferCall: ctxTransfer, hangupOne, hangupAll } = useActiveCallContext();

  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferNumber, setTransferNumber] = useState('');
  const [error, setError] = useState('');
  const [dialingSession, setDialingSession] = useState<DialingSession | null>(() => loadSession());
  const [advancingNext, setAdvancingNext] = useState(false);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const connectedConferenceRef = useRef<string | null>(null);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  useEffect(() => { saveSession(dialingSession); }, [dialingSession]);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}`), { credentials: 'include' });
      if (r.status === 403) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Access denied — phone system subscription required.');
        navigate('/pricing');
        return;
      }
    } catch (e: unknown) {
      console.warn('[CalllHome] history sync error:', e instanceof Error ? e.message : e);
      setError('Could not refresh call history');
    }
  }, [apiUrl, userId, navigate]);

  useEffect(() => {
    const newlyAnswered = activeCalls.find(ac => {
      return ac.status === 'in-progress' && ac.conferenceName && ac.conferenceName !== connectedConferenceRef.current;
    });
    if (newlyAnswered?.conferenceName) {
      const confName = newlyAnswered.conferenceName;
      connectToConference(confName).then(() => {
        connectedConferenceRef.current = confName;
        setError('');
      }).catch(err => {
        console.warn('[CalllHome] auto-reconnect to answered conference failed:', err instanceof Error ? err.message : err);
        setError(err instanceof Error ? err.message : 'Could not reconnect browser audio. Use RECONNECT and try again.');
      });
    }
  }, [activeCalls, connectToConference]);

  useEffect(() => {
    if (!expandedCall) {
      const firstLive = activeCalls.find(c => c.status === 'in-progress');
      if (firstLive) setExpandedCall(firstLive.callSid);
    }
  }, [activeCalls, expandedCall]);

  const advanceSession = async () => {
    if (!dialingSession || advancingNext) return;
    setAdvancingNext(true);
    setError('');
    try {
      const d = await bridgeOutbound(async () => {
        const r = await fetch(apiUrl(`twilio/dialing/${dialingSession.id}/next`), { method: 'POST', credentials: 'include' });
        const body = await r.json();
        if (r.status === 403) { navigate('/pricing'); throw new Error(body.error || 'Access denied'); }
        if (!r.ok) throw new Error(body.error || 'Failed to advance session');
        return body;
      }, created => created.callSid ? [{ callSid: created.callSid, conferenceName: created.conferenceName }] : [], { allowNoLegs: true });
      if (d.completed) {
        setDialingSession(null);
      } else if (d.ok && d.callSid) {
        const newCall: ActiveCall = { callSid: d.callSid, phone: d.phone, name: d.name || '', status: 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound', conferenceName: d.conferenceName };
        setActiveCalls(prev => [...prev, newCall]);
        setDialingSession(prev => prev ? { ...prev, dialed: prev.dialed + 1 } : null);
      } else if (d.skipped) {
        setDialingSession(prev => prev ? { ...prev, dialed: prev.dialed + 1 } : null);
        setError(`Skipped: ${d.error || 'Invalid number'}`);
      } else {
        setError(d.error || 'Failed to advance session');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
    setAdvancingNext(false);
  };

  const stopSession = async () => {
    if (!dialingSession) return;
    try {
      await fetch(apiUrl(`twilio/dialing/${dialingSession.id}/stop`), { method: 'POST', credentials: 'include' });
      setDialingSession(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not stop session');
    }
  };

  const handleMute = async (sid: string, currentMuted: boolean) => {
    const result = await toggleMute(sid, currentMuted);
    if (!result.ok) {
      if (result.status === 403) { navigate('/pricing'); return; }
      setError(result.error || 'Could not mute call');
    }
  };

  const handleHold = async (sid: string, currentHold: boolean) => {
    const result = await toggleHold(sid, currentHold);
    if (!result.ok) {
      if (result.status === 403) { navigate('/pricing'); return; }
      setError(result.error || 'Could not hold call');
    }
  };

  const handleTransfer = async (sid: string) => {
    if (!transferNumber.trim()) return;
    const result = await ctxTransfer(sid, transferNumber);
    if (!result.ok) {
      if (result.status === 403) { navigate('/pricing'); return; }
      setError(result.error || 'Transfer failed');
    } else {
      setTransferTarget(null);
      setTransferNumber('');
    }
  };

  const handleHangup = async (sid: string) => {
    const result = await hangupOne(sid);
    if (!result.ok) {
      if (result.status === 403) { navigate('/pricing'); return; }
      setError(result.error || 'Could not hang up');
    }
  };

  const handleHangupAll = async () => {
    const result = await hangupAll();
    if (!result.ok) {
      if (result.status === 403) { navigate('/pricing'); return; }
      setError(result.error || 'Could not hang up all');
    }
    fetchHistory();
  };

  const liveCount = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).length;
  const onHoldCount = activeCalls.filter(c => c.onHold && !ENDED_STATUSES.includes(c.status)).length;
  const mutedCount = activeCalls.filter(c => c.muted && !ENDED_STATUSES.includes(c.status)).length;
  const completedCount = activeCalls.filter(c => c.status === 'completed').length;
  const ringingCount = activeCalls.filter(c => c.status === 'ringing').length;
  const totalElapsed = activeCalls.reduce((a, c) => a + c.elapsed, 0);

  const statusColor = (status: string) => {
    if (ENDED_STATUSES.includes(status)) return crt(0.2);
    if (status === 'ringing') return amber(0.8);
    if (status === 'in-progress') return crt(0.9);
    return crt(0.5);
  };

  const statusLabel = (status: string) => {
    if (status === 'in-progress') return 'CONNECTED';
    if (status === 'ringing') return 'RINGING';
    if (status === 'queued') return 'QUEUED';
    return status.toUpperCase().replace(/-/g, ' ');
  };

  return (
    <PhonePageLayout
      title="ACTIVE CALLS"
      subtitle="Live call monitoring, control, and signal management"
      icon={<Zap size={24} style={{ color: liveCount > 0 ? crt(0.9) : crt(0.5) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MiniWaveform active={liveCount > 0} bars={6} />
          <span style={{ color: liveCount > 0 ? crt(0.6) : crt(0.2) }}>
            {liveCount > 0 ? `${liveCount} ACTIVE LINE${liveCount !== 1 ? 'S' : ''}` : 'ALL LINES IDLE'}
          </span>
          <SignalMeter level={Math.min(liveCount + 1, 5)} />
        </div>
      }
      actions={
        liveCount > 0 ? (
          <PhoneBtn onClick={handleHangupAll} color={red} glow>
            <PhoneOff size={14} /> HANG UP ALL ({liveCount})
          </PhoneBtn>
        ) : undefined
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'linear-gradient(90deg, rgba(255,40,40,0.08), rgba(255,40,40,0.03))', border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      {dialingSession && (
        <PhoneCard glow style={{ marginBottom: 20 }}>
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: `linear-gradient(135deg, ${crt(0.12)}, ${crt(0.03)})`,
                border: `1px solid ${crt(0.25)}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'glowPulse 2s infinite',
              }}>
                <Radio size={20} style={{ color: crt(0.8) }} />
              </div>
              <div>
                <div style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.2em', marginBottom: 3 }}>ACTIVE DIALING SESSION</div>
                <div style={{ fontSize: '0.85rem', color: crt(0.9), letterSpacing: '0.05em' }}>
                  {dialingSession.mode.toUpperCase()} · {dialingSession.dialed} / {dialingSession.total} DIALED
                </div>
                <div style={{ marginTop: 8, width: 220, height: 4, background: crt(0.06), borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round((dialingSession.dialed / dialingSession.total) * 100)}%`,
                    background: `linear-gradient(90deg, ${crt(0.4)}, ${crt(0.7)})`,
                    borderRadius: 2, transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.4rem', color: crt(0.25), marginTop: 4 }}>
                  {dialingSession.total - dialingSession.dialed} contacts remaining
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              {dialingSession.mode === 'power' && (
                <PhoneBtn
                  onClick={advanceSession}
                  disabled={advancingNext || dialingSession.dialed >= dialingSession.total}
                  color={blue}
                  glow={dialingSession.dialed < dialingSession.total}
                >
                  {advancingNext ? 'DIALING...' : 'NEXT CONTACT'}
                  <ChevronRight size={13} />
                </PhoneBtn>
              )}
              <PhoneBtn onClick={stopSession} color={red}>
                <X size={13} /> STOP SESSION
              </PhoneBtn>
            </div>
          </div>
        </PhoneCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        <StatBlock label="LIVE" value={liveCount} color={liveCount > 0 ? crt : undefined} sub={liveCount > 0 ? 'active' : 'idle'} />
        <StatBlock label="RINGING" value={ringingCount} color={ringingCount > 0 ? amber : undefined} />
        <StatBlock label="ON HOLD" value={onHoldCount} color={onHoldCount > 0 ? amber : undefined} />
        <StatBlock label="COMPLETED" value={completedCount} color={blue} />
        <StatBlock label="TOTAL TIME" value={formatDuration(totalElapsed)} sub="aggregate" color={purple} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        <PhoneCard glow={liveCount > 0}>
          <PhoneCardHeader
            accent={liveCount > 0 ? crt(0.6) : undefined}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>{liveCount > 0 ? 'LIVE CALL MONITOR' : 'CALL MONITOR'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {liveCount > 0 && (
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: red(0.9),
                  animation: 'pulse 1s infinite', boxShadow: `0 0 8px ${red(0.5)}`,
                }} />
              )}
              <span style={{ color: liveCount > 0 ? crt(0.7) : crt(0.2), fontSize: '0.5rem' }}>
                {liveCount > 0 ? `${liveCount} LIVE` : 'IDLE'}
              </span>
            </div>
          </PhoneCardHeader>

          {activeCalls.length === 0 ? (
            <EmptyState message="NO ACTIVE CALLS — USE DIALER OR CONTACTS TO INITIATE CALLS" icon={<Phone size={32} />} />
          ) : (
            activeCalls.map((c, i) => {
              const ended = ENDED_STATUSES.includes(c.status);
              const isLive = c.status === 'in-progress';
              const isRinging = c.status === 'ringing';
              const showTransfer = transferTarget === c.callSid;
              const isExpanded = expandedCall === c.callSid;
              return (
                <div key={c.callSid || i} style={{
                  borderBottom: `1px solid ${crt(0.06)}`,
                  opacity: ended ? 0.4 : 1,
                  background: isLive ? 'rgba(56,189,248,0.02)' : isRinging ? 'rgba(255,180,0,0.02)' : 'transparent',
                  transition: 'all 0.3s ease',
                }}>
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: isLive ? 12 : 0 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: `linear-gradient(135deg, ${isLive ? crt(0.12) : isRinging ? amber(0.12) : crt(0.04)} 0%, transparent 100%)`,
                        border: `1px solid ${isLive ? crt(0.25) : isRinging ? amber(0.25) : crt(0.08)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isLive ? `0 0 15px ${crt(0.08)}` : 'none',
                        position: 'relative',
                      }}>
                        {isRinging ? (
                          <Phone size={18} style={{ color: amber(0.8), animation: 'pulse 0.5s infinite' }} />
                        ) : (
                          <span style={{ fontSize: '1rem', color: isLive ? crt(0.7) : crt(0.3) }}>
                            {c.name?.[0]?.toUpperCase() || '#'}
                          </span>
                        )}
                        <div style={{
                          position: 'absolute', bottom: -2, right: -2,
                          width: 10, height: 10, borderRadius: '50%',
                          background: statusColor(c.status),
                          border: '2px solid rgba(0,10,0,0.8)',
                          boxShadow: ended ? 'none' : `0 0 6px ${statusColor(c.status)}`,
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.9rem', color: crt(isLive ? 0.95 : 0.7), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.name || formatPhone(c.phone)}
                        </div>
                        <div style={{ fontSize: '0.5rem', color: crt(0.35), marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span>{formatPhone(c.phone)}</span>
                          <span style={{ color: crt(0.12) }}>·</span>
                          <span style={{
                            color: isLive ? crt(0.6) : isRinging ? amber(0.7) : crt(0.3),
                            padding: '1px 6px', borderRadius: 3,
                            background: isLive ? crt(0.06) : isRinging ? amber(0.06) : 'transparent',
                            border: `1px solid ${isLive ? crt(0.15) : isRinging ? amber(0.15) : 'transparent'}`,
                          }}>
                            {statusLabel(c.status)}
                          </span>
                          <span style={{ color: crt(0.12) }}>·</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(c.elapsed)}</span>
                          {!ended && (
                            <SignalMeter
                              level={c.signalLevel ?? callStatusToSignalLevel(c.status)}
                              color={isLive ? crt : isRinging ? amber : undefined}
                            />
                          )}
                          {c.direction === 'inbound' && <span style={{ color: blue(0.7) }}>↙ IN</span>}
                          {c.muted && <span style={{ color: amber(0.7) }}>🔇 MUTED</span>}
                          {c.onHold && <span style={{ color: amber(0.7) }}>⏸ HOLD</span>}
                          {c.recordingActive && <span style={{ color: red(0.7), display: 'flex', alignItems: 'center', gap: 2 }}><div style={{ width: 5, height: 5, borderRadius: '50%', background: red(0.9), animation: 'pulse 1s infinite' }} /> REC</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                        {!ended && (
                          <PhoneBtn onClick={() => setExpandedCall(isExpanded ? null : c.callSid)} color={isExpanded ? crt : undefined} size="sm" title="Call details">
                            <FileText size={13} />
                          </PhoneBtn>
                        )}
                        {!ended && (
                          <>
                            <PhoneBtn onClick={() => handleMute(c.callSid, !!c.muted)} color={c.muted ? amber : crt} size="sm" title={c.muted ? 'Unmute' : 'Mute'}>
                              {c.muted ? <MicOff size={13} /> : <Mic size={13} />}
                            </PhoneBtn>
                            <PhoneBtn onClick={() => handleHold(c.callSid, !!c.onHold)} color={c.onHold ? amber : crt} size="sm" title={c.onHold ? 'Resume' : 'Hold'}>
                              {c.onHold ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                            </PhoneBtn>
                            <PhoneBtn onClick={() => setTransferTarget(showTransfer ? null : c.callSid)} color={blue} size="sm" title="Transfer">
                              <ArrowRightLeft size={13} />
                            </PhoneBtn>
                            <PhoneBtn onClick={() => handleHangup(c.callSid)} color={red} size="sm">
                              <PhoneOff size={13} />
                            </PhoneBtn>
                          </>
                        )}
                      </div>
                    </div>
                    {isLive && <CallWaveformVisualizer active={!c.muted && !c.onHold} color={c.onHold ? amber : crt} />}

                    {isExpanded && (
                      <div style={{ marginTop: 12, borderTop: `1px solid ${crt(0.06)}`, paddingTop: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          {[
                            { icon: Hash, label: 'CALL SID', value: c.callSid?.slice(-8) || '—', full: c.callSid },
                            { icon: User, label: 'CONTACT', value: c.name || 'UNKNOWN' },
                            { icon: Phone, label: 'NUMBER', value: formatPhone(c.phone) },
                            { icon: Clock, label: 'STARTED', value: new Date(c.startTime).toLocaleTimeString() },
                            { icon: Activity, label: 'DURATION', value: formatDuration(c.elapsed) },
                            { icon: Volume2, label: 'DIRECTION', value: (c.direction || 'outbound').toUpperCase() },
                            { icon: Shield, label: 'ENCRYPTION', value: 'TLS 1.3 / SRTP' },
                            { icon: Radio, label: 'CONFERENCE', value: c.conferenceName ? c.conferenceName.slice(-10) : 'DIRECT' },
                          ].map(({ icon: Icon, label, value, full }) => (
                            <div key={label} style={{ padding: '6px 8px', background: crt(0.02), borderRadius: 4, border: `1px solid ${crt(0.06)}` }} title={full || value}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <Icon size={9} style={{ color: crt(0.25) }} />
                                <span style={{ fontSize: '0.35rem', color: crt(0.25), letterSpacing: '0.15em' }}>{label}</span>
                              </div>
                              <div style={{ fontSize: '0.5rem', color: crt(0.6), fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ background: crt(0.02), borderRadius: 6, border: `1px solid ${crt(0.06)}`, overflow: 'hidden' }}>
                          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${crt(0.06)}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <MessageSquare size={10} style={{ color: crt(0.4) }} />
                              <span style={{ fontSize: '0.4rem', color: crt(0.4), letterSpacing: '0.15em' }}>LIVE TRANSCRIPT</span>
                              {isLive && <div style={{ width: 5, height: 5, borderRadius: '50%', background: crt(0.6), animation: 'pulse 1.5s infinite' }} />}
                            </div>
                            <span style={{ fontSize: '0.35rem', color: crt(0.2) }}>AUTO-CAPTURE</span>
                          </div>
                          <div style={{
                            padding: '10px 12px', minHeight: 60, maxHeight: 150, overflowY: 'auto',
                            fontSize: '0.5rem', color: crt(0.5), lineHeight: 1.6, whiteSpace: 'pre-wrap',
                            ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
                          }}>
                            {c.liveTranscript
                              ? c.liveTranscript
                              : isLive
                                ? '⏳ Waiting for speech...'
                                : isRinging
                                  ? '📞 Connecting...'
                                  : 'No transcript available'
                            }
                          </div>
                        </div>

                        {c.aiCoachTip && (
                          <div style={{ marginTop: 8, padding: '8px 10px', background: blue(0.03), borderRadius: 6, border: `1px solid ${blue(0.1)}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <Zap size={9} style={{ color: blue(0.6) }} />
                              <span style={{ fontSize: '0.35rem', color: blue(0.5), letterSpacing: '0.15em' }}>AI COACH</span>
                            </div>
                            <div style={{ fontSize: '0.45rem', color: blue(0.7), lineHeight: 1.5 }}>{c.aiCoachTip}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {showTransfer && (
                    <div style={{ padding: '12px 20px', display: 'flex', gap: 8, background: blue(0.03), borderTop: `1px solid ${blue(0.1)}` }}>
                      <input value={transferNumber} onChange={e => setTransferNumber(e.target.value)} placeholder="Transfer to number..." style={{ ...INPUT_STYLE, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleTransfer(c.callSid); }} />
                      <PhoneBtn onClick={() => handleTransfer(c.callSid)} color={blue} disabled={!transferNumber.trim()}>TRANSFER</PhoneBtn>
                      <PhoneBtn onClick={() => { setTransferTarget(null); setTransferNumber(''); }} color={red} size="sm"><X size={12} /></PhoneBtn>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </PhoneCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {liveCount > 0 && activeCalls.filter(c => c.status === 'in-progress').length > 0 && (
            <PhoneCard glow>
              <PhoneCardHeader accent={crt(0.5)}>PRIMARY CALL</PhoneCardHeader>
              <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                <ElapsedTimer boomer={boomerMode} seconds={activeCalls.find(c => c.status === 'in-progress')?.elapsed ?? 0} />
                <div style={{ fontSize: '0.55rem', color: crt(0.4), marginTop: 8, letterSpacing: '0.15em' }}>
                  {activeCalls.find(c => c.status === 'in-progress')?.name || 'UNKNOWN'}
                </div>
                <div style={{ margin: '16px 0 8px' }}>
                  <CallWaveformVisualizer active color={crt} />
                </div>
                {(() => {
                  const primaryCall = activeCalls.find(c => c.status === 'in-progress');
                  const sig = primaryCall ? (primaryCall.signalLevel ?? callStatusToSignalLevel(primaryCall.status)) : 0;
                  const sigLabel = sig >= 4 ? 'STRONG' : sig >= 2 ? 'FAIR' : sig >= 1 ? 'WEAK' : 'NO SIGNAL';
                  return (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                      <SignalMeter level={sig} />
                      <span style={{ fontSize: '0.42rem', color: crt(0.3), marginLeft: 6 }}>SIGNAL {sigLabel}</span>
                    </div>
                  );
                })()}
              </div>
            </PhoneCard>
          )}

          <PhoneCard>
            <PhoneCardHeader>CALL STATISTICS</PhoneCardHeader>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['TOTAL CALLS', activeCalls.length, crt],
                ['LIVE NOW', liveCount, crt],
                ['RINGING', ringingCount, amber],
                ['ON HOLD', onHoldCount, amber],
                ['MUTED', mutedCount, amber],
                ['COMPLETED', completedCount, blue],
                ['FAILED', activeCalls.filter(c => c.status === 'failed').length, red],
              ].map(([label, val, col]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.5rem', color: crt(0.3), letterSpacing: '0.1em' }}>{label as string}</span>
                  <span style={{ fontSize: '0.85rem', color: (col as (o: number) => string)(val ? 0.8 : 0.2), fontVariantNumeric: 'tabular-nums' }}>{val as number}</span>
                </div>
              ))}
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader>CONTROLS</PhoneCardHeader>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PhoneBtn onClick={() => setActiveCalls(prev => prev.filter(c => !ENDED_STATUSES.includes(c.status)))} style={{ justifyContent: 'center' }}>
                CLEAR ENDED CALLS
              </PhoneBtn>
              <PhoneBtn onClick={() => { setActiveCalls([]); saveActiveCalls([]); }} color={red} style={{ justifyContent: 'center' }}>
                CLEAR ALL
              </PhoneBtn>
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={crt(0.25)}>SYSTEM INFO</PhoneCardHeader>
            <div style={{ padding: '12px 16px' }}>
              {[
                ['PROTOCOL', 'TLS 1.3 / SRTP'],
                ['CODEC', 'OPUS 48kHz'],
                ['LATENCY', '< 120ms'],
                ['PROVIDER', 'TWILIO'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.42rem', color: crt(0.2), letterSpacing: '0.1em' }}>{k}</span>
                  <span style={{ fontSize: '0.42rem', color: crt(0.35), fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>
      </div>
    </PhonePageLayout>
  );
}
