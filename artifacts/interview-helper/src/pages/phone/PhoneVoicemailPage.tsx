import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Voicemail, Trash2, Play, Pause, Phone, CheckCircle, Eye, EyeOff, X, AlertTriangle , Volume2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform } from './PhoneLayout';
import { HummingBirdAttachStrip } from '@/components/HummingBirdAttachStrip';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import {
  slate, destructive, warning, primary, accent, formatPhone, formatDuration,
  addActiveCall,
  type VoicemailRecord } from '@/lib/phone-utils';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime / (audio.duration || 1));
    const onEnd = () => { setPlaying(false); setProgress(0); };
    const onMeta = () => setDuration(audio.duration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('loadedmetadata', onMeta);
    return () => { audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('ended', onEnd); audio.removeEventListener('loadedmetadata', onMeta); };
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * (audioRef.current.duration || 0);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={toggle} style={{
        width: 32, height: 32, borderRadius: '50%', border: `1px solid ${slate(0.25)}`,
        background: playing ? slate(0.1) : slate(0.05),
        color: slate(0.8), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
         transition: 'all 0.2s' }}>
        {playing ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div onClick={seek} style={{ height: 6, background: slate(0.06), borderRadius: 3, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: slate(0.02), borderRadius: 3, transition: 'width 0.1s linear' }} />
          {playing && (
            <div style={{
              position: 'absolute', top: 0, left: `${progress * 100}%`,
              width: 8, height: 6, borderRadius: 3,
              background: slate(0.9), transform: 'translateX(-50%)' }} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: '0.4rem', color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(Math.floor((audioRef.current?.currentTime || 0)))}
          </span>
          <span style={{ fontSize: '0.4rem', color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(Math.floor(duration))}
          </span>
        </div>
      </div>
      <MiniWaveform active={playing} bars={5} />
    </div>
  );
}

function SendVoicemailToHummingBird({ url, id }: { url: string; id: number }) {
  const mp = useMusicPlayer();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('fetch ' + res.status);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'mp3').split(';')[0];
      const file = new File([blob], `voicemail-${id}.${ext}`, { type: blob.type || 'audio/mpeg' });
      await mp.uploadFiles([file]);
      await mp.refresh();
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e: any) {
      alert('Send failed: ' + (e?.message || 'unknown'));
    }
    setBusy(false);
  };
  return (
    <button
      onClick={send}
      disabled={busy}
      style={{
        background: 'transparent', border: `1px solid ${accent(0.5)}`,
        color: '#a855f7', padding: '4px 10px', cursor: busy ? 'wait' : 'pointer',
        fontFamily: "var(--font-sans)", fontSize: '0.55rem', letterSpacing: '0.1em',
        opacity: busy ? 0.5 : 1 }}
    >
      {done ? <><Check size={12} /> SAVED</> : busy ? 'SAVING...' : '→ HUMMING BIRD'}
    </button>
  );
}

export default function PhoneVoicemailPage() {
  const isMobile = useIsMobile();

  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };

  const [voicemails, setVoicemails] = useState<VoicemailRecord[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showRead, setShowRead] = useState(true);
  const [error, setError] = useState('');

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  useEffect(() => {
    apiFetch(apiUrl('twilio/voicemail'), { credentials: 'include' })
      .then(async r => {
        if (r.status === 403) { rawNavigate('/pricing'); return; }
        if (r.ok) { const d = await r.json(); if (d?.voicemails) { setVoicemails(d.voicemails); setUnread(d.unread ?? 0); } }
        else { setError(`Failed to load voicemails (${r.status})`); }
      })
      .catch(() => setError('Network error loading voicemails'))
      .finally(() => setLoading(false));
  }, [apiUrl, rawNavigate]);

  const markRead = async (id: number) => {
    try {
      const r = await apiFetch(apiUrl(`twilio/voicemail/${id}/read`), { method: 'POST', credentials: 'include' });
      if (r.status === 403) { rawNavigate('/pricing'); return; }
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Failed to mark as read'); return; }
      setVoicemails(prev => prev.map(v => v.id === id ? { ...v, isRead: true } : v));
      setUnread(prev => Math.max(0, prev - 1));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const deleteVoicemail = async (id: number) => {
    try {
      const r = await apiFetch(apiUrl(`twilio/voicemail/${id}`), { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Failed to delete voicemail'); return; }
      setVoicemails(prev => prev.filter(v => v.id !== id));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const callBack = async (phone: string, name?: string) => {
    setError('');
    try {
      const d = await bridgeOutbound(async () => {
        const r = await apiFetch(apiUrl('twilio/call'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ recipientNumber: phone, userId: user?.id, callerName: user?.firstName, contactName: name }) });
        const body = await r.json();
        if (r.status === 403) { rawNavigate('/pricing'); throw new Error(body.error || 'Access denied'); }
        if (!r.ok) throw new Error(body.error || `Call failed (${r.status})`);
        return body;
      }, created => [{ callSid: created.callSid, conferenceName: created.conferenceName }]);
      if (d.callSid) {
        addActiveCall({ callSid: d.callSid, phone, name: name ?? phone, status: 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound', conferenceName: d.conferenceName });
      }
      navigate('/phone/active');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const handleExpand = (id: number, isRead: boolean) => {
    setExpandedId(expandedId === id ? null : id);
    if (!isRead) markRead(id);
  };

  const displayed = useMemo(() => showRead ? voicemails : voicemails.filter(v => !v.isRead), [voicemails, showRead]);
  const totalDuration = voicemails.reduce((a, v) => a + (v.durationSeconds ?? 0), 0);

  return (
    <PhonePageLayout
      title="VOICEMAIL"
      subtitle="Incoming voicemail inbox with playback, transcripts, and AI summaries"
      icon={<Voicemail size={24} style={{ color: slate(0.8) }} />}
      statusLine={
        unread > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: warning(0.8), animation: 'pulse 1s infinite' }} />
            <span style={{ color: warning(0.6) }}>{unread} UNREAD</span>
          </div>
        ) : <span style={{ color: slate(0.55) }}>ALL READ</span>
      }
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HummingBirdAttachStrip toolKey="voicemail-greeting" buttonStyle="ghost" pickerTitle="OUTGOING GREETING BED" />
          <PhoneBtn onClick={() => setShowRead(!showRead)} size="sm">
            {showRead ? <EyeOff size={11} /> : <Eye size={11} />}
            {showRead ? 'HIDE READ' : 'SHOW ALL'}
          </PhoneBtn>
        </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL" value={voicemails.length} />
        <StatBlock label="UNREAD" value={unread} color={unread > 0 ? warning : undefined} sub={unread > 0 ? 'new messages' : undefined} />
        <StatBlock label="WITH AUDIO" value={voicemails.filter(v => v.recordingUrl).length} color={primary} />
        <StatBlock label="TRANSCRIBED" value={voicemails.filter(v => v.transcript).length} color={accent} />
        <StatBlock label="TOTAL TIME" value={formatDuration(totalDuration)} color={slate} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: 20, alignItems: 'start' }}>
        <PhoneCard>
          <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>INBOX</span>
            <span style={{ color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>{displayed.length} MESSAGES</span>
          </PhoneCardHeader>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.6rem', color: slate(0.55), letterSpacing: '0.15em' }}>LOADING VOICEMAIL...</div>
          ) : displayed.length === 0 ? (
            <EmptyState message={showRead ? 'NO VOICEMAILS' : 'NO UNREAD VOICEMAILS'} icon={<Voicemail size={32} />} />
          ) : (
            displayed.map(v => {
              const isExpanded = expandedId === v.id;
              return (
                <div key={v.id} style={{
                  borderBottom: `1px solid ${slate(0.05)}`,
                  background: !v.isRead ? slate(0.025) : 'transparent',
                  transition: 'background 0.15s' }}>
                  <div
                    onClick={() => handleExpand(v.id, v.isRead)}
                    style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: !v.isRead
                        ? `linear-gradient(135deg, ${warning(0.12)}, ${warning(0.03)})`
                        : slate(0.04),
                      border: `1px solid ${!v.isRead ? warning(0.25) : slate(0.08)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative' }}>
                      <Voicemail size={16} style={{ color: !v.isRead ? warning(0.7) : slate(0.3) }} />
                      {!v.isRead && (
                        <div style={{
                          position: 'absolute', top: -2, right: -2,
                          width: 8, height: 8, borderRadius: '50%',
                          background: warning(0.9), border: `2px solid ${slate(0.1)}` }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.72rem', color: !v.isRead ? slate(0.95) : slate(0.65), fontWeight: !v.isRead ? 'bold' : 'normal' }}>
                        {v.fromName || formatPhone(v.fromNumber)}
                      </div>
                      <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{formatPhone(v.fromNumber)}</span>
                        {v.durationSeconds != null && (
                          <>
                            <span style={{ color: slate(0.55) }}>·</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(v.durationSeconds)}</span>
                          </>
                        )}
                        <span style={{ color: slate(0.55) }}>·</span>
                        <span>{new Date(v.createdAt).toLocaleDateString()} {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {v.recordingUrl && <Volume2 size={12} style={{ color: primary(0.5) }} />}
                        {v.transcript && <span style={{ color: accent(0.5) }}>📝</span>}
                      </div>
                      {v.summary && !isExpanded && (
                        <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 4, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {v.summary}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <PhoneBtn onClick={e => { (e as React.MouseEvent).stopPropagation(); callBack(v.fromNumber, v.fromName ?? undefined); }} size="sm" title="Call back" color={primary}>
                        <Phone size={11} />
                      </PhoneBtn>
                      <PhoneBtn onClick={e => { (e as React.MouseEvent).stopPropagation(); deleteVoicemail(v.id); }} color={destructive} size="sm" title="Delete">
                        <Trash2 size={11} />
                      </PhoneBtn>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '14px 20px 18px', background: slate(0.015), borderTop: `1px solid ${slate(0.05)}` }}>
                      {v.recordingUrl && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: '0.42rem', color: primary(0.5), letterSpacing: '0.2em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 3, height: 3, borderRadius: '50%', background: primary(0.5) }} /> RECORDING
                          </div>
                          <div style={{ padding: '12px 14px', background: slate(0.2), borderRadius: 8, border: `1px solid ${slate(0.06)}` }}>
                            <AudioPlayer src={v.recordingUrl} />
                            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                              <SendVoicemailToHummingBird url={v.recordingUrl} id={v.id} />
                            </div>
                          </div>
                        </div>
                      )}
                      {v.transcript && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 3, height: 3, borderRadius: '50%', background: slate(0.35) }} /> TRANSCRIPT
                          </div>
                          <div style={{
                            fontSize: '0.55rem', color: slate(0.5), whiteSpace: 'pre-wrap', lineHeight: 1.7,
                            padding: '10px 12px', background: slate(0.25), borderRadius: 6, border: `1px solid ${slate(0.05)}` }}>
                            {v.transcript}
                          </div>
                        </div>
                      )}
                      {v.summary && (
                        <div>
                          <div style={{ fontSize: '0.42rem', color: accent(0.5), letterSpacing: '0.2em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 3, height: 3, borderRadius: '50%', background: accent(0.5) }} /> AI SUMMARY
                          </div>
                          <div style={{ fontSize: '0.58rem', color: slate(0.6), lineHeight: 1.7, padding: '10px 12px', background: accent(0.02), borderRadius: 6, border: `1px solid ${accent(0.08)}` }}>
                            {v.summary}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </PhoneCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={warning(0.4)}>INBOX OVERVIEW</PhoneCardHeader>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['TOTAL', voicemails.length, slate],
                ['UNREAD', unread, warning],
                ['READ', voicemails.filter(v => v.isRead).length, primary],
                ['WITH AUDIO', voicemails.filter(v => v.recordingUrl).length, primary],
                ['TRANSCRIBED', voicemails.filter(v => v.transcript).length, accent],
                ['AI SUMMARIZED', voicemails.filter(v => v.summary).length, accent],
              ].map(([label, val, col]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.48rem', color: slate(0.55), letterSpacing: '0.1em' }}>{label as string}</span>
                  <span style={{ fontSize: '0.85rem', color: (col as (o: number) => string)(val ? 0.7 : 0.2), fontVariantNumeric: 'tabular-nums' }}>{val as number}</span>
                </div>
              ))}
            </div>
          </PhoneCard>

          {unread > 0 && (
            <PhoneCard>
              <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', color: warning(0.8), fontWeight: 'bold', lineHeight: 1 }}>{unread}</div>
                <div style={{ fontSize: '0.48rem', color: warning(0.5), letterSpacing: '0.2em', marginTop: 6 }}>NEW VOICEMAILS</div>
                <div style={{ margin: '12px auto 0', width: 60 }}>
                  <MiniWaveform active bars={5} color={warning} />
                </div>
              </div>
            </PhoneCard>
          )}

          <PhoneCard>
            <PhoneCardHeader>ACTIONS</PhoneCardHeader>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PhoneBtn onClick={() => { voicemails.filter(v => !v.isRead).forEach(v => markRead(v.id)); }} disabled={unread === 0} style={{ justifyContent: 'center' }}>
                <CheckCircle size={12} /> MARK ALL READ
              </PhoneBtn>
            </div>
          </PhoneCard>
        </div>
      </div>
    </PhonePageLayout>
  );
}
