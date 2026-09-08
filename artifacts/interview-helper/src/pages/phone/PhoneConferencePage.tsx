import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Plus, PhoneOff, Loader2, X, MicOff, Video, VideoOff, Mic } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, MiniWaveform, INPUT_STYLE } from './PhoneLayout';
import {
  slate, destructive, warning, primary, accent, formatPhone,
  type ConferenceRoom } from '@/lib/phone-utils';
import { useWebRTC } from '@/hooks/use-webrtc';

const ROOM_COLORS = [slate, primary, accent, warning];

function getWsBase(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}

function getWsPrefix(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const trimmed = base.replace(/\/$/, '');
  return trimmed;
}

interface ConferenceVideoProps {
  roomName: string;
  participantName: string;
  onClose: () => void;
}

function ConferenceVideoPanel({ roomName, participantName, onClose }: ConferenceVideoProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef<string>('');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  const webrtc = useWebRTC({
    onSendSignal: useCallback(({ targetId, signal }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'conf_signal', targetId, signal }));
      }
    }, []) });

  useEffect(() => {
    const prefix = getWsPrefix();
    const encodedRoom = encodeURIComponent(roomName);
    const wsUrl = `${getWsBase()}${prefix}/ws/conf/${encodedRoom}?name=${encodeURIComponent(participantName)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus('connected');

    ws.onmessage = async (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'conf_welcome') {
        myIdRef.current = msg.connId;
        await webrtc.joinRoom(msg.peers ?? [], true);
      } else if (msg.type === 'conf_peer_joined') {
        webrtc.addPeer(msg.peerId, msg.peerName);
      } else if (msg.type === 'conf_peer_left') {
        webrtc.removePeer(msg.peerId);
      } else if (msg.type === 'conf_signal') {
        webrtc.handleSignal(msg.fromId, msg.fromName, msg.signal);
      } else if (msg.type === 'error') {
        setWsStatus('error');
        ws.close();
      }
    };

    ws.onerror = () => setWsStatus('error');
    ws.onclose = () => {
      webrtc.leaveRoom();
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomName, participantName]);

  const handleClose = () => {
    wsRef.current?.close();
    wsRef.current = null;
    webrtc.leaveRoom();
    onClose();
  };

  const peers = webrtc.peers;
  const myStream = webrtc.myStream;
  const videoEnabled = webrtc.videoEnabled;
  const audioEnabled = webrtc.audioEnabled;

  const cols = peers.length === 0 ? 1 : peers.length <= 1 ? 2 : 3;

  return (
    <PhoneCard style={{ marginTop: 16, border: `1px solid ${primary(0.3)}` }}>
      <PhoneCardHeader accent={primary(0.7)} style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Video size={12} />
          VIDEO — {roomName}
          {wsStatus === 'connecting' && <span style={{ color: warning(0.6), fontSize: '0.45rem' }}>CONNECTING...</span>}
          {wsStatus === 'connected' && <span style={{ color: slate(0.5), fontSize: '0.45rem' }}>● LIVE · {peers.length + 1} PARTICIPANT{peers.length !== 0 ? 'S' : ''}</span>}
          {wsStatus === 'error' && <span style={{ color: destructive(0.7), fontSize: '0.45rem' }}>SIGNAL ERROR</span>}
        </span>
        <button onClick={handleClose} style={{ background: 'none', border: 'none', color: destructive(0.5), cursor: 'pointer', padding: 0 }}>
          <X size={14} />
        </button>
      </PhoneCardHeader>

      <div style={{ padding: 12 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 6,
          marginBottom: 10 }}>
          <div style={{
            aspectRatio: '4/3',
            background: slate(0.7),
            borderRadius: 6,
            overflow: 'hidden',
            position: 'relative',
            border: `1px solid ${primary(0.2)}` }}>
            {myStream && videoEnabled ? (
              <video
                ref={el => { if (el && myStream) { el.srcObject = myStream; el.muted = true; el.play().catch(() => {}); } }}
                autoPlay muted playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '1.8rem', opacity: 0.3 }}>👤</div>
                {!videoEnabled && <span style={{ fontSize: '0.4rem', color: slate(0.55), letterSpacing: '0.1em' }}>CAM OFF</span>}
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: 4, left: 6,
              fontSize: '0.38rem', color: primary(0.7),
              background: slate(0.7), padding: '1px 5px', borderRadius: 2 }}>
              YOU{!audioEnabled ? ' · MUTED' : ''}
            </div>
          </div>

          {peers.map(peer => (
            <div key={peer.id} style={{
              aspectRatio: '4/3',
              background: slate(0.7),
              borderRadius: 6,
              overflow: 'hidden',
              position: 'relative',
              border: `1px solid ${primary(0.15)}` }}>
              {peer.stream ? (
                <video
                  ref={el => { if (el && peer.stream) { el.srcObject = peer.stream; el.play().catch(() => {}); } }}
                  autoPlay playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: '1.8rem', opacity: 0.4 }}>👤</div>
                  <div style={{ fontSize: '0.38rem', color: primary(0.55), letterSpacing: '0.08em' }}>CONNECTING...</div>
                </div>
              )}
              <div style={{
                position: 'absolute', bottom: 4, left: 6,
                fontSize: '0.38rem', color: primary(0.7),
                background: slate(0.7), padding: '1px 5px', borderRadius: 2 }}>
                {peer.name}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <PhoneBtn
            onClick={webrtc.toggleAudio}
            color={audioEnabled ? primary : destructive}
            size="sm"
            title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
            {audioEnabled ? 'MIC ON' : 'MIC OFF'}
          </PhoneBtn>
          <PhoneBtn
            onClick={webrtc.toggleVideo}
            color={videoEnabled ? primary : destructive}
            size="sm"
            title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {videoEnabled ? <Video size={12} /> : <VideoOff size={12} />}
            {videoEnabled ? 'CAM ON' : 'CAM OFF'}
          </PhoneBtn>
          <PhoneBtn onClick={handleClose} color={destructive} size="sm">
            <VideoOff size={12} /> END VIDEO
          </PhoneBtn>
        </div>

        {peers.length === 0 && wsStatus === 'connected' && (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.45rem', color: slate(0.55), letterSpacing: '0.1em' }}>
            WAITING FOR OTHER BROWSER PARTICIPANTS TO ENABLE VIDEO
          </div>
        )}
      </div>
    </PhoneCard>
  );
}

export default function PhoneConferencePage() {
  const isMobile = useIsMobile();

  const BASE = import.meta.env.BASE_URL;
  useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };

  const [conferences, setConferences] = useState<ConferenceRoom[]>([]);
  const [confRoomName, setConfRoomName] = useState('');
  const [confAddNumber, setConfAddNumber] = useState('');
  const [confAddName, setConfAddName] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [videoRooms, setVideoRooms] = useState<Set<string>>(new Set());

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const fetchConferences = useCallback(() => {
    apiFetch(apiUrl('twilio/conference/list'), { credentials: 'include' })
      .then(async r => {
        if (r.status === 403) { navigate('/pricing'); return; }
        if (r.ok) { const d = await r.json(); if (d?.rooms) setConferences(d.rooms); }
        else { setError(`Failed to load conferences (${r.status})`); }
      })
      .catch(() => setError('Network error loading conferences'))
      .finally(() => setLoading(false));
  }, [apiUrl, navigate]);

  useEffect(() => { fetchConferences(); }, [fetchConferences]);

  const createConference = async () => {
    setCreating(true);
    setError('');
    try {
      const r = await apiFetch(apiUrl('twilio/conference/create'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: confRoomName || 'New Conference' }) });
      if (r.status === 403) { navigate('/pricing'); return; }
      if (r.ok) {
        fetchConferences();
        setConfRoomName('');
      } else {
        const d = await r.json().catch(() => ({}));
        setError((d as { error?: string }).error || 'Failed to create conference room');
      }
    } catch { setError('Network error — could not create conference room'); }
    setCreating(false);
  };

  const addToConference = async (roomName: string) => {
    if (!confAddNumber) return;
    setError('');
    try {
      const r = await apiFetch(apiUrl(`twilio/conference/${encodeURIComponent(roomName)}/add`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber: confAddNumber, name: confAddName }) });
      if (r.status === 403) { navigate('/pricing'); return; }
      if (r.ok) {
        setConfAddNumber(''); setConfAddName('');
        fetchConferences();
      } else {
        const d = await r.json().catch(() => ({}));
        setError((d as { error?: string }).error || 'Failed to add participant to conference');
      }
    } catch { setError('Network error — could not add participant'); }
  };

  const endConference = async (roomName: string) => {
    setError('');
    try {
      const r = await apiFetch(apiUrl(`twilio/conference/${encodeURIComponent(roomName)}/end`), { method: 'POST', credentials: 'include' });
      if (r.status === 403) { navigate('/pricing'); return; }
      if (r.ok) {
        setVideoRooms(prev => { const next = new Set(prev); next.delete(roomName); return next; });
        fetchConferences();
      }
      else setError('Failed to end conference');
    } catch { setError('Network error — could not end conference'); }
  };

  const toggleVideo = (roomName: string) => {
    setVideoRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomName)) next.delete(roomName);
      else next.add(roomName);
      return next;
    });
  };

  const parseParticipants = (json: string | null): Array<{ phone: string; name: string; callSid: string; muted: boolean }> => {
    try { return JSON.parse(json ?? '[]'); } catch { return []; }
  };

  const totalParticipants = conferences.reduce((a, r) => a + parseParticipants(r.participantsJson).length, 0);
  const activeRooms = conferences.filter(r => r.status === 'active').length;

  return (
    <PhonePageLayout
      title="CONFERENCE"
      subtitle="Multi-party conference room management and participant control"
      icon={<Users size={24} style={{ color: slate(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MiniWaveform active={activeRooms > 0} bars={4} color={primary} />
          <span style={{ color: activeRooms > 0 ? primary(0.5) : slate(0.2) }}>
            {activeRooms > 0 ? `${activeRooms} ACTIVE ROOM${activeRooms !== 1 ? 'S' : ''}` : 'NO ACTIVE ROOMS'}
          </span>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: destructive(0.05), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="CONFERENCE ROOMS" value={conferences.length} />
        <StatBlock label="ACTIVE" value={activeRooms} color={activeRooms > 0 ? slate : undefined} sub={activeRooms > 0 ? 'in session' : 'idle'} />
        <StatBlock label="PARTICIPANTS" value={totalParticipants} color={primary} sub="connected" />
        <StatBlock label="CAPACITY" value="∞" color={accent} sub="unlimited" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={creating ? warning(0.5) : undefined}>
              {creating ? 'CREATING ROOM...' : 'CREATE CONFERENCE ROOM'}
            </PhoneCardHeader>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>ROOM NAME</label>
                <input
                  value={confRoomName}
                  onChange={e => setConfRoomName(e.target.value)}
                  placeholder="e.g. Sales Standup, Client Review..."
                  style={INPUT_STYLE}
                  onKeyDown={e => e.key === 'Enter' && createConference()}
                />
              </div>
              <PhoneBtn onClick={createConference} disabled={creating} color={primary} style={{ justifyContent: 'center', height: 44 }} size="lg">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? 'CREATING...' : 'CREATE ROOM'}
              </PhoneBtn>
            </div>
          </PhoneCard>

          {selectedRoom && (
            <PhoneCard>
              <PhoneCardHeader accent={primary(0.5)}>ADD PARTICIPANT TO "{selectedRoom}"</PhoneCardHeader>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>NAME</label>
                  <input value={confAddName} onChange={e => setConfAddName(e.target.value)} placeholder="Participant name..." style={INPUT_STYLE} />
                </div>
                <div>
                  <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>PHONE NUMBER *</label>
                  <input value={confAddNumber} onChange={e => setConfAddNumber(e.target.value)} placeholder="+1 555 000 0000" style={INPUT_STYLE} onKeyDown={e => { if (e.key === 'Enter' && confAddNumber) addToConference(selectedRoom); }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <PhoneBtn onClick={() => addToConference(selectedRoom)} disabled={!confAddNumber} color={primary} style={{ flex: 1, justifyContent: 'center' }}>
                    <Plus size={12} /> ADD TO ROOM
                  </PhoneBtn>
                  <PhoneBtn onClick={() => { setSelectedRoom(null); setConfAddNumber(''); setConfAddName(''); }} color={destructive} size="sm">
                    <X size={12} />
                  </PhoneBtn>
                </div>
              </div>
            </PhoneCard>
          )}

          <PhoneCard>
            <PhoneCardHeader>CONFERENCE TIPS</PhoneCardHeader>
            <div style={{ padding: 14 }}>
              {[
                ['CREATE', 'Start a new conference room with a label'],
                ['ADD', 'Dial participants into the room by phone number'],
                ['VIDEO', 'Enable webcam video for browser participants'],
                ['END', 'Close the room to disconnect all participants'],
              ].map(([step, desc]) => (
                <div key={step} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.45rem', color: primary(0.6), letterSpacing: '0.15em', marginBottom: 2 }}>{step}</div>
                  <div style={{ fontSize: '0.5rem', color: slate(0.55) }}>{desc}</div>
                </div>
              ))}
            </div>
          </PhoneCard>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>CONFERENCE ROOMS</span>
              <span style={{ color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>{conferences.length} ROOMS</span>
            </PhoneCardHeader>

            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.6rem', color: slate(0.55), letterSpacing: '0.15em' }}>LOADING CONFERENCES...</div>
            ) : conferences.length === 0 ? (
              <EmptyState message="NO CONFERENCE ROOMS — CREATE ONE TO START A MULTI-PARTY CALL" icon={<Users size={32} />} />
            ) : (
              conferences.map((room, ri) => {
                const participants = parseParticipants(room.participantsJson);
                const isSelected = selectedRoom === room.roomName;
                const isActive = room.status === 'active';
                const isVideoOn = videoRooms.has(room.roomName);
                const colorFn = ROOM_COLORS[ri % ROOM_COLORS.length];
                return (
                  <div key={room.id} style={{
                    borderBottom: `1px solid ${slate(0.06)}`,
                    background: isSelected ? primary(0.03) : 'transparent',
                    transition: 'background 0.15s' }}>
                    <div style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                          background: slate(0.02),
                          border: `1px solid ${colorFn(isActive ? 0.25 : 0.1)}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',

                          position: 'relative' }}>
                          <Users size={18} style={{ color: colorFn(isActive ? 0.7 : 0.3) }} />
                          <div style={{
                            position: 'absolute', bottom: -2, right: -2,
                            width: 10, height: 10, borderRadius: '50%',
                            background: isActive ? slate(0.8) : slate(0.2),
                            border: `2px solid ${slate(0.1)}`,

                            animation: isActive ? 'pulse 2s infinite' : 'none' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', color: slate(0.9), wordBreak: 'break-all' }}>{room.roomName}</div>
                          <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 3,
                              background: isActive ? slate(0.06) : slate(0.03),
                              border: `1px solid ${isActive ? slate(0.2) : slate(0.08)}`,
                              color: isActive ? slate(0.7) : slate(0.3) }}>
                              {room.status.toUpperCase()}
                            </span>
                            <span>{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
                            {isVideoOn && (
                              <span style={{ color: primary(0.7), display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Video size={9} /> VIDEO ACTIVE
                              </span>
                            )}
                          </div>
                          {participants.length > 0 && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {participants.map((p, i) => (
                                <div key={i} style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '6px 10px', borderRadius: 6,
                                  background: slate(0.4),
                                  border: `1px solid ${slate(0.06)}` }}>
                                  <div style={{
                                    width: 24, height: 24, borderRadius: 6,
                                    background: slate(0.02),
                                    border: `1px solid ${ROOM_COLORS[(ri + i) % ROOM_COLORS.length](0.15)}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.55rem', color: ROOM_COLORS[(ri + i) % ROOM_COLORS.length](0.6),
                                    flexShrink: 0 }}>
                                    {(p.name?.[0] || '#').toUpperCase()}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: '0.55rem', color: slate(0.6) }}>{p.name || 'Unknown'}</span>
                                    <span style={{ fontSize: '0.45rem', color: slate(0.55), marginLeft: 8 }}>{formatPhone(p.phone)}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {p.muted ? (
                                      <MicOff size={10} style={{ color: warning(0.6) }} />
                                    ) : (
                                      <MiniWaveform active bars={3} />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <PhoneBtn
                            onClick={() => toggleVideo(room.roomName)}
                            color={isVideoOn ? primary : slate}
                            size="sm"
                            title={isVideoOn ? 'Disable video' : 'Enable video for this room'}

                          >
                            {isVideoOn ? <Video size={12} /> : <VideoOff size={12} />}
                          </PhoneBtn>
                          <PhoneBtn onClick={() => setSelectedRoom(isSelected ? null : room.roomName)} color={primary} size="sm" title="Add participant">
                            <Plus size={12} />
                          </PhoneBtn>
                          <PhoneBtn onClick={() => endConference(room.roomName)} color={destructive} size="sm" title="End conference">
                            <PhoneOff size={12} />
                          </PhoneBtn>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </PhoneCard>

          {conferences.filter(r => videoRooms.has(r.roomName)).map(room => (
            <ConferenceVideoPanel
              key={room.roomName}
              roomName={room.roomName}
              participantName="HOST"
              onClose={() => toggleVideo(room.roomName)}
            />
          ))}
        </div>
      </div>
    </PhonePageLayout>
  );
}
