import { useState, useRef, useCallback, useEffect } from 'react';
import { MonitorUp, MonitorOff, Loader2, Radio, Eye } from 'lucide-react';

const CRT = '#38bdf8';
const FONT = "'Share Tech Mono', monospace";

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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

// Teacher hosts a screen share over the existing /ws/conf signaling channel;
// students join as view-only peers. The teacher is always the WebRTC initiator
// toward each student (and adds the screen tracks), so media flows host→viewer.
export default function LiveLesson({ room, displayName, isTeacher, active, onStart, onStop }: LiveLessonProps) {
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasStream, setHasStream] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const myStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isTeacherRef = useRef(isTeacher);
  isTeacherRef.current = isTeacher;

  const wsSend = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const attachStreamToVideo = useCallback((stream: MediaStream) => {
    setHasStream(true);
    requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => { /* autoplay guard */ });
      }
    });
  }, []);

  const makePc = useCallback((peerId: string, initiator: boolean) => {
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId)!;
    const pc = new RTCPeerConnection({ iceServers: ICE });

    pc.onicecandidate = (e) => {
      if (e.candidate) wsSend({ type: 'conf_signal', targetId: peerId, signal: { type: 'ice', candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      // Only viewers render an incoming track (the teacher's screen).
      if (!isTeacherRef.current && e.streams[0]) attachStreamToVideo(e.streams[0]);
    };

    // The teacher (host) adds the screen tracks; viewers send nothing.
    if (isTeacherRef.current && myStreamRef.current) {
      for (const track of myStreamRef.current.getTracks()) pc.addTrack(track, myStreamRef.current);
    }

    pcsRef.current.set(peerId, pc);

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsSend({ type: 'conf_signal', targetId: peerId, signal: { type: 'offer', sdp: pc.localDescription } });
        } catch { /* ignore */ }
      };
    }
    return pc;
  }, [wsSend, attachStreamToVideo]);

  const handleSignal = useCallback(async (fromId: string, signal: any) => {
    let pc = pcsRef.current.get(fromId);
    if (signal.type === 'offer') {
      if (!pc) pc = makePc(fromId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const queued = iceQueueRef.current.get(fromId) ?? [];
      for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
      iceQueueRef.current.delete(fromId);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      wsSend({ type: 'conf_signal', targetId: fromId, signal: { type: 'answer', sdp: pc.localDescription } });
    } else if (signal.type === 'answer') {
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const queued = iceQueueRef.current.get(fromId) ?? [];
        for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
        iceQueueRef.current.delete(fromId);
      }
    } else if (signal.type === 'ice') {
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        if (!iceQueueRef.current.has(fromId)) iceQueueRef.current.set(fromId, []);
        iceQueueRef.current.get(fromId)!.push(signal.candidate);
      }
    }
  }, [makePc, wsSend]);

  const teardown = useCallback(() => {
    for (const pc of pcsRef.current.values()) { try { pc.close(); } catch { /* */ } }
    pcsRef.current.clear();
    iceQueueRef.current.clear();
    if (myStreamRef.current) { myStreamRef.current.getTracks().forEach((t) => t.stop()); myStreamRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch { /* */ } wsRef.current = null; }
    setConnected(false);
    setSharing(false);
    setPeerCount(0);
    setHasStream(false);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    const wsBase = getWsBase();
    const prefix = API ? `/${API}` : '';
    const url = `${wsBase}${prefix}/ws/conf/${room}?name=${encodeURIComponent(displayName)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError('Connection error.');
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'conf_welcome') {
        const peers: Array<{ id: string }> = msg.peers ?? [];
        setPeerCount(peers.length);
        // Teacher initiates a connection to every peer already in the room.
        if (isTeacherRef.current) for (const p of peers) makePc(p.id, true);
      } else if (msg.type === 'conf_peer_joined') {
        setPeerCount((n) => n + 1);
        if (isTeacherRef.current) makePc(msg.peerId, true);
      } else if (msg.type === 'conf_peer_left') {
        setPeerCount((n) => Math.max(0, n - 1));
        const pc = pcsRef.current.get(msg.peerId);
        if (pc) { try { pc.close(); } catch { /* */ } pcsRef.current.delete(msg.peerId); }
      } else if (msg.type === 'conf_signal') {
        handleSignal(msg.fromId, msg.signal).catch(() => { /* */ });
      }
    };
  }, [room, displayName, makePc, handleSignal]);

  // Teacher: capture the screen, then start signaling and broadcast.
  const startHosting = useCallback(async () => {
    setError(null);
    setBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      // Mark the lesson live server-side before exposing any local UI; if this
      // fails we roll back the capture so the teacher isn't left "sharing".
      if (onStart) await onStart();
      myStreamRef.current = stream;
      setSharing(true);
      attachStreamToVideo(stream);
      // End share if the user stops via the browser's native control.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { void stopHosting(); });
      connect();
    } catch (e) {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      myStreamRef.current = null;
      setSharing(false);
      setError('Could not start the live lesson. Screen share may have been blocked, or the server rejected the request.');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachStreamToVideo, connect, onStart]);

  const stopHosting = useCallback(async () => {
    teardown();
    if (onStop) { try { await onStop(); } catch { /* */ } }
  }, [teardown, onStop]);

  // Student: connect as a viewer when a live lesson is active.
  useEffect(() => {
    if (isTeacher) return;
    if (active && !wsRef.current) connect();
    if (!active) teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isTeacher]);

  useEffect(() => () => teardown(), [teardown]);

  const card: React.CSSProperties = {
    border: `1px solid rgba(56,189,248,0.25)`,
    borderRadius: 8,
    background: 'rgba(56,189,248,0.04)',
    padding: 16,
    fontFamily: FONT,
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: CRT, fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          <Radio size={16} /> LIVE LESSON
          {(sharing || (active && !isTeacher && hasStream)) && (
            <span style={{ marginLeft: 8, color: '#f87171', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              ● ON AIR
            </span>
          )}
        </div>
        {isTeacher && (
          <span style={{ color: 'rgba(56,189,248,0.7)', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} /> {peerCount} watching
          </span>
        )}
      </div>

      <div style={{
        position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000',
        borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(56,189,248,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <video ref={videoRef} autoPlay playsInline muted={isTeacher} style={{ width: '100%', height: '100%', objectFit: 'contain', display: hasStream ? 'block' : 'none' }} />
        {!hasStream && (
          <div style={{ color: 'rgba(56,189,248,0.5)', fontSize: '0.8rem', textAlign: 'center', padding: 16 }}>
            {isTeacher
              ? 'Start sharing your screen to broadcast a live lesson.'
              : active
                ? 'Connecting to the live lesson…'
                : 'No live lesson in progress.'}
          </div>
        )}
      </div>

      {error && <div style={{ color: '#f87171', fontSize: '0.72rem', marginTop: 8 }}>{error}</div>}

      {isTeacher && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {!sharing ? (
            <button
              onClick={() => void startHosting()}
              disabled={busy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: CRT, color: '#04121c', border: 'none', borderRadius: 6,
                fontFamily: FONT, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer', fontWeight: 600,
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <MonitorUp size={14} />} Share Screen
            </button>
          ) : (
            <button
              onClick={() => void stopHosting()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)',
                borderRadius: 6, fontFamily: FONT, fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              <MonitorOff size={14} /> End Live Lesson
            </button>
          )}
          {connected && <span style={{ alignSelf: 'center', color: 'rgba(56,189,248,0.6)', fontSize: '0.68rem' }}>signal connected</span>}
        </div>
      )}
    </div>
  );
}
