import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';

const API = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/^\//, "");
function apiUrl(path: string) {
  return `/${API ? API + "/" : ""}api/${path}`.replace(/\/+/g, "/");
}

function getWsBase(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}

interface Peer {
  id: string;
  name: string;
  isGuest: boolean;
  stream?: MediaStream;
}

type Stage = 'loading' | 'notfound' | 'lobby' | 'joining' | 'call';

export default function MeetPage({ params }: { params: { code: string } }) {
  const [boomerMode] = useBoomerMode();
  const code = params.code;
  const [stage, setStage] = useState<Stage>('loading');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [myId, setMyId] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const myStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const myIdRef = useRef<string>('');
  const peersRef = useRef<Peer[]>([]);

  useEffect(() => {
    apiFetch(apiUrl(`meetings/by-code/${code}`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.meeting) { setStage('notfound'); return; }
        setMeetingTitle(data.meeting.title);
        setStage('lobby');
      })
      .catch(() => setStage('notfound'));
  }, [code]);

  const wsSend = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const createPeerConnection = useCallback((peerId: string, peerName: string, isGuest: boolean, initiator: boolean) => {
    if (peerConnectionsRef.current.has(peerId)) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
    });

    pc.onicecandidate = e => {
      if (e.candidate) wsSend({ type: 'meet_signal', targetId: peerId, signal: { type: 'ice', candidate: e.candidate } });
    };

    pc.ontrack = e => {
      const stream = e.streams[0];
      setPeers(prev => {
        const idx = prev.findIndex(p => p.id === peerId);
        if (idx === -1) return [...prev, { id: peerId, name: peerName, isGuest, stream }];
        const updated = [...prev];
        updated[idx] = { ...updated[idx], stream };
        return updated;
      });
    };

    if (myStreamRef.current) {
      for (const track of myStreamRef.current.getTracks()) {
        pc.addTrack(track, myStreamRef.current);
      }
    }

    peerConnectionsRef.current.set(peerId, pc);

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsSend({ type: 'meet_signal', targetId: peerId, signal: { type: 'offer', sdp: pc.localDescription } });
      };
    }

    return pc;
  }, [wsSend]);

  const handleSignal = useCallback(async (fromId: string, fromName: string, isGuest: boolean, signal: any) => {
    let pc = peerConnectionsRef.current.get(fromId);

    if (signal.type === 'offer') {
      if (!pc) {
        pc = createPeerConnection(fromId, fromName, isGuest, false)!;
      }
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const queued = iceCandidateQueueRef.current.get(fromId) ?? [];
      for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
      iceCandidateQueueRef.current.delete(fromId);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      wsSend({ type: 'meet_signal', targetId: fromId, signal: { type: 'answer', sdp: pc.localDescription } });
    } else if (signal.type === 'answer') {
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const queued = iceCandidateQueueRef.current.get(fromId) ?? [];
        for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
        iceCandidateQueueRef.current.delete(fromId);
      }
    } else if (signal.type === 'ice') {
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        if (!iceCandidateQueueRef.current.has(fromId)) iceCandidateQueueRef.current.set(fromId, []);
        iceCandidateQueueRef.current.get(fromId)!.push(signal.candidate);
      }
    }
  }, [createPeerConnection, wsSend]);

  const joinMeeting = useCallback(async () => {
    const name = nameInput.trim();
    if (!name) return;
    setStage('joining');

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setVideoEnabled(false);
      } catch {
        stream = null;
        setVideoEnabled(false);
        setAudioEnabled(false);
      }
    }

    myStreamRef.current = stream;
    setMyStream(stream);

    // Obtain a short-lived guest token before opening the WS
    let guestToken = '';
    try {
      const tokenResp = await apiFetch(apiUrl(`meetings/${code}/guest-token`), { method: 'POST' });
      if (tokenResp.ok) {
        const tokenData = await tokenResp.json();
        guestToken = tokenData.token ?? '';
      }
    } catch {
      // Token fetch failed — proceed without token (server will still do DB check)
    }

    const wsBase = getWsBase();
    const prefix = API ? `/${API}` : '';
    const tokenParam = guestToken ? `&token=${encodeURIComponent(guestToken)}` : '';
    const wsUrl = `${wsBase}${prefix}/ws/meet/${code}?name=${encodeURIComponent(name)}${tokenParam}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStage('call');

    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'meet_welcome') {
        myIdRef.current = msg.guestId;
        setMyId(msg.guestId);
        const initialPeers: Peer[] = (msg.peers ?? []).map((p: any) => ({ id: p.id, name: p.isGuest ? p.name : `${p.name}`, isGuest: p.isGuest }));
        setPeers(initialPeers);
        peersRef.current = initialPeers;
        for (const peer of initialPeers) {
          createPeerConnection(peer.id, peer.name, peer.isGuest, true);
        }
      } else if (msg.type === 'meet_peer_joined') {
        setPeers(prev => {
          if (prev.find(p => p.id === msg.peerId)) return prev;
          const newPeer = { id: msg.peerId, name: msg.peerName, isGuest: msg.isGuest };
          peersRef.current = [...prev, newPeer];
          return peersRef.current;
        });
        createPeerConnection(msg.peerId, msg.peerName, msg.isGuest, false);
      } else if (msg.type === 'meet_peer_left') {
        const pc = peerConnectionsRef.current.get(msg.peerId);
        if (pc) { pc.close(); peerConnectionsRef.current.delete(msg.peerId); }
        iceCandidateQueueRef.current.delete(msg.peerId);
        setPeers(prev => {
          const updated = prev.filter(p => p.id !== msg.peerId);
          peersRef.current = updated;
          return updated;
        });
      } else if (msg.type === 'meet_signal') {
        handleSignal(msg.fromId, msg.fromName, msg.isGuest, msg.signal);
      } else if (msg.type === 'error') {
        setStage('notfound');
        ws.close();
      }
    };

    ws.onclose = () => {
      myStreamRef.current?.getTracks().forEach(t => t.stop());
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
    };

    ws.onerror = () => setStage('notfound');
  }, [code, nameInput, API, createPeerConnection, handleSignal]);

  const leaveCall = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    myStreamRef.current?.getTracks().forEach(t => t.stop());
    myStreamRef.current = null;
    setMyStream(null);
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    iceCandidateQueueRef.current.clear();
    setPeers([]);
    setStage('lobby');
  }, []);

  useEffect(() => () => {
    wsRef.current?.close();
    myStreamRef.current?.getTracks().forEach(t => t.stop());
    peerConnectionsRef.current.forEach(pc => pc.close());
  }, []);

  const S: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: '#030803', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), padding: '1rem' },
    card: { background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.3)', borderRadius: '8px', padding: '2rem', maxWidth: '480px', width: '100%', boxShadow: '0 0 30px rgba(56,189,248,.08)' },
    header: { color: 'rgba(56,189,248,.5)', fontSize: '.55rem', letterSpacing: '.15em', marginBottom: '.5rem' },
    title: { color: '#38bdf8', fontSize: '1rem', letterSpacing: '.1em', marginBottom: '1.5rem', borderBottom: '1px solid rgba(56,189,248,.15)', paddingBottom: '.75rem' },
    label: { color: 'rgba(56,189,248,.5)', fontSize: '.55rem', letterSpacing: '.1em', display: 'block', marginBottom: '.3rem' },
    input: { width: '100%', background: 'rgba(56,189,248,.04)', border: '1px solid rgba(56,189,248,.25)', color: '#38bdf8', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontSize: '.75rem', padding: '.6rem .8rem', outline: 'none', boxSizing: 'border-box' as const, borderRadius: '2px' },
    btn: { display: 'block', width: '100%', padding: '.7rem', background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.4)', color: '#38bdf8', cursor: 'pointer', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontSize: '.7rem', letterSpacing: '.12em', marginTop: '1rem', borderRadius: '2px' },
    dangerBtn: { display: 'block', padding: '.4rem .9rem', background: 'rgba(255,60,60,.1)', border: '1px solid rgba(255,60,60,.4)', color: 'rgba(255,80,80,.8)', cursor: 'pointer', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontSize: '.55rem', letterSpacing: '.08em', borderRadius: '2px' },
    grid: { display: 'grid', gap: '4px', padding: '4px' },
    videoBox: { aspectRatio: '4/3' as const, background: 'rgba(0,0,0,.7)', borderRadius: '4px', overflow: 'hidden', position: 'relative' as const, border: '1px solid rgba(56,189,248,.15)' },
    nameTag: { position: 'absolute' as const, bottom: 4, left: 6, fontSize: '.4rem', color: 'rgba(56,189,248,.7)', background: 'rgba(0,0,0,.7)', padding: '1px 5px', borderRadius: '2px' },
    controls: { display: 'flex', gap: '8px', justifyContent: 'center', padding: '8px 4px', borderTop: '1px solid rgba(56,189,248,.1)' },
    ctrlBtn: { padding: '.35rem .9rem', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontSize: '.5rem', cursor: 'pointer', borderRadius: '3px' },
  };

  if (stage === 'loading') {
    return (
      <div style={S.page}>
        <div style={{ color: 'rgba(56,189,248,.4)', fontSize: '.7rem', letterSpacing: '.2em' }}>LOADING SIGNAL...</div>
      </div>
    );
  }

  if (stage === 'notfound') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.header}>HOLOGRAM SIGNAL</div>
          <div style={{ ...S.title, color: 'rgba(255,80,80,.7)' }}>SIGNAL LOST</div>
          <div style={{ color: 'rgba(56,189,248,.5)', fontSize: '.65rem', lineHeight: 1.8 }}>
            This meeting link is invalid or has expired.<br />
            Contact your host for a new link.
          </div>
          <a href={import.meta.env.BASE_URL} style={{ display: 'block', marginTop: '1.4rem', textAlign: 'center', color: 'rgba(56,189,248,.6)', fontSize: '.6rem', letterSpacing: '.12em', textDecoration: 'none' }}>← RETURN TO SALARYMAN</a>
        </div>
      </div>
    );
  }

  if (stage === 'lobby' || stage === 'joining') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.header}>▓ HOLOGRAM LINK — GUEST ACCESS ▓</div>
          <div style={S.title}>{meetingTitle || 'MEETING ROOM'}</div>
          <div style={{ marginBottom: '1.2rem' }}>
            <label style={S.label}>YOUR NAME</label>
            <input
              style={S.input}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && nameInput.trim()) joinMeeting(); }}
              placeholder="ENTER NAME TO JOIN..."
              autoFocus
              maxLength={24}
            />
          </div>
          <div style={{ color: 'rgba(56,189,248,.35)', fontSize: '.55rem', lineHeight: 1.7, marginBottom: '.8rem' }}>
            Camera & microphone access may be requested.<br />No login required.
          </div>
          <button
            style={{ ...S.btn, opacity: stage === 'joining' || !nameInput.trim() ? 0.5 : 1 }}
            onClick={joinMeeting}
            disabled={stage === 'joining' || !nameInput.trim()}
          >
            {stage === 'joining' ? 'ESTABLISHING LINK...' : '▶ JOIN MEETING'}
          </button>
          <a href={import.meta.env.BASE_URL} style={{ display: 'block', marginTop: '1rem', textAlign: 'center', color: 'rgba(56,189,248,.45)', fontSize: '.55rem', letterSpacing: '.12em', textDecoration: 'none' }}>← BACK TO SALARYMAN</a>
        </div>
      </div>
    );
  }

  const allPeers = peers.length;
  const cols = allPeers === 0 ? 1 : allPeers <= 1 ? 2 : allPeers <= 3 ? 2 : 3;

  return (
    <div style={{ ...S.page, justifyContent: 'flex-start', paddingTop: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '900px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', padding: '0 4px' }}>
          <div>
            <div style={S.header}>▓ HOLOGRAM LINK — LIVE ▓</div>
            <div style={{ color: '#38bdf8', fontSize: '.75rem', letterSpacing: '.08em' }}>{meetingTitle} · {peers.length + 1} participant{peers.length !== 0 ? 's' : ''}</div>
          </div>
          <button style={S.dangerBtn} onClick={leaveCall}>✕ LEAVE</button>
        </div>

        <div style={{ background: 'rgba(0,8,0,.9)', border: '1px solid rgba(56,189,248,.2)', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ ...S.grid, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            <div style={S.videoBox}>
              {myStream && videoEnabled ? (
                <video
                  ref={el => { if (el && myStream) { el.srcObject = myStream; el.muted = true; el.play().catch(() => {}); } }}
                  autoPlay muted playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '2rem', opacity: 0.4 }}>👤</div>
                </div>
              )}
              <div style={S.nameTag}>YOU{!audioEnabled ? ' (MUTED)' : ''}</div>
            </div>
            {peers.map(peer => (
              <div key={peer.id} style={{ ...S.videoBox, border: peer.isGuest ? '1px solid rgba(0,200,255,.25)' : '1px solid rgba(56,189,248,.15)' }}>
                {peer.stream ? (
                  <video
                    ref={el => { if (el && peer.stream) { el.srcObject = peer.stream; el.play().catch(() => {}); } }}
                    autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '2rem', opacity: peer.isGuest ? 0.6 : 0.4 }}>👤</div>
                    <div style={{ fontSize: '.4rem', color: 'rgba(0,200,255,.5)', letterSpacing: '.08em' }}>CONNECTING...</div>
                  </div>
                )}
                <div style={{ ...S.nameTag, color: peer.isGuest ? 'rgba(0,200,255,.7)' : 'rgba(56,189,248,.7)' }}>
                  {peer.name}{peer.isGuest ? '' : ' [IN-GAME]'}
                </div>
              </div>
            ))}
          </div>

          <div style={S.controls}>
            <button
              onClick={() => {
                if (myStreamRef.current) {
                  const t = myStreamRef.current.getAudioTracks()[0];
                  if (t) { t.enabled = !t.enabled; setAudioEnabled(t.enabled); }
                }
              }}
              style={{ ...S.ctrlBtn, background: audioEnabled ? 'rgba(56,189,248,.08)' : 'rgba(255,60,60,.12)', border: `1px solid ${audioEnabled ? 'rgba(56,189,248,.3)' : 'rgba(255,60,60,.4)'}`, color: audioEnabled ? 'rgba(56,189,248,.7)' : 'rgba(255,80,80,.7)' }}
            >
              {audioEnabled ? 'MIC ON' : 'MIC OFF'}
            </button>
            <button
              onClick={() => {
                if (myStreamRef.current) {
                  const t = myStreamRef.current.getVideoTracks()[0];
                  if (t) { t.enabled = !t.enabled; setVideoEnabled(t.enabled); }
                }
              }}
              style={{ ...S.ctrlBtn, background: videoEnabled ? 'rgba(56,189,248,.08)' : 'rgba(255,60,60,.12)', border: `1px solid ${videoEnabled ? 'rgba(56,189,248,.3)' : 'rgba(255,60,60,.4)'}`, color: videoEnabled ? 'rgba(56,189,248,.7)' : 'rgba(255,80,80,.7)' }}
            >
              {videoEnabled ? 'CAM ON' : 'CAM OFF'}
            </button>
            <button onClick={leaveCall} style={{ ...S.ctrlBtn, background: 'rgba(255,60,60,.1)', border: '1px solid rgba(255,60,60,.4)', color: 'rgba(255,80,80,.8)' }}>
              END CALL
            </button>
          </div>
        </div>

        <div style={{ marginTop: '.5rem', padding: '0 4px', color: 'rgba(56,189,248,.25)', fontSize: '.45rem', letterSpacing: '.08em' }}>
          SALARYMAN HOLOGRAM LINK · GUEST SESSION · ROOM: {code.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
