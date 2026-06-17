import { useRef, useState, useCallback, useEffect } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface WebRTCPeer {
  id: string;
  name: string;
  stream?: MediaStream;
}

interface SignalMessage {
  targetId: string;
  signal: { type: 'offer' | 'answer' | 'ice'; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
}

export interface UseWebRTCOptions {
  onSendSignal: (msg: SignalMessage) => void;
  onPeersChange?: (peers: WebRTCPeer[]) => void;
}

export function useWebRTC({ onSendSignal, onPeersChange }: UseWebRTCOptions) {
  const [peers, setPeers] = useState<WebRTCPeer[]>([]);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [active, setActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const myStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peersRef = useRef<WebRTCPeer[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const isScreenSharingRef = useRef(false);
  const onSendSignalRef = useRef(onSendSignal);
  onSendSignalRef.current = onSendSignal;
  const onPeersChangeRef = useRef(onPeersChange);
  onPeersChangeRef.current = onPeersChange;

  const updatePeers = useCallback((updater: (prev: WebRTCPeer[]) => WebRTCPeer[]) => {
    setPeers(prev => {
      const next = updater(prev);
      peersRef.current = next;
      onPeersChangeRef.current?.(next);
      return next;
    });
  }, []);

  const createPeerConnection = useCallback((peerId: string, peerName: string, initiator: boolean) => {
    if (peerConnectionsRef.current.has(peerId)) return peerConnectionsRef.current.get(peerId)!;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(peerId, pc);

    if (myStreamRef.current) {
      for (const track of myStreamRef.current.getTracks()) {
        pc.addTrack(track, myStreamRef.current);
      }
    }

    // If a screen share is already in progress, send the screen track to this
    // newly-created connection instead of the camera (or in addition, if there
    // is no camera track at all).
    if (isScreenSharingRef.current && screenTrackRef.current) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(screenTrackRef.current).catch(() => {});
      } else if (screenStreamRef.current) {
        try { pc.addTrack(screenTrackRef.current, screenStreamRef.current); } catch {}
      }
    }

    pc.onicecandidate = e => {
      if (e.candidate) {
        onSendSignalRef.current({ targetId: peerId, signal: { type: 'ice', candidate: e.candidate } });
      }
    };

    pc.ontrack = e => {
      const stream = e.streams[0];
      updatePeers(prev => {
        const idx = prev.findIndex(p => p.id === peerId);
        if (idx === -1) return [...prev, { id: peerId, name: peerName, stream }];
        const updated = [...prev];
        updated[idx] = { ...updated[idx], stream };
        return updated;
      });
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          onSendSignalRef.current({ targetId: peerId, signal: { type: 'offer', sdp: pc.localDescription! } });
        } catch {}
      };
    }

    return pc;
  }, [updatePeers]);

  const handleSignal = useCallback(async (fromId: string, fromName: string, signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
    if (signal.type === 'offer') {
      if (!peerConnectionsRef.current.has(fromId)) {
        createPeerConnection(fromId, fromName, false);
        updatePeers(prev => prev.find(p => p.id === fromId) ? prev : [...prev, { id: fromId, name: fromName }]);
      }
      const pc = peerConnectionsRef.current.get(fromId)!;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
        const queued = iceCandidateQueueRef.current.get(fromId) ?? [];
        for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
        iceCandidateQueueRef.current.delete(fromId);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        onSendSignalRef.current({ targetId: fromId, signal: { type: 'answer', sdp: pc.localDescription! } });
      } catch {}
    } else if (signal.type === 'answer') {
      const pc = peerConnectionsRef.current.get(fromId);
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
          const queued = iceCandidateQueueRef.current.get(fromId) ?? [];
          for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
          iceCandidateQueueRef.current.delete(fromId);
        } catch {}
      }
    } else if (signal.type === 'ice') {
      const pc = peerConnectionsRef.current.get(fromId);
      if (pc && signal.candidate) {
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch {}
        } else {
          if (!iceCandidateQueueRef.current.has(fromId)) iceCandidateQueueRef.current.set(fromId, []);
          iceCandidateQueueRef.current.get(fromId)!.push(signal.candidate);
        }
      }
    }
  }, [createPeerConnection, updatePeers]);

  const joinRoom = useCallback(async (initialPeers: { id: string; name: string }[], withVideo = true) => {
    let stream: MediaStream | null = null;
    let vid = withVideo;
    let aud = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: withVideo, audio: true });
    } catch {
      if (withVideo) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          vid = false;
        } catch {
          stream = null;
          vid = false;
          aud = false;
        }
      } else {
        stream = null;
        aud = false;
      }
    }

    myStreamRef.current = stream;
    setMyStream(stream);
    setVideoEnabled(vid);
    setAudioEnabled(aud);
    setActive(true);

    const initialPeerList = initialPeers.map(p => ({ id: p.id, name: p.name }));
    peersRef.current = initialPeerList;
    setPeers(initialPeerList);

    for (const peer of initialPeers) {
      createPeerConnection(peer.id, peer.name, true);
    }
  }, [createPeerConnection]);

  const addPeer = useCallback((peerId: string, peerName: string) => {
    updatePeers(prev => prev.find(p => p.id === peerId) ? prev : [...prev, { id: peerId, name: peerName }]);
    createPeerConnection(peerId, peerName, false);
  }, [createPeerConnection, updatePeers]);

  const removePeer = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) { pc.close(); peerConnectionsRef.current.delete(peerId); }
    iceCandidateQueueRef.current.delete(peerId);
    updatePeers(prev => prev.filter(p => p.id !== peerId));
  }, [updatePeers]);

  const toggleVideo = useCallback(() => {
    if (myStreamRef.current) {
      const t = myStreamRef.current.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; setVideoEnabled(t.enabled); }
    }
  }, []);

  const toggleAudio = useCallback(() => {
    if (myStreamRef.current) {
      const t = myStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setAudioEnabled(t.enabled); }
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharingRef.current) return;
    const screenTrack = screenTrackRef.current;
    const cameraTrack = cameraTrackRef.current;
    for (const pc of peerConnectionsRef.current.values()) {
      const sender = pc.getSenders().find(s => s.track === screenTrack || s.track?.kind === 'video');
      if (sender) { try { await sender.replaceTrack(cameraTrack ?? null); } catch {} }
    }
    screenTrack?.stop();
    screenTrackRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);
  }, []);

  const startScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) { stream.getTracks().forEach(t => t.stop()); return; }

    screenStreamRef.current = stream;
    screenTrackRef.current = track;
    cameraTrackRef.current = myStreamRef.current?.getVideoTracks()[0] ?? null;

    for (const pc of peerConnectionsRef.current.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) { try { await sender.replaceTrack(track); } catch {} }
      else { try { pc.addTrack(track, stream); } catch {} }
    }

    // Stop sharing if the user ends it from the browser's native control.
    track.addEventListener('ended', () => { void stopScreenShare(); });

    isScreenSharingRef.current = true;
    setIsScreenSharing(true);
    setScreenStream(stream);
  }, [stopScreenShare]);

  const leaveRoom = useCallback(() => {
    myStreamRef.current?.getTracks().forEach(t => t.stop());
    myStreamRef.current = null;
    setMyStream(null);
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    iceCandidateQueueRef.current.clear();
    peersRef.current = [];
    setPeers([]);
    setActive(false);
    setVideoEnabled(true);
    setAudioEnabled(true);
  }, []);

  useEffect(() => () => { leaveRoom(); }, [leaveRoom]);

  return {
    peers,
    myStream,
    videoEnabled,
    audioEnabled,
    active,
    isScreenSharing,
    screenStream,
    joinRoom,
    addPeer,
    removePeer,
    handleSignal,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
    leaveRoom,
  };
}
