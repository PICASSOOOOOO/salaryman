import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MonitorUp, MonitorOff, Loader2, Radio, Video, VideoOff, Mic, MicOff, PhoneOff,
} from 'lucide-react';
import { useWebRTC } from '@/hooks/use-webrtc';
import { useFeatureLabel } from '@/hooks/use-feature-label';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

function getWsBase(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}
const API = import.meta.env.BASE_URL.replace(/\/$/, '').replace(/^\//, '');

interface LiveLessonProps {
  room: string;
  displayName: string;
  isTeacher: boolean;
  active: boolean;
  onStart?: () => Promise<void> | void;
  onStop?: () => Promise<void> | void;
}

// Discord-style multi-participant call over the existing /ws/conf signaling
// channel: every participant publishes camera + mic into a mesh and sees a grid
// of everyone else. Screen-share is an optional overlay (replaces the outgoing
// video track for the duration of the share). The teacher gates the session on
// the server via onStart / onStop; students auto-join while it is active.
export default function LiveLesson({ room, displayName, isTeacher, active, onStart, onStop }: LiveLessonProps) {
  const { label } = useFeatureLabel();
  const sessionWord = label === 'Classroom' ? 'live lesson' : 'live session';

  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  const wsRef = useRef<WebSocket | null>(null);

  const webrtc = useWebRTC({
    onSendSignal: useCallback(({ targetId, signal }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'conf_signal', targetId, signal }));
      }
    }, []),
  });
  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;

  // Open the signaling socket whenever we are "joined". Cleanup closes the
  // socket and tears down all peer connections / local media.
  useEffect(() => {
    if (!joined) return;
    setWsStatus('connecting');
    const prefix = API ? `/${API}` : '';
    const url = `${getWsBase()}${prefix}/ws/conf/${encodeURIComponent(room)}?name=${encodeURIComponent(displayName)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus('connected');
    ws.onerror = () => setWsStatus('error');
    ws.onmessage = async (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const rtc = webrtcRef.current;
      if (msg.type === 'conf_welcome') {
        await rtc.joinRoom(msg.peers ?? [], true);
      } else if (msg.type === 'conf_peer_joined') {
        rtc.addPeer(msg.peerId, msg.peerName);
      } else if (msg.type === 'conf_peer_left') {
        rtc.removePeer(msg.peerId);
      } else if (msg.type === 'conf_signal') {
        rtc.handleSignal(msg.fromId, msg.fromName, msg.signal);
      } else if (msg.type === 'error') {
        setWsStatus('error');
        ws.close();
      }
    };
    ws.onclose = () => {
      webrtcRef.current.leaveRoom();
    };

    return () => {
      try { ws.close(); } catch { /* */ }
      wsRef.current = null;
      webrtcRef.current.leaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, room, displayName]);

  // Students join automatically while the session is live, and drop when it ends.
  useEffect(() => {
    if (isTeacher) return;
    if (active && !joined) setJoined(true);
    if (!active && joined) setJoined(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isTeacher]);

  const startSession = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (onStart) await onStart();
      setJoined(true);
    } catch {
      setError(`Could not start the ${sessionWord}. The server rejected the request.`);
    } finally {
      setBusy(false);
    }
  }, [onStart, sessionWord]);

  const endSession = useCallback(async () => {
    setJoined(false);
    setWsStatus('idle');
    if (onStop) { try { await onStop(); } catch { /* */ } }
  }, [onStop]);

  const leaveSession = useCallback(() => {
    setJoined(false);
    setWsStatus('idle');
  }, []);

  const toggleScreenShare = useCallback(() => {
    if (webrtc.isScreenSharing) void webrtc.stopScreenShare();
    else void webrtc.startScreenShare();
  }, [webrtc]);

  const { peers, myStream, screenStream, videoEnabled, audioEnabled, isScreenSharing } = webrtc;
  const total = peers.length + 1;
  const cols = total <= 1 ? 1 : total <= 4 ? 2 : 3;
  const myTileStream = isScreenSharing ? screenStream : myStream;

  const card: React.CSSProperties = {
    border: `1px solid rgba(56,189,248,0.25)`,
    borderRadius: 8,
    background: 'rgba(56,189,248,0.04)',
    padding: 16,
    fontFamily: FONT,
  };

  const tile: React.CSSProperties = {
    aspectRatio: '4 / 3',
    background: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    border: '1px solid rgba(56,189,248,0.18)',
  };
  const tag: React.CSSProperties = {
    position: 'absolute', bottom: 5, left: 7,
    fontSize: '0.6rem', color: 'rgba(56,189,248,0.85)',
    background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: 3,
    letterSpacing: '0.05em',
  };
  const ctrlBtn = (on: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
    background: on ? 'rgba(56,189,248,0.12)' : 'rgba(248,113,113,0.12)',
    color: on ? CRT : '#f87171',
    border: `1px solid ${on ? 'rgba(56,189,248,0.35)' : 'rgba(248,113,113,0.4)'}`,
    borderRadius: 6, fontFamily: FONT, fontSize: '0.76rem', cursor: 'pointer',
  });

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: CRT, fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          <Radio size={16} /> {sessionWord.toUpperCase()}
          {joined && wsStatus === 'connected' && (
            <span style={{ marginLeft: 8, color: '#f87171', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              ● ON AIR · {total} {total === 1 ? 'PARTICIPANT' : 'PARTICIPANTS'}
            </span>
          )}
        </div>
      </div>

      {!joined ? (
        <div style={{
          width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 6,
          border: '1px solid rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'rgba(56,189,248,0.55)', fontSize: '0.82rem',
          textAlign: 'center', padding: 16,
        }}>
          {isTeacher
            ? `Start the ${sessionWord} to bring everyone into a live video call.`
            : active
              ? 'Connecting…'
              : `No ${sessionWord} in progress.`}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
          <div style={tile}>
            {myTileStream && (isScreenSharing || videoEnabled) ? (
              <video
                ref={el => { if (el && myTileStream) { el.srcObject = myTileStream; el.muted = true; el.play().catch(() => {}); } }}
                autoPlay muted playsInline
                style={{ width: '100%', height: '100%', objectFit: isScreenSharing ? 'contain' : 'cover', transform: isScreenSharing ? undefined : 'scaleX(-1)' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '2rem', opacity: 0.3 }}>👤</div>
                {!videoEnabled && <span style={{ fontSize: '0.58rem', color: 'rgba(56,189,248,0.4)', letterSpacing: '0.1em' }}>CAM OFF</span>}
              </div>
            )}
            <div style={tag}>
              YOU{isScreenSharing ? ' · SHARING' : ''}{!audioEnabled ? ' · MUTED' : ''}
            </div>
          </div>

          {peers.map(peer => (
            <div key={peer.id} style={tile}>
              {peer.stream ? (
                <video
                  ref={el => { if (el && peer.stream) { el.srcObject = peer.stream; el.play().catch(() => {}); } }}
                  autoPlay playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: '2rem', opacity: 0.4 }}>👤</div>
                  <div style={{ fontSize: '0.58rem', color: 'rgba(56,189,248,0.4)', letterSpacing: '0.08em' }}>CONNECTING…</div>
                </div>
              )}
              <div style={tag}>{peer.name}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#f87171', fontSize: '0.72rem', marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {!joined ? (
          isTeacher && (
            <button
              onClick={() => void startSession()}
              disabled={busy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                background: CRT, color: '#04121c', border: 'none', borderRadius: 6,
                fontFamily: FONT, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer', fontWeight: 600,
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />} Start {sessionWord}
            </button>
          )
        ) : (
          <>
            <button onClick={webrtc.toggleAudio} style={ctrlBtn(audioEnabled)} title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}>
              {audioEnabled ? <Mic size={14} /> : <MicOff size={14} />} {audioEnabled ? 'Mic on' : 'Mic off'}
            </button>
            <button onClick={webrtc.toggleVideo} style={ctrlBtn(videoEnabled)} title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}>
              {videoEnabled ? <Video size={14} /> : <VideoOff size={14} />} {videoEnabled ? 'Cam on' : 'Cam off'}
            </button>
            <button onClick={toggleScreenShare} style={ctrlBtn(!isScreenSharing)} title={isScreenSharing ? 'Stop sharing your screen' : 'Share your screen'}>
              {isScreenSharing ? <MonitorOff size={14} /> : <MonitorUp size={14} />} {isScreenSharing ? 'Stop share' : 'Share screen'}
            </button>
            {isTeacher ? (
              <button
                onClick={() => void endSession()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                  background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)',
                  borderRadius: 6, fontFamily: FONT, fontSize: '0.76rem', cursor: 'pointer',
                }}
              >
                <PhoneOff size={14} /> End {sessionWord}
              </button>
            ) : (
              <button
                onClick={leaveSession}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                  background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)',
                  borderRadius: 6, fontFamily: FONT, fontSize: '0.76rem', cursor: 'pointer',
                }}
              >
                <PhoneOff size={14} /> Leave
              </button>
            )}
            {wsStatus === 'error' && <span style={{ alignSelf: 'center', color: '#f87171', fontSize: '0.68rem' }}>signal error</span>}
          </>
        )}
      </div>
    </div>
  );
}
