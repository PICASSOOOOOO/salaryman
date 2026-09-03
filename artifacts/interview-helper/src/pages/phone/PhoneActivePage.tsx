import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Zap, PhoneOff, Mic, MicOff, PauseCircle, PlayCircle, ArrowRightLeft, Phone, X, AlertTriangle, Radio, ChevronRight, FileText, MessageSquare, Clock, Shield, Volume2, Hash, User, Activity , PhoneIncoming, VolumeX} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform, SignalMeter, INPUT_STYLE } from './PhoneLayout';
import { useActiveCallContext } from '@/contexts/ActiveCallContext';
import {
  slate, destructive, warning, primary, accent, formatPhone, formatDuration, ENDED_STATUSES,
  saveActiveCalls, callStatusToSignalLevel,
  type ActiveCall } from '@/lib/phone-utils';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';
import { getTranslationLanguage, getTranslationPreferences, translateFreeText } from '@/lib/translate';

const SESSION_KEY = 'phone_dialing_session';

interface DialingSession {
  id: number;
  mode: string;
  total: number;
  dialed: number;
  queue?: Array<{ phone: string; name?: string }>;
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
        <div key={i} className="phone-wave-bar" style={{
          width: 3, borderRadius: 2, flex: 1,
          background: c(active ? 0.5 : 0.08),
          height: active ? `${20 + ((i * 41) % 75)}%` : '10%',
          animation: active ? `waveform ${0.36 + ((i * 17) % 9) * 0.05}s ease-in-out infinite alternate` : 'none',
          animationDelay: `${i * 0.04}s`,
          transition: 'background 0.3s ease' }} />
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
      ...(boomer ? {} : { fontFamily: "var(--font-sans)" }),
      fontSize: '1.8rem',
      color: slate(0.9),
      letterSpacing: '0.15em',
      fontVariantNumeric: 'tabular-nums',
       }}>
      {display}
    </span>
  );
}

export default function PhoneActivePage() {
  const isMobile = useIsMobile();

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
  const [phoneTranslationEnabled, setPhoneTranslationEnabled] = useState(() => {
    try { return localStorage.getItem('sm_translation_conversation') === '1'; } catch { return false; }
  });
  const [translatedTranscripts, setTranslatedTranscripts] = useState<Record<string, string>>({});
  const translatedTranscriptRequests = useRef(new Map<string, string>());

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  useEffect(() => { saveSession(dialingSession); }, [dialingSession]);

  // Translation observes the existing live transcript only. It never touches
  // the Twilio media stream or call-control lifecycle.
  useEffect(() => {
    if (!phoneTranslationEnabled) return;
    const { source, target } = getTranslationPreferences();
    for (const call of activeCalls) {
      const text = call.liveTranscript?.trim();
      if (!text || source === target) continue;
      const requestKey = `${call.callSid}:${source}:${target}:${text}`;
      if (translatedTranscriptRequests.current.get(call.callSid) === requestKey) continue;
      translatedTranscriptRequests.current.set(call.callSid, requestKey);
      void translateFreeText(text, source, target)
        .then(translated => setTranslatedTranscripts(prev => ({ ...prev, [call.callSid]: translated })))
        .catch(() => {
          translatedTranscriptRequests.current.delete(call.callSid);
        });
    }
  }, [activeCalls, phoneTranslationEnabled]);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await apiFetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}`), { credentials: 'include' });
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
        const r = await apiFetch(apiUrl(`twilio/dialing/${dialingSession.id}/next`), { method: 'POST', credentials: 'include' });
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

  useEffect(() => {
    if (!dialingSession || advancingNext || dialingSession.dialed >= dialingSession.total) return;
    if (dialingSession.mode !== 'auto' && dialingSession.mode !== 'predictive') return;
    const terminal = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);
    const liveCount = activeCalls.filter(call => !terminal.has(call.status)).length;
    const targetConcurrency = dialingSession.mode === 'predictive' ? 3 : 1;
    if (liveCount >= targetConcurrency) return;
    const timer = window.setTimeout(() => {
      void advanceSession();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    dialingSession?.id,
    dialingSession?.mode,
    dialingSession?.dialed,
    dialingSession?.total,
    advancingNext,
    activeCalls,
  ]);

  const stopSession = async () => {
    if (!dialingSession) return;
    try {
      await apiFetch(apiUrl(`twilio/dialing/${dialingSession.id}/stop`), { method: 'POST', credentials: 'include' });
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
    if (ENDED_STATUSES.includes(status)) return slate(0.2);
    if (status === 'ringing') return warning(0.8);
    if (status === 'in-progress') return slate(0.9);
    return slate(0.5);
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
      icon={<Zap size={24} style={{ color: liveCount > 0 ? slate(0.9) : slate(0.5) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MiniWaveform active={liveCount > 0} bars={6} />
          <span style={{ color: liveCount > 0 ? slate(0.6) : slate(0.2) }}>
            {liveCount > 0 ? `${liveCount} ACTIVE LINE${liveCount !== 1 ? 'S' : ''}` : 'ALL LINES IDLE'}
          </span>
          <SignalMeter level={Math.min(liveCount + 1, 5)} />
        </div>
      }
      actions={
        liveCount > 0 ? (
          <PhoneBtn onClick={handleHangupAll} color={destructive}>
            <PhoneOff size={14} /> HANG UP ALL ({liveCount})
          </PhoneBtn>
        ) : undefined
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: slate(0.02), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      {dialingSession && (
        <PhoneCard style={{ marginBottom: 20 }}>
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: slate(0.02),
                border: `1px solid ${slate(0.25)}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'none 2s infinite' }}>
                <Radio size={20} style={{ color: slate(0.8) }} />
              </div>
              <div>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', marginBottom: 3 }}>ACTIVE DIALING SESSION</div>
                <div style={{ fontSize: '0.85rem', color: slate(0.9), letterSpacing: '0.05em' }}>
                  {dialingSession.mode.toUpperCase()} · {dialingSession.dialed} / {dialingSession.total} DIALED
                </div>
                <div style={{ marginTop: 8, width: 220, height: 4, background: slate(0.06), borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round((dialingSession.dialed / dialingSession.total) * 100)}%`,
                    background: slate(0.02),
                    borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 4 }}>
                  {dialingSession.total - dialingSession.dialed} contacts remaining
                </div>
                {(dialingSession.queue?.length ?? 0) > dialingSession.dialed && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: '0.4rem', color: slate(0.55), letterSpacing: '0.12em' }}>CALLING NEXT</div>
                    {dialingSession.queue!.slice(dialingSession.dialed, dialingSession.dialed + 5).map((entry, index) => (
                      <div key={`${entry.phone}-${index}`} style={{ fontSize: '0.55rem', color: slate(index === 0 ? 0.9 : 0.55) }}>
                        {index + 1}. {entry.name || 'Unknown contact'} · {formatPhone(entry.phone)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              {dialingSession.mode === 'power' && (
                <PhoneBtn
                  onClick={advanceSession}
                  disabled={advancingNext || dialingSession.dialed >= dialingSession.total}
                  color={primary}

                >
                  {advancingNext ? 'DIALING...' : 'NEXT CONTACT'}
                  <ChevronRight size={13} />
                </PhoneBtn>
              )}
              <PhoneBtn onClick={stopSession} color={destructive}>
                <X size={13} /> STOP SESSION
              </PhoneBtn>
            </div>
          </div>
        </PhoneCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        <StatBlock label="LIVE" value={liveCount} color={liveCount > 0 ? slate : undefined} sub={liveCount > 0 ? 'active' : 'idle'} />
        <StatBlock label="RINGING" value={ringingCount} color={ringingCount > 0 ? warning : undefined} />
        <StatBlock label="ON HOLD" value={onHoldCount} color={onHoldCount > 0 ? warning : undefined} />
        <StatBlock label="COMPLETED" value={completedCount} color={primary} />
        <StatBlock label="TOTAL TIME" value={formatDuration(totalElapsed)} sub="aggregate" color={accent} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 20, alignItems: 'start' }}>
        <PhoneCard>
          <PhoneCardHeader
            accent={liveCount > 0 ? slate(0.6) : undefined}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>{liveCount > 0 ? 'LIVE CALL MONITOR' : 'CALL MONITOR'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {liveCount > 0 && (
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: destructive(0.9),
                  animation: 'pulse 1s infinite' }} />
              )}
              <span style={{ color: liveCount > 0 ? slate(0.7) : slate(0.2), fontSize: '0.5rem' }}>
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
                  borderBottom: `1px solid ${slate(0.06)}`,
                  opacity: ended ? 0.4 : 1,
                  background: isLive ? slate(0.02) : isRinging ? warning(0.02) : 'transparent',
                  transition: 'all 0.3s ease' }}>
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: isLive ? 12 : 0 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: slate(0.02),
                        border: `1px solid ${isLive ? slate(0.25) : isRinging ? warning(0.25) : slate(0.08)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',

                        position: 'relative' }}>
                        {isRinging ? (
                          <Phone size={18} style={{ color: warning(0.8), animation: 'pulse 0.5s infinite' }} />
                        ) : (
                          <span style={{ fontSize: '1rem', color: isLive ? slate(0.7) : slate(0.3) }}>
                            {c.name?.[0]?.toUpperCase() || '#'}
                          </span>
                        )}
                        <div style={{
                          position: 'absolute', bottom: -2, right: -2,
                          width: 10, height: 10, borderRadius: '50%',
                          background: statusColor(c.status),
                          border: `2px solid ${slate(0.1)}` }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.9rem', color: slate(isLive ? 0.95 : 0.7), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.name || formatPhone(c.phone)}
                        </div>
                        <div style={{ fontSize: '0.5rem', color: slate(0.55), marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span>{formatPhone(c.phone)}</span>
                          <span style={{ color: slate(0.55) }}>·</span>
                          <span style={{
                            color: isLive ? slate(0.6) : isRinging ? warning(0.7) : slate(0.3),
                            padding: '1px 6px', borderRadius: 3,
                            background: isLive ? slate(0.06) : isRinging ? warning(0.06) : 'transparent',
                            border: `1px solid ${isLive ? slate(0.15) : isRinging ? warning(0.15) : 'transparent'}` }}>
                            {statusLabel(c.status)}
                          </span>
                          <span style={{ color: slate(0.55) }}>·</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(c.elapsed)}</span>
                          {!ended && (
                            <SignalMeter
                              level={c.signalLevel ?? callStatusToSignalLevel(c.status)}
                              color={isLive ? slate : isRinging ? warning : undefined}
                            />
                          )}
                          {c.direction === 'inbound' && <span style={{ color: primary(0.7) }}>↙ IN</span>}
                          {c.muted && <span style={{ color: warning(0.7) }}><VolumeX size={10} style={{ marginRight: 4 }} /> MUTED</span>}
                          {c.onHold && <span style={{ color: warning(0.7) }}>⏸ HOLD</span>}
                          {c.recordingActive && <span style={{ color: destructive(0.7), display: 'flex', alignItems: 'center', gap: 2 }}><div style={{ width: 5, height: 5, borderRadius: '50%', background: destructive(0.9), animation: 'pulse 1s infinite' }} /> REC</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                        {!ended && (
                          <PhoneBtn onClick={() => setExpandedCall(isExpanded ? null : c.callSid)} color={isExpanded ? slate : undefined} size="sm" title="Call details">
                            <FileText size={13} />
                          </PhoneBtn>
                        )}
                        {!ended && (
                          <>
                            <PhoneBtn onClick={() => handleMute(c.callSid, !!c.muted)} color={c.muted ? warning : slate} size="sm" title={c.muted ? 'Unmute' : 'Mute'}>
                              {c.muted ? <MicOff size={13} /> : <Mic size={13} />}
                            </PhoneBtn>
                            <PhoneBtn onClick={() => handleHold(c.callSid, !!c.onHold)} color={c.onHold ? warning : slate} size="sm" title={c.onHold ? 'Resume' : 'Hold'}>
                              {c.onHold ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                            </PhoneBtn>
                            <PhoneBtn onClick={() => setTransferTarget(showTransfer ? null : c.callSid)} color={primary} size="sm" title="Transfer">
                              <ArrowRightLeft size={13} />
                            </PhoneBtn>
                            <PhoneBtn onClick={() => handleHangup(c.callSid)} color={destructive} size="sm">
                              <PhoneOff size={13} />
                            </PhoneBtn>
                          </>
                        )}
                      </div>
                    </div>
                    {isLive && <CallWaveformVisualizer active={!c.muted && !c.onHold} color={c.onHold ? warning : slate} />}

                    {isExpanded && (
                      <div style={{ marginTop: 12, borderTop: `1px solid ${slate(0.06)}`, paddingTop: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 12 }}>
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
                            <div key={label} style={{ padding: '6px 8px', background: slate(0.02), borderRadius: 4, border: `1px solid ${slate(0.06)}` }} title={full || value}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <Icon size={9} style={{ color: slate(0.55) }} />
                                <span style={{ fontSize: '0.35rem', color: slate(0.55), letterSpacing: '0.15em' }}>{label}</span>
                              </div>
                              <div style={{ fontSize: '0.5rem', color: slate(0.6), fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ background: slate(0.02), borderRadius: 6, border: `1px solid ${slate(0.06)}`, overflow: 'hidden' }}>
                          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${slate(0.06)}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <MessageSquare size={10} style={{ color: slate(0.55) }} />
                              <span style={{ fontSize: '0.4rem', color: slate(0.55), letterSpacing: '0.15em' }}>LIVE TRANSCRIPT</span>
                              {isLive && <div style={{ width: 5, height: 5, borderRadius: '50%', background: slate(0.6), animation: 'pulse 1.5s infinite' }} />}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => setPhoneTranslationEnabled(enabled => !enabled)}
                                title="Translate the live transcript without changing the call audio"
                                style={{ padding: '2px 5px', background: phoneTranslationEnabled ? 'rgba(34,197,94,.12)' : 'transparent', border: `1px solid ${phoneTranslationEnabled ? 'rgba(34,197,94,.45)' : slate(0.18)}`, color: phoneTranslationEnabled ? '#86efac' : slate(0.45), cursor: 'pointer', fontSize: '0.33rem', letterSpacing: '0.08em' }}
                              >
                                {phoneTranslationEnabled ? 'LANG ON' : 'LANG OFF'}
                              </button>
                              <span style={{ fontSize: '0.35rem', color: slate(0.55) }}>AUTO-CAPTURE</span>
                            </div>
                          </div>
                          <div style={{
                            padding: '10px 12px', minHeight: 60, maxHeight: 150, overflowY: 'auto',
                            fontSize: '0.5rem', color: slate(0.5), lineHeight: 1.6, whiteSpace: 'pre-wrap',
                            ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>
                            {c.liveTranscript
                              ? c.liveTranscript
                              : isLive
                                ? '⏳ Waiting for speech...'
                                : isRinging
                                  ? <><PhoneIncoming size={10} style={{ marginRight: 4 }} /> Connecting...</>
                                  : 'No transcript available'
                            }
                            {phoneTranslationEnabled && c.liveTranscript && translatedTranscripts[c.callSid] && (
                              <div style={{ marginTop: 8, paddingTop: 7, borderTop: `1px solid ${slate(0.1)}`, color: '#86efac' }}>
                                <div style={{ fontSize: '0.35rem', color: '#86efac', letterSpacing: '0.12em', marginBottom: 3 }}>
                                  TRANSLATED · {getTranslationLanguage(getTranslationPreferences().target).nativeName.toUpperCase()}
                                </div>
                                {translatedTranscripts[c.callSid]}
                              </div>
                            )}
                          </div>
                        </div>

                        {c.aiCoachTip && (
                          <div style={{ marginTop: 8, padding: '8px 10px', background: primary(0.03), borderRadius: 6, border: `1px solid ${primary(0.1)}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <Zap size={9} style={{ color: primary(0.6) }} />
                              <span style={{ fontSize: '0.35rem', color: primary(0.5), letterSpacing: '0.15em' }}>AI COACH</span>
                            </div>
                            <div style={{ fontSize: '0.45rem', color: primary(0.7), lineHeight: 1.5 }}>{c.aiCoachTip}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {showTransfer && (
                    <div style={{ padding: '12px 20px', display: 'flex', gap: 8, background: primary(0.03), borderTop: `1px solid ${primary(0.1)}` }}>
                      <input value={transferNumber} onChange={e => setTransferNumber(e.target.value)} placeholder="Transfer to number..." style={{ ...INPUT_STYLE, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleTransfer(c.callSid); }} />
                      <PhoneBtn onClick={() => handleTransfer(c.callSid)} color={primary} disabled={!transferNumber.trim()}>TRANSFER</PhoneBtn>
                      <PhoneBtn onClick={() => { setTransferTarget(null); setTransferNumber(''); }} color={destructive} size="sm"><X size={12} /></PhoneBtn>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </PhoneCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {liveCount > 0 && activeCalls.filter(c => c.status === 'in-progress').length > 0 && (
            <PhoneCard>
              <PhoneCardHeader accent={slate(0.5)}>PRIMARY CALL</PhoneCardHeader>
              <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                <ElapsedTimer boomer={boomerMode} seconds={activeCalls.find(c => c.status === 'in-progress')?.elapsed ?? 0} />
                <div style={{ fontSize: '0.55rem', color: slate(0.55), marginTop: 8, letterSpacing: '0.15em' }}>
                  {activeCalls.find(c => c.status === 'in-progress')?.name || 'UNKNOWN'}
                </div>
                <div style={{ margin: '16px 0 8px' }}>
                  <CallWaveformVisualizer active color={slate} />
                </div>
                {(() => {
                  const primaryCall = activeCalls.find(c => c.status === 'in-progress');
                  const sig = primaryCall ? (primaryCall.signalLevel ?? callStatusToSignalLevel(primaryCall.status)) : 0;
                  const sigLabel = sig >= 4 ? 'STRONG' : sig >= 2 ? 'FAIR' : sig >= 1 ? 'WEAK' : 'NO SIGNAL';
                  return (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                      <SignalMeter level={sig} />
                      <span style={{ fontSize: '0.42rem', color: slate(0.55), marginLeft: 6 }}>SIGNAL {sigLabel}</span>
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
                ['TOTAL CALLS', activeCalls.length, slate],
                ['LIVE NOW', liveCount, slate],
                ['RINGING', ringingCount, warning],
                ['ON HOLD', onHoldCount, warning],
                ['MUTED', mutedCount, warning],
                ['COMPLETED', completedCount, primary],
                ['FAILED', activeCalls.filter(c => c.status === 'failed').length, destructive],
              ].map(([label, val, col]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.5rem', color: slate(0.55), letterSpacing: '0.1em' }}>{label as string}</span>
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
              <PhoneBtn onClick={() => { setActiveCalls([]); saveActiveCalls([]); }} color={destructive} style={{ justifyContent: 'center' }}>
                CLEAR ALL
              </PhoneBtn>
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={slate(0.25)}>SYSTEM INFO</PhoneCardHeader>
            <div style={{ padding: '12px 16px' }}>
              {[
                ['PROTOCOL', 'TLS 1.3 / SRTP'],
                ['CODEC', 'OPUS 48kHz'],
                ['LATENCY', '< 120ms'],
                ['PROVIDER', 'TWILIO'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.1em' }}>{k}</span>
                  <span style={{ fontSize: '0.42rem', color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>
      </div>
    </PhonePageLayout>
  );
}
