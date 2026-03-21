import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, PhoneOff, Mic, MicOff, PauseCircle, PlayCircle, ArrowRightLeft, Phone, X, AlertTriangle } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform, SignalMeter, INPUT_STYLE } from './PhoneLayout';
import {
  crt, red, amber, blue, purple, formatPhone, formatDuration, ENDED_STATUSES,
  loadActiveCalls, saveActiveCalls,
  type ActiveCall,
} from '@/lib/phone-utils';

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

function ElapsedTimer({ seconds }: { seconds: number }) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const display = hrs > 0
    ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return (
    <span style={{
      fontFamily: "'Share Tech Mono', monospace",
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
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };
  const userId = user?.id ?? '';

  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>(() => loadActiveCalls());
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferNumber, setTransferNumber] = useState('');
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallsRef = useRef<ActiveCall[]>(activeCalls);
  activeCallsRef.current = activeCalls;

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  useEffect(() => { saveActiveCalls(activeCalls); }, [activeCalls]);

  const fetchHistory = useCallback(() => {
    fetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}`))
      .then(async r => {
        if (r.status === 403) { navigate('/features'); }
      })
      .catch((e: unknown) => { console.warn('[CalllHome] history sync error:', e instanceof Error ? e.message : e); });
  }, [apiUrl, userId, navigate]);

  useEffect(() => {
    if (activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).length > 0) startPolling();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveCalls(prev => prev.map(c => ({ ...c, elapsed: Math.floor((Date.now() - c.startTime) / 1000) })));
    }, 1000);
    pollRef.current = setInterval(async () => {
      const current = activeCallsRef.current.filter(c => c.callSid && !ENDED_STATUSES.includes(c.status));
      if (current.length === 0) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        fetchHistory();
        return;
      }
      try {
        for (const c of current) {
          const r = await fetch(apiUrl(`twilio/call-status/${c.callSid}`));
          if (r.status === 403) { navigate('/features'); return; }
          if (!r.ok) continue;
          const d = await r.json();
          setActiveCalls(prev => prev.map(ac => ac.callSid === c.callSid ? { ...ac, status: d.status } : ac));
        }
      } catch (e: unknown) { console.warn('[CalllHome] poll error:', e instanceof Error ? e.message : e); }
    }, 3000);
  };

  const handleApiError = async (r: Response) => {
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
  };

  const toggleMute = async (sid: string, currentMuted: boolean) => {
    try {
      const r = await fetch(apiUrl(`twilio/call/${sid}/mute`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ muted: !currentMuted }) });
      if (await handleApiError(r)) return;
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, muted: !currentMuted } : c));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const toggleHold = async (sid: string, currentHold: boolean) => {
    try {
      const r = await fetch(apiUrl(`twilio/call/${sid}/hold`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hold: !currentHold }) });
      if (await handleApiError(r)) return;
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, onHold: !currentHold } : c));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const transferCall = async (sid: string) => {
    if (!transferNumber.trim()) return;
    try {
      const r = await fetch(apiUrl(`twilio/call/${sid}/transfer`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transferTo: transferNumber }) });
      if (await handleApiError(r)) return;
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'transferred' } : c));
      setTransferTarget(null); setTransferNumber('');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const hangupOne = async (sid: string) => {
    try {
      const r = await fetch(apiUrl(`twilio/hangup/${sid}`), { method: 'POST' });
      if (await handleApiError(r)) return;
      setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'completed' } : c));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const hangupAll = async () => {
    const sids = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).map(c => c.callSid);
    if (sids.length === 0) return;
    try {
      const r = await fetch(apiUrl('twilio/hangup-all'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callSids: sids }) });
      if (await handleApiError(r)) return;
      setActiveCalls(prev => prev.map(c => ({ ...c, status: 'completed' })));
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      fetchHistory();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
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
          <PhoneBtn onClick={hangupAll} color={red} glow>
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
              return (
                <div key={c.callSid || i} style={{
                  borderBottom: `1px solid ${crt(0.06)}`,
                  opacity: ended ? 0.4 : 1,
                  background: isLive ? 'rgba(0,255,65,0.02)' : isRinging ? 'rgba(255,180,0,0.02)' : 'transparent',
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
                          {c.direction === 'inbound' && <span style={{ color: blue(0.7) }}>↙ IN</span>}
                          {c.muted && <span style={{ color: amber(0.7) }}>🔇 MUTED</span>}
                          {c.onHold && <span style={{ color: amber(0.7) }}>⏸ HOLD</span>}
                        </div>
                      </div>
                      {!ended && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                          <PhoneBtn onClick={() => toggleMute(c.callSid, !!c.muted)} color={c.muted ? amber : crt} size="sm" title={c.muted ? 'Unmute' : 'Mute'}>
                            {c.muted ? <MicOff size={13} /> : <Mic size={13} />}
                          </PhoneBtn>
                          <PhoneBtn onClick={() => toggleHold(c.callSid, !!c.onHold)} color={c.onHold ? amber : crt} size="sm" title={c.onHold ? 'Resume' : 'Hold'}>
                            {c.onHold ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                          </PhoneBtn>
                          <PhoneBtn onClick={() => setTransferTarget(showTransfer ? null : c.callSid)} color={blue} size="sm" title="Transfer">
                            <ArrowRightLeft size={13} />
                          </PhoneBtn>
                          <PhoneBtn onClick={() => hangupOne(c.callSid)} color={red} size="sm">
                            <PhoneOff size={13} />
                          </PhoneBtn>
                        </div>
                      )}
                    </div>
                    {isLive && <CallWaveformVisualizer active={!c.muted && !c.onHold} color={c.onHold ? amber : crt} />}
                  </div>
                  {showTransfer && (
                    <div style={{ padding: '12px 20px', display: 'flex', gap: 8, background: blue(0.03), borderTop: `1px solid ${blue(0.1)}` }}>
                      <input value={transferNumber} onChange={e => setTransferNumber(e.target.value)} placeholder="Transfer to number..." style={{ ...INPUT_STYLE, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') transferCall(c.callSid); }} />
                      <PhoneBtn onClick={() => transferCall(c.callSid)} color={blue} disabled={!transferNumber.trim()}>TRANSFER</PhoneBtn>
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
                <ElapsedTimer seconds={activeCalls.find(c => c.status === 'in-progress')?.elapsed ?? 0} />
                <div style={{ fontSize: '0.55rem', color: crt(0.4), marginTop: 8, letterSpacing: '0.15em' }}>
                  {activeCalls.find(c => c.status === 'in-progress')?.name || 'UNKNOWN'}
                </div>
                <div style={{ margin: '16px 0 8px' }}>
                  <CallWaveformVisualizer active color={crt} />
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                  <SignalMeter level={4} />
                  <span style={{ fontSize: '0.42rem', color: crt(0.3), marginLeft: 6 }}>SIGNAL STRONG</span>
                </div>
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
