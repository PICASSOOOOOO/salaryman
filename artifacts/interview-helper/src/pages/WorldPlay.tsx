import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 1600, H = 1200, TILE = 32, SPD = 2.5, PSIZE = 8, RANGE = 55;
const WASTELAND_Y = 560;

const BUILDINGS = [
  { id: 'pablo_store',  x: 370, y: 310, w: 120, h: 70,  label: 'PABLO CORP.',   bright: true  },
  { id: 'pablo_tower',  x: 580, y:  40, w: 260, h: 230, label: 'PABLO TOWER',   bright: true  },
  { id: 'clinic',       x: 180, y: 370, w: 100, h: 70,  label: 'MED CLINIC',    bright: false },
  { id: 'megabank',     x: 410, y: 420, w: 120, h: 80,  label: 'MOGUL BANK',    bright: false },
  { id: 'market',       x: 720, y: 360, w: 110, h: 70,  label: 'BLACK MARKET',  bright: false },
  { id: 'hotel',        x: 920, y: 190, w: 100, h: 120, label: 'HOTEL NEON',    bright: false },
  { id: 'vend',         x: 920, y: 370, w: 60,  h: 60,  label: 'VEND-O-MATIC',  bright: true  },
  { id: 'bunker',       x: 300, y: 700, w: 130, h: 80,  label: 'BUNKER-09',     bright: false },
  { id: 'scrap',        x: 580, y: 720, w: 160, h: 70,  label: 'SCRAP YARD',    bright: false },
  { id: 'radio',        x: 820, y: 680, w: 100, h: 90,  label: 'PIRATE RADIO',  bright: false },
];

// ── Gang territories (wasteland) ──────────────────────────────────────────────
const GANG_ZONES = [
  { id: 'iron_rats',    name: 'IRON RATS',    x: 100,  y: 580, w: 420, h: 340, color: 'rgba(255,60,60,.06)',  border: 'rgba(255,60,60,.22)',  threat: 'rgba(255,60,60,.7)',  label: '[ IRON RATS TERRITORY ]' },
  { id: 'void_dogs',    name: 'VOID DOGS',    x: 480,  y: 620, w: 380, h: 380, color: 'rgba(255,140,0,.06)', border: 'rgba(255,140,0,.22)',  threat: 'rgba(255,140,0,.7)',  label: '[ VOID DOGS TERRITORY ]' },
  { id: 'static_monks', name: 'STATIC MONKS', x: 820,  y: 580, w: 420, h: 360, color: 'rgba(200,255,0,.05)', border: 'rgba(200,255,0,.18)',  threat: 'rgba(200,255,0,.65)', label: '[ STATIC MONKS TERRITORY ]' },
];

const NPCS = [
  { name: 'WORKER',  x: 510, y: 380, type: 'corp',    whisper: 'Nobody\'s seen him in years. The lights on top never go dark though. Never.' },
  { name: 'BROKER',  x: 760, y: 320, type: 'corp',    whisper: 'PABLO controls every credit in this city. The ones you earn. The ones you owe. All of them.' },
  { name: 'UNIT-7',  x: 870, y: 350, type: 'android', whisper: 'PABLO Corp. directive 44-C: monitor and report. I am compliant. Are you?' },
  { name: 'DRIFTER', x: 340, y: 460, type: 'human',   whisper: 'I saw a shadow move in the penthouse once. Just once. I left the city the next day. Came back broke.' },
  { name: 'GUARD',   x: 560, y: 300, type: 'corp',    whisper: 'Floor 40 and above. Permanent restriction. Don\'t ask who gave the order.' },
  { name: 'SCAV',    x: 450, y: 770, type: 'human',   whisper: 'Out here we don\'t say his name. Real bad luck. You see that tower? Don\'t look up.' },
  { name: 'MUTANT',  x: 700, y: 810, type: 'mutant',  whisper: 'The tower watches. Before the war, after the war... always that tower.' },
];
const NPC_COL: Record<string, string> = { corp: '#00cc33', human: '#009922', android: '#33ffaa', mutant: '#88ff44' };

interface Threat { x: number; y: number; dx: number; dy: number; type: string; timer: number; }
const THREATS_INIT: Threat[] = [
  { x: 240, y: 680, dx: 0, dy: 0, type: 'IRON_RATS',    timer: 0 },
  { x: 350, y: 820, dx: 0, dy: 0, type: 'IRON_RATS',    timer: 0 },
  { x: 560, y: 750, dx: 0, dy: 0, type: 'VOID_DOGS',    timer: 0 },
  { x: 680, y: 840, dx: 0, dy: 0, type: 'VOID_DOGS',    timer: 0 },
  { x: 900, y: 700, dx: 0, dy: 0, type: 'STATIC_MONKS', timer: 0 },
  { x: 1020,y: 820, dx: 0, dy: 0, type: 'STATIC_MONKS', timer: 0 },
  { x: 500, y: 780, dx: 0, dy: 0, type: 'MUTANT',       timer: 0 },
  { x: 750, y: 500, dx: 0, dy: 0, type: 'RAIDER',       timer: 0 },
];
const THREAT_COL: Record<string, string> = {
  IRON_RATS: '#ff4444', VOID_DOGS: '#ff8800', STATIC_MONKS: '#aaff22',
  MUTANT: '#88ff44', RAIDER: '#ff66ff', GANG: '#ff4444',
};

const NPC_RANGE = 60;

const STORE_LINES = [
  '> PABLO CORP. — AUTHORIZED DEVICE OUTLET',
  '> The city belongs to him. The wasteland is for those who forgot that.',
  '> A PABLO device keeps you on the network. Off the network, you don\'t exist.',
  '> Activate yours and stay connected to his world.',
  '> Press ACTIVATE to register your device.',
];

const TOWER_LINES = [
  '> PABLO TOWER — 62 FLOORS. CITY DESIGNATION: BLOCK ZERO.',
  '> Every road in this city was built to point here.',
  '> Floors 1-39: commercial rentals. Floors 40+: permanently restricted.',
  '> You look up. The penthouse glass is dark. A silhouette shifts. Slowly.',
  '> They say he watches every transaction in the city from up there.',
  '> PABLO. Nobody knows his real name. Nobody asks twice.',
];

const OFFICE_TIERS = [
  { label: 'HOT DESK',       price: 50,   desc: 'Open floor. Shared terminal.' },
  { label: 'PRIVATE OFFICE', price: 200,  desc: 'Single room. Lock code.' },
  { label: 'TEAM SUITE',     price: 500,  desc: '4 desks. Secure entry.' },
  { label: 'EXEC FLOOR',     price: 1500, desc: 'Full suite. AI concierge.' },
];

interface Char { name: string; class: string; company: string; sx: number; sy: number; salary: number; }
interface Peer { id: string; name: string; class: string; x: number; y: number; speaking: boolean; }
interface OwnerStats { count: number; company: string; buildings: string[]; }
interface ChatMsg { id: number; from: string; text: string; dm?: boolean; }

let seq = 0;

// ── Password prompt ───────────────────────────────────────────────────────────
function PwPrompt({ label, onOk, onCancel }: { label: string; onOk: (pw: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('');
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,4,0,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
      <div style={{ width: 300, border: '1px solid rgba(0,255,65,.5)', background: 'rgba(0,10,0,.98)', padding: '1.4rem' }}>
        <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.3rem', color: '#00ff41', letterSpacing: '.1em', marginBottom: '.25rem' }}>🔒 {label}</div>
        <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.08em', marginBottom: '.8rem' }}>SECURITY CODE REQUIRED</div>
        <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && v.trim() && onOk(v.trim())} type="password" placeholder="••••••••" autoFocus style={{ width: '100%', padding: '.5rem .6rem', background: 'rgba(0,10,0,.9)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.9rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box', marginBottom: '.7rem' }} />
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button onClick={() => v.trim() && onOk(v.trim())} style={{ flex: 1, padding: '.4rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.5)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '.95rem', letterSpacing: '.1em', cursor: 'pointer' }}>UNLOCK</button>
          <button onClick={onCancel} style={{ padding: '.4rem .75rem', background: 'transparent', border: '1px solid rgba(0,255,65,.15)', color: 'rgba(0,255,65,.3)', fontFamily: "'VT323',monospace", fontSize: '.9rem', cursor: 'pointer' }}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── WorldPlay ─────────────────────────────────────────────────────────────────
export default function WorldPlay() {
  const [, navigate] = useLocation();
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const gameRef       = useRef<HTMLDivElement>(null);
  const wsRef         = useRef<WebSocket | null>(null);
  const animRef       = useRef(0);
  const peerConns     = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStream   = useRef<MediaStream | null>(null);
  const audioCtx      = useRef<AudioContext | null>(null);
  const frozenRef     = useRef(false);

  // Load character from localStorage (set by WorldMenu)
  const [char] = useState<Char | null>(() => {
    try { const s = localStorage.getItem('sm_char'); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  // Redirect to menu if no character
  useEffect(() => { if (!char) navigate('/world'); }, [char]);
  if (!char) return null;

  // Auto-focus game container so keyboard events fire immediately
  useEffect(() => { gameRef.current?.focus(); }, []);

  const gs = useRef({
    px: char.sx, py: char.sy,
    cam: { x: 0, y: 0 },
    keys: new Set<string>(),
    frame: 0, blink: 0,
    hp: 100, salary: char.salary,
    hasDevice: false,
    invincible: 0, flash: 0,
    threats: THREATS_INIT.map(t => ({ ...t })),
    near: null as string | null,
    nearNpc: null as number | null,
    gangZone: null as string | null,
    hunger: 100, thirst: 100, energy: 100,
    survivalTick: 0,
    myId: '',
    peers: new Map<string, Peer>(),
    speakingSet: new Set<string>(),
    locks: new Map<string, { ownerName: string; company?: string; message?: string }>(),
    zone: char.sy >= WASTELAND_Y ? 'WASTELAND' : 'CITY',
  });

  // Reactive state (only what the HUD needs)
  const [hp,      setHp]      = useState(100);
  const [salary,  setSalary]  = useState(char.salary);
  const [zone,    setZone]    = useState(char.sy >= WASTELAND_Y ? 'WASTELAND' : 'CITY');
  const [near,     setNear]    = useState<string | null>(null);
  const [nearNpc,  setNearNpc] = useState<number | null>(null);
  const [narration, setNarr]  = useState('> Find PABLO CORP. Walk to a building or NPC and press [E].');
  const [isDead,  setIsDead]  = useState(false);
  const [online,  setOnline]  = useState<Peer[]>([]);
  const [hasDevice, setHasDevice] = useState(false);
  const [voice,   setVoice]   = useState(false);
  const [speaking,setSpeaking]= useState(false);
  const [speakIds,setSpeakIds]= useState<Set<string>>(new Set());

  // Chat
  const [chatOpen,  setChatOpen]  = useState(false);
  const [chatIn,    setChatIn]    = useState('');
  const [chatMsgs,  setChatMsgs]  = useState<ChatMsg[]>([]);
  const [dmTarget,  setDmTarget]  = useState<Peer | null>(null);
  const [unread,    setUnread]    = useState(0);

  // Panels
  const [dialog,   setDialog]   = useState<{ lines: string[]; idx: number; bid: string } | null>(null);
  const [showStore,setShowStore] = useState(false);
  const [showOffice,setShowOffice] = useState(false);
  const [showPablo,setShowPablo]= useState(false);
  const [pabloMsgs,setPabloMsgs]= useState<{ role: 'user' | 'pablo'; text: string }[]>([]);
  const [pabloIn,  setPabloIn]  = useState('');
  const [pabloLoad,setPabloLoad]= useState(false);
  const [pwPrompt, setPwPrompt] = useState<{ bid: string; label: string; mode: 'enter'|'set' } | null>(null);
  const [pendingBid,setPendingBid]=useState<string|null>(null);
  const [lockMap,  setLockMap]  = useState<Map<string,{ownerName:string;company?:string;message?:string}>>(new Map());
  const [rentedOffice,setRentedOffice]=useState<string|null>(()=>localStorage.getItem('sm_office'));
  const [hunger,      setHunger]      = useState(100);
  const [thirst,      setThirst]      = useState(100);
  const [energy,      setEnergy]      = useState(100);
  const [gangZone,    setGangZone]    = useState<string|null>(null);
  const [ownerStats,  setOwnerStats]  = useState<Record<string,OwnerStats>>({});
  const [showStats,   setShowStats]   = useState(false);
  const [serverFull,  setServerFull]  = useState(false);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const wsSend = useCallback((m: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(m));
  }, []);

  const enterBuilding = useCallback((bid: string) => {
    const g = gs.current;
    if (bid === 'pablo_store')  { setDialog({ lines: STORE_LINES, idx: 0, bid }); }
    else if (bid === 'pablo_tower') { setDialog({ lines: TOWER_LINES, idx: 0, bid: 'pablo_tower_enter' }); }
    else if (bid === 'clinic')  { if (g.salary >= 100) { g.hp = 100; g.salary -= 100; setHp(100); setSalary(g.salary); setNarr('> MED CLINIC — [$100] Health fully restored.'); } else setNarr('> MED CLINIC — "Come back with $100."'); }
    else if (bid === 'megabank'){ setNarr('> MOGUL BANK — "Account suspended. Try again never."'); }
    else if (bid === 'market')  { g.salary += 30; setSalary(g.salary); setNarr('> BLACK MARKET — Odd job. +$30. Don\'t ask questions.'); }
    else if (bid === 'hotel')   { g.hp = Math.min(100, g.hp + 40); setHp(g.hp); setNarr('> HOTEL NEON — A few hours\' sleep. HP +40.'); }
    else if (bid === 'vend')    {
      g.hunger = Math.min(100, g.hunger + 30); g.thirst = Math.min(100, g.thirst + 30);
      setHunger(g.hunger); setThirst(g.thirst);
      setNarr('> VEND-O-MATIC — Mystery ration. Hunger +30. Thirst +30.');
    }
    else if (bid === 'bunker')  { setNarr('> BUNKER-09 — Door won\'t budge. Spray-painted: PABLO IS WATCHING.'); }
    else if (bid === 'radio')   { setNarr('> PIRATE RADIO — Static. Broken music. A voice repeating: "He\'s still up there."'); }
    else if (bid === 'scrap')   { g.salary += 20; setSalary(g.salary); setNarr('> SCRAP YARD — Sold scrap. +$20.'); }
  }, []);

  const enterNpc = useCallback((idx: number) => {
    const n = NPCS[idx];
    setDialog({ lines: [`> ${n.name.toUpperCase()}`, `"${n.whisper}"`], idx: 0, bid: 'npc' });
  }, []);

  const tryEnter = useCallback((bid: string) => {
    const lock = gs.current.locks.get(bid);
    if (lock !== undefined) {
      if (!lock.ownerName) { enterBuilding(bid); return; }
      const b = BUILDINGS.find(b => b.id === bid);
      setPendingBid(bid); setPwPrompt({ bid, label: b?.label ?? bid, mode: 'enter' });
    } else {
      setPendingBid(bid); wsSend({ type: 'building_lock_query', buildingId: bid });
    }
  }, [enterBuilding, wsSend]);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const makeUrl = (x: number, y: number) =>
      `${proto}//${location.host}/ws?name=${encodeURIComponent(char.name)}&class=${char.class}&company=${encodeURIComponent(char.company ?? '')}&x=${x}&y=${y}`;
    const ws = new WebSocket(makeUrl(char.sx, char.sy));
    wsRef.current = ws;
    ws.onclose = () => setTimeout(() => {
      if (wsRef.current === ws) {
        const nws = new WebSocket(makeUrl(gs.current.px, gs.current.py));
        wsRef.current = nws;
      }
    }, 3000);
    ws.onmessage = (ev) => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      const g = gs.current;
      if (m.type === 'server_full') {
        setServerFull(true);
      } else if (m.type === 'welcome') {
        g.myId = m.id;
        if (m.locks) {
          const nl = new Map<string, { ownerName: string; company?: string; message?: string }>();
          Object.entries(m.locks).forEach(([bid, v]: any) => {
            nl.set(bid, { ownerName: v.ownerName, company: v.company, message: v.message });
            g.locks.set(bid, v);
          });
          setLockMap(nl);
        }
        if (m.ownershipStats) setOwnerStats(m.ownershipStats);
      } else if (m.type === 'player_list') {
        g.peers.clear();
        (m.players as Peer[]).filter(p => p.id !== g.myId).forEach(p => g.peers.set(p.id, p));
        setOnline((m.players as Peer[]).filter(p => p.id !== g.myId));
      } else if (m.type === 'player_move') { const p = g.peers.get(m.id); if (p) { p.x = m.x; p.y = m.y; } }
      else if (m.type === 'player_speaking') {
        if (m.speaking) g.speakingSet.add(m.id); else g.speakingSet.delete(m.id);
        setSpeakIds(new Set(g.speakingSet));
      } else if (m.type === 'player_left') {
        g.peers.delete(m.id);
        setOnline(prev => prev.filter(p => p.id !== m.id));
        setChatMsgs(prev => [...prev, { id: seq++, from: 'SERVER', text: `${m.name} left.` }]);
      } else if (m.type === 'chat') {
        setChatMsgs(prev => [...prev.slice(-99), { id: seq++, from: m.from, text: m.text, dm: m.room === 'dm' }]);
        if (!chatOpen) setUnread(n => n + 1);
      } else if (m.type === 'ownership_update') {
        setOwnerStats(m.stats ?? {});
      } else if (m.type === 'building_lock_result') {
        if (m.success && (m.action === 'unlock' || m.action === 'open')) {
          g.locks.delete(m.buildingId);
          setLockMap(prev => { const nl = new Map(prev); nl.delete(m.buildingId); return nl; });
          if (pendingBid === m.buildingId) { setPendingBid(null); enterBuilding(m.buildingId); }
        } else if (!m.success) setNarr(`> ACCESS DENIED — ${m.error}`);
        if (m.success && m.action === 'set') setNarr('> Security code set. Building locked to your enterprise.');
        setPwPrompt(null);
      } else if (m.type === 'building_lock_status') {
        if (m.locked) {
          g.locks.set(m.buildingId, { ownerName: m.ownerName ?? '', company: m.company, message: m.message });
          setLockMap(prev => { const nl = new Map(prev); nl.set(m.buildingId, { ownerName: m.ownerName ?? '', company: m.company, message: m.message }); return nl; });
          if (pendingBid === m.buildingId) {
            const b = BUILDINGS.find(b => b.id === m.buildingId);
            if (m.message) setNarr(`> ${b?.label ?? m.buildingId} — LOCKED by ${m.ownerName}${m.company ? ' / ' + m.company : ''}: "${m.message}"`);
            setPwPrompt({ bid: m.buildingId, label: b?.label ?? m.buildingId, mode: 'enter' });
          }
        } else {
          g.locks.delete(m.buildingId);
          setLockMap(prev => { const nl = new Map(prev); nl.delete(m.buildingId); return nl; });
          if (pendingBid === m.buildingId) { setPendingBid(null); enterBuilding(m.buildingId); }
        }
      } else if (m.type === 'building_locked') {
        g.locks.set(m.buildingId, { ownerName: m.ownerName, company: m.company });
        setLockMap(prev => { const nl = new Map(prev); nl.set(m.buildingId, { ownerName: m.ownerName, company: m.company }); return nl; });
      } else if (m.type === 'building_unlocked') {
        g.locks.delete(m.buildingId); setLockMap(prev => { const nl = new Map(prev); nl.delete(m.buildingId); return nl; });
      } else if (m.type === 'voice_offer')  handleVoiceOffer(m.from, m.sdp);
      else if (m.type === 'voice_answer')   handleVoiceAnswer(m.from, m.sdp);
      else if (m.type === 'voice_ice')      handleVoiceICE(m.from, m.candidate);
      else if (m.type === 'voice_peer_joined') initiateVoiceWith(m.id);
    };
    const posInterval = setInterval(() => { const g = gs.current; wsSend({ type: 'move', x: g.px, y: g.py }); }, 120);
    return () => { ws.close(); wsRef.current = null; clearInterval(posInterval); };
  }, [char.name]);

  // ── Voice / WebRTC ─────────────────────────────────────────────────────────
  const mkPeer = (pid: string) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConns.current.set(pid, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.onicecandidate = e => { if (e.candidate) wsSend({ type: 'voice_ice', to: pid, candidate: e.candidate }); };
    pc.ontrack = e => { const a = new Audio(); a.srcObject = e.streams[0]; a.play().catch(() => {}); };
    return pc;
  };
  const initiateVoiceWith = async (pid: string) => {
    if (!localStream.current) return;
    const pc = mkPeer(pid); const offer = await pc.createOffer();
    await pc.setLocalDescription(offer); wsSend({ type: 'voice_offer', to: pid, sdp: offer });
  };
  const handleVoiceOffer = async (fid: string, sdp: RTCSessionDescriptionInit) => {
    if (!localStream.current) return;
    const pc = mkPeer(fid); await pc.setRemoteDescription(sdp);
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    wsSend({ type: 'voice_answer', to: fid, sdp: ans });
  };
  const handleVoiceAnswer = async (fid: string, sdp: RTCSessionDescriptionInit) => { await peerConns.current.get(fid)?.setRemoteDescription(sdp); };
  const handleVoiceICE    = async (fid: string, c: RTCIceCandidateInit)          => { await peerConns.current.get(fid)?.addIceCandidate(c); };

  const toggleVoice = useCallback(async () => {
    if (voice) {
      localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
      peerConns.current.forEach(pc => pc.close()); peerConns.current.clear();
      audioCtx.current?.close(); audioCtx.current = null;
      setVoice(false); setSpeaking(false); wsSend({ type: 'speaking', speaking: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream; setVoice(true); wsSend({ type: 'voice_join' });
        const ctx = new AudioContext(); audioCtx.current = ctx;
        const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser();
        an.fftSize = 256; src.connect(an); const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          if (!localStream.current) return;
          an.getByteFrequencyData(data);
          const spk = data.reduce((a, b) => a + b, 0) / data.length > 12;
          setSpeaking(spk); wsSend({ type: 'speaking', speaking: spk }); requestAnimationFrame(tick);
        };
        tick();
      } catch { setNarr('> VOICE — Mic access denied. Check browser permissions.'); }
    }
  }, [voice, wsSend]);

  // ── Keep frozenRef in sync so game loop never needs to restart for panel changes ──
  useEffect(() => {
    frozenRef.current = !!dialog || showStore || showOffice || showPablo || !!pwPrompt || isDead;
  }, [dialog, showStore, showOffice, showPablo, pwPrompt, isDead]);

  // ── Dialog advance ─────────────────────────────────────────────────────────
  const advDialog = useCallback(() => {
    if (!dialog) return;
    if (dialog.idx < dialog.lines.length - 1) setDialog(d => d ? { ...d, idx: d.idx + 1 } : null);
    else {
      if (dialog.bid === 'pablo_store')      { gs.current.hasDevice = true; setHasDevice(true); setShowStore(true); }
      if (dialog.bid === 'pablo_tower_enter') { setShowOffice(true); }
      setDialog(null);
    }
  }, [dialog]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const MOVE_KEYS = new Set(['arrowleft','arrowright','arrowup','arrowdown','a','s','w','d',' ']);
    const dn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Prevent page scroll on arrow keys, WASD, and space
      if (MOVE_KEYS.has(e.key.toLowerCase()) || MOVE_KEYS.has(e.key)) e.preventDefault();
      gs.current.keys.add(e.key.toLowerCase());
      if (e.key === 'e' || e.key === 'E') {
        if (!frozenRef.current && !chatOpen) {
          const nb = gs.current.near;
          const nn = gs.current.nearNpc;
          if (nb) tryEnter(nb);
          else if (nn !== null) enterNpc(nn);
        }
      }
      if (e.key === 'p' || e.key === 'P') setShowPablo(v => !v);
      if (e.key === 'c' || e.key === 'C') { setChatOpen(v => !v); setUnread(0); }
      if (e.key === 'v' || e.key === 'V') toggleVoice();
      if ((e.key === ' ' || e.key === 'Enter') && dialog) advDialog();
      if (e.key === 'Escape') {
        setDialog(null); setShowStore(false); setShowOffice(false);
        setShowPablo(false); setPwPrompt(null); setPendingBid(null);
      }
    };
    const up = (e: KeyboardEvent) => gs.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [chatOpen, dialog, tryEnter, enterNpc, toggleVoice, advDialog]);

  // ── PABLO AI ──────────────────────────────────────────────────────────────
  const sendPablo = useCallback(async () => {
    if (!pabloIn.trim() || pabloLoad) return;
    const txt = pabloIn.trim(); setPabloIn('');
    setPabloMsgs(m => [...m, { role: 'user', text: txt }]);
    if (!gs.current.hasDevice) { setPabloMsgs(m => [...m, { role: 'pablo', text: '> Device not activated. Visit the PABLO STORE first.' }]); return; }
    setPabloLoad(true);
    try {
      const r = await fetch('/api/advisor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: txt, context: `You are PABLO, a gritty in-world AI for ${char.name} (${char.class}). Be brief and sharp.` }), credentials: 'include' });
      const d = r.ok ? await r.json() : {};
      setPabloMsgs(m => [...m, { role: 'pablo', text: d.response ?? '> Signal lost.' }]);
    } catch { setPabloMsgs(m => [...m, { role: 'pablo', text: '> Network dead.' }]); }
    setPabloLoad(false);
  }, [pabloIn, pabloLoad, char]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); window.addEventListener('resize', resize);
    let lastNear: string | null = null, lastNearNpc: number | null = null, lastZone = '', lastDead = false, lastHp = 100, lastSal = char.salary;
    const frozen = () => frozenRef.current;

    const loop = () => {
      const g = gs.current;
      g.frame++; g.blink = Math.floor(g.frame / 25) % 2;
      if (g.invincible > 0) g.invincible--;
      if (g.flash > 0) g.flash--;

      if (!frozen()) {
        let dx = 0, dy = 0;
        if (g.keys.has('arrowleft')  || g.keys.has('a')) dx -= SPD;
        if (g.keys.has('arrowright') || g.keys.has('d')) dx += SPD;
        if (g.keys.has('arrowup')    || g.keys.has('w')) dy -= SPD;
        if (g.keys.has('arrowdown')  || g.keys.has('s')) dy += SPD;
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
        const col = (px: number, py: number) => BUILDINGS.some(b => px + PSIZE > b.x && px - PSIZE < b.x + b.w && py + PSIZE > b.y && py - PSIZE < b.y + b.h);
        let nx = g.px + dx, ny = g.py + dy;
        if (col(nx, g.py)) nx = g.px;
        if (col(g.px, ny)) ny = g.py;
        g.px = Math.max(PSIZE, Math.min(W - PSIZE, nx));
        g.py = Math.max(PSIZE, Math.min(H - PSIZE, ny));
      }

      for (const t of g.threats) {
        t.timer--;
        const dist = Math.hypot(g.px - t.x, g.py - t.y);
        if (dist < 120) { const ang = Math.atan2(g.py - t.y, g.px - t.x); t.dx = Math.cos(ang) * 1.1; t.dy = Math.sin(ang) * 1.1; }
        else if (t.timer <= 0) { const ang = Math.random() * Math.PI * 2; t.dx = Math.cos(ang) * 0.6; t.dy = Math.sin(ang) * 0.6; t.timer = 80 + Math.floor(Math.random() * 80); }
        t.x = Math.max(10, Math.min(W - 10, t.x + t.dx));
        t.y = Math.max(10, Math.min(H - 10, t.y + t.dy));
        if (dist < 14 && g.invincible === 0) { g.hp = Math.max(0, g.hp - 0.4); g.invincible = 20; g.flash = 6; }
      }

      if (g.hp <= 0 && !lastDead) { lastDead = true; setIsDead(true); }
      if (g.hp !== lastHp) { lastHp = g.hp; setHp(Math.floor(g.hp)); }
      if (g.salary !== lastSal) { lastSal = g.salary; setSalary(g.salary); }

      const cw = canvas.width, ch = canvas.height;
      g.cam.x = Math.max(0, Math.min(W - cw, g.px - cw / 2));
      g.cam.y = Math.max(0, Math.min(H - ch, g.py - ch / 2));
      const ox = -g.cam.x, oy = -g.cam.y;

      // Proximity check — buildings
      let nb: string | null = null;
      for (const b of BUILDINGS) { if (Math.hypot(g.px - (b.x + b.w / 2), g.py - (b.y + b.h / 2)) < RANGE + (b.id === 'pablo_tower' ? 40 : 0)) { nb = b.id; break; } }
      g.near = nb;
      if (nb !== lastNear) {
        lastNear = nb; setNear(nb);
        if (nb) {
          const b = BUILDINGS.find(b => b.id === nb);
          const lk = g.locks.get(nb);
          if (nb === 'pablo_tower') setNarr('> PABLO TOWER — The city trembles at its shadow. [E] to approach.');
          else if (lk?.ownerName) {
            const who = lk.company ? `${lk.ownerName} / ${lk.company}` : lk.ownerName;
            const msg = lk.message ? ` "${lk.message}"` : '';
            setNarr(`> ${b?.label} [LOCKED by ${who}]${msg} — [E] to attempt entry.`);
          }
          else setNarr(`> ${b?.label} — press [E] to enter.`);
        }
      }
      // Proximity check — NPCs (only when no building nearby)
      let nn: number | null = null;
      if (!nb) { for (let i = 0; i < NPCS.length; i++) { if (Math.hypot(g.px - NPCS[i].x, g.py - NPCS[i].y) < NPC_RANGE) { nn = i; break; } } }
      g.nearNpc = nn;
      if (nn !== lastNearNpc) {
        lastNearNpc = nn; setNearNpc(nn);
        if (nn !== null && !nb) setNarr(`> ${NPCS[nn].name} — press [E] to listen.`);
      }

      const newZone = g.py < WASTELAND_Y ? 'CITY' : 'WASTELAND';
      if (newZone !== lastZone) { lastZone = newZone; g.zone = newZone; setZone(newZone); }

      // Gang zone detection
      let newGang: string | null = null;
      for (const gz of GANG_ZONES) {
        if (g.px >= gz.x && g.px <= gz.x + gz.w && g.py >= gz.y && g.py <= gz.y + gz.h) { newGang = gz.id; break; }
      }
      if (newGang !== g.gangZone) { g.gangZone = newGang; setGangZone(newGang); }

      // Survival tick — every 360 frames (~6s)
      g.survivalTick++;
      if (g.survivalTick >= 360) {
        g.survivalTick = 0;
        const inWaste = g.py >= WASTELAND_Y;
        // Hunger/thirst drain faster in wasteland
        g.hunger = Math.max(0, g.hunger - (inWaste ? 2.5 : 1.5));
        g.thirst = Math.max(0, g.thirst - (inWaste ? 3 : 2));
        g.energy = Math.max(0, g.energy - (inWaste ? 1.5 : 1));
        // Low stats affect HP / salary
        if (g.hunger <= 0 || g.thirst <= 0) { g.hp = Math.max(0, g.hp - 2); }
        if (g.energy <= 20) { g.salary = Math.max(0, g.salary - 5); }
        setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); setEnergy(Math.floor(g.energy));
      }

      // ── DRAW ─────────────────────────────────────────────────────────────
      if (g.flash > 0) { ctx.fillStyle = `rgba(255,0,0,${g.flash * .05})`; ctx.fillRect(0, 0, cw, ch); }
      ctx.fillStyle = '#030803'; ctx.fillRect(0, 0, cw, ch);

      // Grid
      ctx.strokeStyle = 'rgba(0,255,65,.04)'; ctx.lineWidth = 1;
      const sgx = Math.floor(g.cam.x / TILE) * TILE, sgy = Math.floor(g.cam.y / TILE) * TILE;
      for (let gx = sgx; gx < g.cam.x + cw + TILE; gx += TILE) { ctx.beginPath(); ctx.moveTo(gx + ox, 0); ctx.lineTo(gx + ox, ch); ctx.stroke(); }
      for (let gy = sgy; gy < g.cam.y + ch + TILE; gy += TILE) { ctx.beginPath(); ctx.moveTo(0, gy + oy); ctx.lineTo(cw, gy + oy); ctx.stroke(); }

      // Zone divider
      const wby = WASTELAND_Y + oy;
      if (wby > 0 && wby < ch) {
        ctx.strokeStyle = 'rgba(0,255,65,.1)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, wby); ctx.lineTo(cw, wby); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,255,65,.15)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('── WASTELAND ──', cw / 2, wby - 5);
      }
      ctx.fillStyle = 'rgba(0,255,65,.02)'; ctx.font = '56px "VT323"'; ctx.textAlign = 'center';
      ctx.fillText(g.py < WASTELAND_Y ? 'CITY' : 'WASTELAND', cw / 2, ch / 2);

      // Gang territory zones
      for (const gz of GANG_ZONES) {
        const gx = gz.x + ox, gy = gz.y + oy;
        if (gx + gz.w < 0 || gx > cw || gy + gz.h < 0 || gy > ch) continue;
        ctx.fillStyle = gz.color;
        ctx.fillRect(gx, gy, gz.w, gz.h);
        ctx.strokeStyle = gz.border;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.strokeRect(gx, gy, gz.w, gz.h);
        ctx.setLineDash([]);
        ctx.fillStyle = gz.border;
        ctx.font = '7px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(gz.label, gx + gz.w / 2, gy + 12);
      }

      // Roads
      ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(0,255,65,.06)';
      ctx.beginPath(); ctx.moveTo(0, 500 + oy); ctx.lineTo(W + ox, 500 + oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(650 + ox, 0); ctx.lineTo(650 + ox, H + oy); ctx.stroke();

      // Buildings
      for (const b of BUILDINGS) {
        const bx = b.x + ox, by = b.y + oy;
        if (bx + b.w < 0 || bx > cw || by + b.h < 0 || by > ch) continue;
        const isNear = nb === b.id;
        const isLocked = g.locks.has(b.id) && !!g.locks.get(b.id)?.ownerName;

        // ── PABLO TOWER — special villain skyscraper rendering ────────────
        if (b.id === 'pablo_tower') {
          // Outer glow pulse
          const pulse = 0.18 + Math.sin(g.frame * 0.03) * 0.08;
          ctx.shadowColor = isNear ? 'rgba(0,255,65,.7)' : 'rgba(80,0,120,.9)';
          ctx.shadowBlur = isNear ? 18 : 28;
          // Main body — dark imposing mass
          const grad = ctx.createLinearGradient(bx, by, bx, by + b.h);
          grad.addColorStop(0, 'rgba(12,2,20,.98)');
          grad.addColorStop(1, 'rgba(4,8,4,.97)');
          ctx.fillStyle = grad; ctx.fillRect(bx, by, b.w, b.h);
          ctx.shadowBlur = 0;
          // Border — purple/green depending on state
          ctx.strokeStyle = isNear ? 'rgba(0,255,65,.9)' : `rgba(140,0,220,${pulse + .3})`;
          ctx.lineWidth = isNear ? 2.5 : 1.5; ctx.strokeRect(bx, by, b.w, b.h);
          // Corner brackets
          const cs2 = 12; ctx.lineWidth = 2;
          ctx.strokeStyle = isNear ? 'rgba(0,255,65,.9)' : 'rgba(140,0,220,.7)';
          [[bx, by, 1, 1], [bx + b.w, by, -1, 1], [bx, by + b.h, 1, -1], [bx + b.w, by + b.h, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
            ctx.beginPath(); ctx.moveTo(cx2, cy2 + (sy as number) * cs2); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + (sx as number) * cs2, cy2); ctx.stroke();
          });
          // Window grid — dark building lit windows
          ctx.fillStyle = `rgba(255,220,120,${.04 + Math.sin(g.frame * 0.02) * .02})`;
          for (let wr = 0; wr < 8; wr++) {
            for (let wc = 0; wc < 10; wc++) {
              const lit = ((wr * 13 + wc * 7 + g.frame * 0) % 17) > 4; // mostly dark
              if (lit) ctx.fillRect(bx + 10 + wc * 22, by + 12 + wr * 24, 8, 14);
            }
          }
          // Penthouse — top band, always lit
          const phY = by + 8;
          ctx.fillStyle = `rgba(255,200,80,${.08 + Math.sin(g.frame * 0.04) * .04})`;
          ctx.fillRect(bx + 8, phY, b.w - 16, 20);
          ctx.strokeStyle = `rgba(255,180,50,${.3 + Math.sin(g.frame * 0.04) * .15})`;
          ctx.lineWidth = 1; ctx.strokeRect(bx + 8, phY, b.w - 16, 20);
          // Penthouse silhouette — PABLO watching
          const silX = bx + b.w / 2 + Math.sin(g.frame * 0.008) * 6;
          const silY = phY + 4;
          ctx.fillStyle = `rgba(0,0,0,${.8 + Math.sin(g.frame * 0.015) * .15})`;
          ctx.fillRect(silX - 4, silY, 8, 14); // body
          ctx.beginPath(); ctx.arc(silX, silY - 3, 4, 0, Math.PI * 2); ctx.fill(); // head
          // Antenna / spire
          ctx.strokeStyle = `rgba(0,255,65,${.4 + Math.sin(g.frame * 0.05) * .2})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(bx + b.w / 2, by); ctx.lineTo(bx + b.w / 2, by - 20); ctx.stroke();
          ctx.fillStyle = `rgba(0,255,65,${.6 + Math.sin(g.frame * 0.1) * .4})`;
          ctx.beginPath(); ctx.arc(bx + b.w / 2, by - 21, 2.5, 0, Math.PI * 2); ctx.fill();
          // Label
          ctx.shadowColor = '#00ff41'; ctx.shadowBlur = isNear ? 10 : 4;
          ctx.fillStyle = isNear ? '#00ff41' : 'rgba(180,0,255,.8)';
          ctx.font = 'bold 11px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('PABLO TOWER', bx + b.w / 2, by + b.h / 2 + 4);
          ctx.shadowBlur = 0;
          if (isNear) { ctx.fillStyle = g.blink ? 'rgba(0,255,65,.9)' : 'rgba(0,255,65,.35)'; ctx.font = '8px "Share Tech Mono"'; ctx.fillText('[E]', bx + b.w / 2, by - 28); }
          continue; // skip default building drawing
        }

        // ── Default building rendering ────────────────────────────────────
        ctx.strokeStyle = isLocked ? `rgba(255,120,50,${isNear ? .8 : .3})` : b.bright ? `rgba(0,255,65,${isNear ? .9 : .5})` : `rgba(0,180,50,${isNear ? .7 : .3})`;
        ctx.lineWidth = isNear ? 2 : 1; ctx.strokeRect(bx, by, b.w, b.h);
        ctx.fillStyle = isLocked ? 'rgba(255,80,0,.04)' : 'rgba(0,255,65,.025)'; ctx.fillRect(bx, by, b.w, b.h);
        const cs = 7; ctx.lineWidth = 1.5;
        ctx.strokeStyle = isLocked ? 'rgba(255,120,50,.5)' : b.bright ? 'rgba(0,255,65,.7)' : 'rgba(0,200,50,.38)';
        [[bx, by, 1, 1], [bx + b.w, by, -1, 1], [bx, by + b.h, 1, -1], [bx + b.w, by + b.h, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(cx2, cy2 + (sy as number) * cs); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + (sx as number) * cs, cy2); ctx.stroke();
        });
        ctx.fillStyle = isLocked ? 'rgba(255,140,60,.7)' : b.bright ? (isNear ? '#00ff41' : 'rgba(0,255,65,.6)') : 'rgba(0,200,50,.42)';
        ctx.font = `${b.bright ? 10 : 9}px "Share Tech Mono"`; ctx.textAlign = 'center';
        ctx.fillText(b.label + (isLocked ? ' 🔒' : ''), bx + b.w / 2, by + b.h / 2 + 4);
        if (isNear) { ctx.fillStyle = g.blink ? 'rgba(0,255,65,.85)' : 'rgba(0,255,65,.3)'; ctx.font = '8px "Share Tech Mono"'; ctx.fillText('[E]', bx + b.w / 2, by - 7); }
      }

      // NPCs
      for (let ni = 0; ni < NPCS.length; ni++) {
        const n = NPCS[ni];
        const nx2 = n.x + ox, ny2 = n.y + oy;
        if (nx2 < -10 || nx2 > cw + 10 || ny2 < -10 || ny2 > ch + 10) continue;
        const nDist = Math.hypot(g.px - n.x, g.py - n.y);
        const isNearNpc = nDist < NPC_RANGE;
        // NPC dot with glow when nearby
        ctx.shadowColor = NPC_COL[n.type] ?? '#009922';
        ctx.shadowBlur = isNearNpc ? 8 : 0;
        ctx.fillStyle = NPC_COL[n.type] ?? '#009922'; ctx.fillRect(nx2 - 3, ny2 - 3, 6, 6);
        ctx.shadowBlur = 0;
        // Name label when close
        if (nDist < 90) {
          ctx.fillStyle = isNearNpc ? 'rgba(0,255,65,.7)' : 'rgba(0,255,65,.3)';
          ctx.font = `${isNearNpc ? 'bold ' : ''}8px "Share Tech Mono"`;
          ctx.textAlign = 'center'; ctx.fillText(n.name, nx2, ny2 - 9);
        }
        // [E] prompt when in range
        if (isNearNpc && !nb) {
          ctx.fillStyle = g.blink ? 'rgba(0,255,65,.85)' : 'rgba(0,255,65,.3)';
          ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E]', nx2, ny2 - 19);
        }
      }

      // Online players
      for (const [, op] of g.peers) {
        const px2 = op.x + ox, py2 = op.y + oy;
        if (px2 < -20 || px2 > cw + 20 || py2 < -20 || py2 > ch + 20) continue;
        const spk = g.speakingSet.has(op.id);
        if (spk) { ctx.shadowColor = 'rgba(0,255,180,.6)'; ctx.shadowBlur = 10; }
        ctx.fillStyle = spk ? '#00ffcc' : '#44aaff';
        ctx.beginPath(); ctx.moveTo(px2, py2 - 9); ctx.lineTo(px2 + 6, py2 + 5); ctx.lineTo(px2 - 6, py2 + 5); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = spk ? '#00ffcc' : 'rgba(100,180,255,.6)'; ctx.font = 'bold 8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText(op.name, px2, py2 - 12);
      }

      // Threats
      for (const t of g.threats) {
        const tx = t.x + ox, ty = t.y + oy;
        if (tx < -10 || tx > cw + 10 || ty < -10 || ty > ch + 10) continue;
        const tc = THREAT_COL[t.type] ?? '#ff4444';
        const chasing = Math.hypot(g.px - t.x, g.py - t.y) < 120;
        ctx.shadowColor = tc; ctx.shadowBlur = chasing ? 8 : 3;
        ctx.fillStyle = chasing ? tc : `${tc}77`; ctx.fillRect(tx - 4, ty - 4, 8, 8);
        ctx.shadowBlur = 0;
        if (chasing) { ctx.fillStyle = tc; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center'; ctx.fillText(t.type, tx, ty - 8); }
      }

      // Player
      const px = g.px + ox, py2 = g.py + oy;
      const pcol = g.invincible % 4 < 2 ? '#00ff41' : 'rgba(0,255,65,.2)';
      ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 10;
      ctx.fillStyle = pcol;
      ctx.beginPath(); ctx.moveTo(px, py2 - PSIZE); ctx.lineTo(px + PSIZE * .65, py2 + PSIZE * .5); ctx.lineTo(px - PSIZE * .65, py2 + PSIZE * .5); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      if (speaking) { ctx.strokeStyle = 'rgba(0,255,180,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(px, py2, 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }

      // Mini-map
      const mmW = 96, mmH = 68, mmX = cw - mmW - 10, mmY = 10;
      ctx.fillStyle = 'rgba(0,5,0,.9)'; ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeStyle = 'rgba(0,255,65,.22)'; ctx.lineWidth = 1; ctx.strokeRect(mmX, mmY, mmW, mmH);
      const mwY = mmY + (WASTELAND_Y / H) * mmH;
      ctx.strokeStyle = 'rgba(0,255,65,.15)'; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(mmX, mwY); ctx.lineTo(mmX + mmW, mwY); ctx.stroke(); ctx.setLineDash([]);
      // Gang zones on minimap
      for (const gz of GANG_ZONES) { ctx.fillStyle = gz.color.replace('.06', '.15').replace('.05', '.12'); ctx.fillRect(mmX + (gz.x / W) * mmW, mmY + (gz.y / H) * mmH, (gz.w / W) * mmW, (gz.h / H) * mmH); }
      for (const b of BUILDINGS) {
        const isLk = g.locks.has(b.id) && !!g.locks.get(b.id)?.ownerName;
        ctx.fillStyle = isLk ? 'rgba(255,120,50,.5)' : b.bright ? 'rgba(0,255,65,.7)' : 'rgba(0,160,50,.35)';
        ctx.fillRect(mmX + (b.x / W) * mmW, mmY + (b.y / H) * mmH, Math.max(2, (b.w / W) * mmW), Math.max(1, (b.h / H) * mmH));
      }
      for (const t of g.threats) { ctx.fillStyle = THREAT_COL[t.type]; ctx.fillRect(mmX + (t.x / W) * mmW - 1, mmY + (t.y / H) * mmH - 1, 2, 2); }
      for (const [, op] of g.peers) { ctx.fillStyle = '#44aaff'; ctx.fillRect(mmX + (op.x / W) * mmW - 1, mmY + (op.y / H) * mmH - 1, 2, 2); }
      ctx.fillStyle = '#00ff41'; ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 3;
      ctx.fillRect(mmX + (g.px / W) * mmW - 2, mmY + (g.py / H) * mmH - 2, 4, 4); ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [char, speaking]);

  const hpPct = hp;
  const nearB = near ? BUILDINGS.find(b => b.id === near) : null;

  return (
    <div
      ref={gameRef}
      tabIndex={0}
      onClick={() => gameRef.current?.focus()}
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#030803', position: 'relative', fontFamily: "'Share Tech Mono',monospace", outline: 'none' }}
    >
      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.14) 2px,rgba(0,0,0,.14) 4px)', pointerEvents: 'none', zIndex: 9999 }} />

      {/* Canvas — full screen game world */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* ── HUD OVERLAY ─────────────────────────────────────────────────── */}

      {/* TOP-LEFT — player identity */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.2)', padding: '.3rem .6rem' }}>
          <div style={{ width: 6, height: 6, background: '#00ff41', boxShadow: '0 0 6px rgba(0,255,65,.7)' }} />
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: '#00ff41', letterSpacing: '.1em' }}>{char.name}</span>
          <span style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.08em', borderLeft: '1px solid rgba(0,255,65,.15)', paddingLeft: '.45rem' }}>{char.class.toUpperCase()}</span>
          {hasDevice && <span style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.55)', border: '1px solid rgba(0,255,65,.25)', padding: '1px 4px' }}>PABLO</span>}
        </div>
        <div style={{ display: 'flex', gap: '3px' }}>
          {/* HP */}
          <div style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.18)', padding: '.25rem .5rem', minWidth: 90 }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '3px' }}>HP</div>
            <div style={{ position: 'relative', height: 4, background: 'rgba(0,255,65,.08)', width: '100%' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${hpPct}%`, background: hpPct > 50 ? '#00ff41' : hpPct > 25 ? '#aaff44' : '#ff4444', boxShadow: `0 0 4px ${hpPct > 50 ? 'rgba(0,255,65,.5)' : 'rgba(255,0,0,.5)'}`, transition: 'width .2s, background .2s' }} />
            </div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: hpPct > 50 ? '#00ff41' : hpPct > 25 ? '#aaff44' : '#ff4444', letterSpacing: '.06em', marginTop: '2px' }}>{Math.floor(hpPct)}/100</div>
          </div>
          {/* Salary */}
          <div style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.18)', padding: '.25rem .5rem' }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '3px' }}>¥</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: '#00ff41', letterSpacing: '.06em', marginTop: '2px', whiteSpace: 'nowrap' }}>${salary}</div>
          </div>
          {/* Zone */}
          <div style={{ background: 'rgba(0,6,0,.82)', border: `1px solid ${zone === 'WASTELAND' ? 'rgba(170,255,68,.2)' : 'rgba(0,255,65,.18)'}`, padding: '.25rem .5rem' }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '3px' }}>ZONE</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: zone === 'WASTELAND' ? '#88ff44' : '#00ff41', letterSpacing: '.06em', marginTop: '2px' }}>{zone}</div>
          </div>
        </div>
        {/* Survival meters */}
        <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
          {[
            { label: 'HUNGER', val: hunger, col: hunger > 50 ? '#00ff41' : hunger > 25 ? '#aaff22' : '#ff6622' },
            { label: 'THIRST', val: thirst, col: thirst > 50 ? '#33aaff' : thirst > 25 ? '#aaff22' : '#ff6622' },
            { label: 'ENERGY', val: energy, col: energy > 50 ? '#ffcc00' : energy > 25 ? '#aaff22' : '#ff4444' },
          ].map(({ label, val, col }) => (
            <div key={label} style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.14)', padding: '.22rem .45rem', minWidth: 68 }}>
              <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', marginBottom: '2px' }}>{label}</div>
              <div style={{ position: 'relative', height: 3, background: 'rgba(0,255,65,.07)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${val}%`, background: col, transition: 'width .3s, background .3s' }} />
              </div>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '.65rem', color: col, letterSpacing: '.04em', marginTop: '1px' }}>{val}</div>
            </div>
          ))}
        </div>
        {/* Gang zone indicator */}
        {gangZone && (
          <div style={{ marginTop: '3px', background: 'rgba(0,6,0,.82)', border: `1px solid ${GANG_ZONES.find(g => g.id === gangZone)?.border ?? 'rgba(255,60,60,.3)'}`, padding: '.2rem .5rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: GANG_ZONES.find(g => g.id === gangZone)?.threat ?? '#ff4444', letterSpacing: '.1em' }}>
              ⚠ {GANG_ZONES.find(g => g.id === gangZone)?.name} TERRITORY
            </div>
          </div>
        )}
      </div>

      {/* ONLINE PLAYERS — below minimap, top-right */}
      {online.length > 0 && (
        <div style={{ position: 'absolute', top: 84, right: 10, width: 96, background: 'rgba(0,5,0,.88)', border: '1px solid rgba(0,255,65,.18)', zIndex: 100, padding: '.35rem .45rem' }}>
          <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', marginBottom: '.25rem' }}>{online.length} ONLINE</div>
          {online.slice(0, 5).map(p => (
            <div key={p.id} onClick={() => { setDmTarget(dmTarget?.id === p.id ? null : p); setChatOpen(true); }} style={{ fontSize: '.55rem', color: speakIds.has(p.id) ? '#00ffcc' : 'rgba(0,255,65,.5)', lineHeight: 1.7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.2rem', overflow: 'hidden' }}>
              {speakIds.has(p.id) && <span style={{ fontSize: '.5rem' }}>🎙</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM — narration + action buttons */}
      <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 100, display: 'flex', alignItems: 'flex-end', gap: '.5rem', pointerEvents: 'none' }}>
        {/* Narration */}
        <div style={{ flex: 1, background: 'rgba(0,6,0,.88)', border: '1px solid rgba(0,255,65,.18)', padding: '.5rem .75rem', pointerEvents: 'none' }}>
          {nearB && (
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.2rem' }}>
              NEARBY: {nearB.label}{lockMap.has(nearB.id) ? ' 🔒' : ''}
            </div>
          )}
          <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.04em', lineHeight: 1.5 }}>{narration}</div>
          <div style={{ marginTop: '.3rem', fontSize: '.42rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em' }}>WASD move · E enter · C chat · V voice · P device · ESC close</div>
        </div>
        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'all' }}>
          <button onClick={toggleVoice} style={{ padding: '.35rem .6rem', background: voice ? (speaking ? 'rgba(0,255,180,.12)' : 'rgba(0,255,65,.1)') : 'rgba(0,5,0,.88)', border: `1px solid ${voice ? (speaking ? 'rgba(0,255,180,.6)' : 'rgba(0,255,65,.4)') : 'rgba(0,255,65,.15)'}`, color: voice ? (speaking ? '#00ffcc' : '#00ff41') : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            {voice ? (speaking ? '● MIC' : '○ MIC') : 'MIC [V]'}
          </button>
          <button onClick={() => { setChatOpen(v => !v); setUnread(0); }} style={{ padding: '.35rem .6rem', background: chatOpen ? 'rgba(0,255,65,.1)' : 'rgba(0,5,0,.88)', border: chatOpen ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: chatOpen ? '#00ff41' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center', position: 'relative' }}>
            {unread > 0 && <span style={{ position: 'absolute', top: 2, right: 3, width: 6, height: 6, background: '#ff4444', borderRadius: '50%' }} />}
            CHAT [C]
          </button>
          <button onClick={() => setShowPablo(v => !v)} style={{ padding: '.35rem .6rem', background: showPablo ? 'rgba(0,255,65,.1)' : 'rgba(0,5,0,.88)', border: showPablo ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: showPablo ? '#00ff41' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            PABLO [P]
          </button>
          <button onClick={() => setShowStats(v => !v)} style={{ padding: '.35rem .6rem', background: showStats ? 'rgba(255,170,0,.08)' : 'rgba(0,5,0,.88)', border: showStats ? '1px solid rgba(255,170,0,.4)' : '1px solid rgba(0,255,65,.15)', color: showStats ? '#ffaa00' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            STATS
          </button>
          <button onClick={() => navigate('/world')} style={{ padding: '.35rem .6rem', background: 'rgba(0,5,0,.88)', border: '1px solid rgba(0,255,65,.1)', color: 'rgba(0,255,65,.2)', cursor: 'pointer', fontSize: '.55rem', letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            ← MENU
          </button>
        </div>
      </div>

      {/* ── PROPERTY STATS PANEL ── */}
      {showStats && (
        <div style={{ position: 'absolute', bottom: 120, right: 70, width: 240, background: 'rgba(0,5,0,.97)', border: '1px solid rgba(255,170,0,.3)', zIndex: 200 }}>
          <div style={{ padding: '.35rem .55rem', borderBottom: '1px solid rgba(255,170,0,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: '#ffaa00', letterSpacing: '.1em' }}>PROPERTY LEDGER</span>
            <button onClick={() => setShowStats(false)} style={{ fontSize: '.55rem', color: 'rgba(255,170,0,.4)', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ padding: '.4rem .55rem', maxHeight: '30vh', overflowY: 'auto' }}>
            {Object.keys(ownerStats).length === 0 ? (
              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.07em', padding: '.3rem 0' }}>No buildings claimed yet.</div>
            ) : Object.entries(ownerStats).sort((a, b) => b[1].count - a[1].count).map(([owner, data]) => (
              <div key={owner} style={{ borderBottom: '1px solid rgba(0,255,65,.07)', padding: '.3rem 0' }}>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '.8rem', color: '#ffaa00', letterSpacing: '.08em' }}>{owner}</div>
                {data.company && <div style={{ fontSize: '.45rem', color: 'rgba(255,170,0,.45)', letterSpacing: '.07em' }}>{data.company}</div>}
                <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.4)', marginTop: '2px' }}>{data.count} building{data.count !== 1 ? 's' : ''} claimed</div>
                <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.05em', marginTop: '1px' }}>{data.buildings.join(', ')}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '.3rem .55rem', borderTop: '1px solid rgba(0,255,65,.07)', fontSize: '.42rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.07em' }}>
            Total buildings: {BUILDINGS.filter(b => b.id !== 'pablo_tower').length} · Claimed: {Object.values(ownerStats).reduce((a, v) => a + v.count, 0)}
          </div>
        </div>
      )}

      {/* ── SERVER FULL OVERLAY ── */}
      {serverFull && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontFamily: "'Share Tech Mono',monospace" }}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '3rem', color: '#ff4444', letterSpacing: '.18em', textShadow: '0 0 20px rgba(255,0,0,.5)' }}>SERVER FULL</div>
          <div style={{ fontSize: '.65rem', color: 'rgba(255,80,80,.6)', letterSpacing: '.1em' }}>MAX 50 OPERATIVES ONLINE — Try again shortly.</div>
          <button onClick={() => navigate('/world')} style={{ marginTop: '.5rem', padding: '.65rem 1.5rem', background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.4)', color: '#ff8888', fontFamily: "'VT323',monospace", fontSize: '1.2rem', letterSpacing: '.15em', cursor: 'pointer' }}>← BACK TO MENU</button>
        </div>
      )}

      {/* ── CHAT PANEL ── */}
      {chatOpen && (
        <div style={{ position: 'absolute', bottom: 120, left: 10, width: 280, maxHeight: '42vh', background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.3)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          <div style={{ padding: '.35rem .55rem', borderBottom: '1px solid rgba(0,255,65,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: '#00ff41', letterSpacing: '.1em' }}>{dmTarget ? `DM → ${dmTarget.name}` : 'WORLD CHAT'}</span>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              {dmTarget && <button onClick={() => setDmTarget(null)} style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.4)', border: 'none', background: 'transparent', cursor: 'pointer' }}>× DM</button>}
              <button onClick={() => setChatOpen(false)} style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
            </div>
          </div>
          {online.length > 0 && (
            <div style={{ padding: '.25rem .45rem', borderBottom: '1px solid rgba(0,255,65,.1)', display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {online.map(p => (
                <button key={p.id} onClick={() => setDmTarget(dmTarget?.id === p.id ? null : p)} style={{ fontSize: '.5rem', padding: '1px 5px', background: dmTarget?.id === p.id ? 'rgba(0,255,65,.1)' : 'transparent', border: dmTarget?.id === p.id ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: dmTarget?.id === p.id ? '#00ff41' : 'rgba(0,255,65,.38)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace" }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', padding: '.45rem', display: 'flex', flexDirection: 'column', gap: '.22rem', minHeight: 60 }}>
            {chatMsgs.length === 0
              ? <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.18)' }}>No messages yet.</div>
              : chatMsgs.slice(-40).map(m => (
                <div key={m.id} style={{ fontSize: '.63rem', lineHeight: 1.5, color: m.from === 'SERVER' ? 'rgba(0,255,65,.28)' : m.dm ? 'rgba(100,200,255,.75)' : 'rgba(0,255,65,.65)' }}>
                  <span style={{ color: 'rgba(0,255,65,.38)', fontFamily: "'VT323',monospace", fontSize: '.72rem' }}>{m.dm ? '[DM]' : ''}{m.from.slice(0, 10)}</span>{' '}{m.text}
                </div>
              ))
            }
          </div>
          <div style={{ padding: '.32rem', borderTop: '1px solid rgba(0,255,65,.12)', display: 'flex', gap: '.32rem' }}>
            <input value={chatIn} onChange={e => setChatIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && (() => { if (!chatIn.trim()) return; const t = chatIn.trim(); setChatIn(''); if (dmTarget) wsSend({ type: 'chat', room: 'dm', text: t, toId: dmTarget.id }); else wsSend({ type: 'chat', room: 'world', text: t }); })()} placeholder={dmTarget ? `DM ${dmTarget.name}...` : 'World...'} style={{ flex: 1, background: 'rgba(0,10,0,.9)', border: '1px solid rgba(0,255,65,.18)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.62rem', padding: '.25rem .4rem', outline: 'none', caretColor: '#00ff41' }} />
            <button onClick={() => { if (!chatIn.trim()) return; const t = chatIn.trim(); setChatIn(''); if (dmTarget) wsSend({ type: 'chat', room: 'dm', text: t, toId: dmTarget.id }); else wsSend({ type: 'chat', room: 'world', text: t }); }} style={{ background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.28)', color: '#00ff41', cursor: 'pointer', padding: '0 .4rem', fontSize: '.62rem' }}>↵</button>
          </div>
        </div>
      )}

      {/* ── PABLO PANEL ── */}
      {showPablo && (
        <div style={{ position: 'absolute', bottom: 120, right: 70, width: 300, maxHeight: '50vh', background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.38)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          <div style={{ padding: '.45rem .65rem', borderBottom: '1px solid rgba(0,255,65,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: '#00ff41', letterSpacing: '.12em' }}>PABLO DEVICE</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.07em' }}>{hasDevice ? 'ACTIVATED' : 'NOT REGISTERED — VISIT PABLO STORE'}</div>
            </div>
            <button onClick={() => setShowPablo(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
          </div>
          {!hasDevice ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: 'rgba(0,255,65,.38)', letterSpacing: '.1em', marginBottom: '.35rem' }}>DEVICE LOCKED</div>
                <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.28)', lineHeight: 1.7 }}>Walk to the <span style={{ color: '#00ff41' }}>PABLO STORE</span> and press [E].</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.55rem', display: 'flex', flexDirection: 'column', gap: '.35rem', minHeight: 80 }}>
                {pabloMsgs.length === 0 && <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.22)', lineHeight: 1.7 }}>&gt; PABLO ONLINE<br />&gt; Ask anything.</div>}
                {pabloMsgs.map((m, i) => (
                  <div key={i} style={{ fontSize: '.62rem', lineHeight: 1.5, color: m.role === 'user' ? 'rgba(0,255,65,.52)' : '#00ff41', paddingLeft: m.role === 'pablo' ? '.4rem' : 0, borderLeft: m.role === 'pablo' ? '2px solid rgba(0,255,65,.22)' : 'none' }}>
                    <span style={{ color: 'rgba(0,255,65,.32)', fontFamily: "'VT323',monospace", fontSize: '.72rem', marginRight: '.25rem' }}>{m.role === 'user' ? `[${char.name.slice(0, 8)}]` : '[PABLO]'}</span>{m.text}
                  </div>
                ))}
                {pabloLoad && <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.32)', fontFamily: "'VT323',monospace" }}>...</div>}
              </div>
              <div style={{ padding: '.38rem', borderTop: '1px solid rgba(0,255,65,.12)', display: 'flex', gap: '.32rem' }}>
                <input value={pabloIn} onChange={e => setPabloIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendPablo()} placeholder="Ask PABLO..." style={{ flex: 1, background: 'rgba(0,10,0,.9)', border: '1px solid rgba(0,255,65,.18)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.62rem', padding: '.25rem .4rem', outline: 'none', caretColor: '#00ff41' }} />
                <button onClick={sendPablo} style={{ background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', cursor: 'pointer', padding: '0 .4rem', fontSize: '.62rem' }}>↵</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DIALOG ── */}
      {dialog && (
        <div style={{ position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)', width: 480, maxWidth: '88vw', background: 'rgba(0,6,0,.97)', border: '1px solid rgba(0,255,65,.45)', padding: '.9rem 1rem', zIndex: 200, cursor: 'pointer' }} onClick={advDialog}>
          <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '.35rem' }}>PABLO CORP. TRANSMISSION</div>
          <div style={{ fontSize: '.75rem', color: '#00ff41', lineHeight: 1.7, letterSpacing: '.03em', minHeight: '2rem' }}>{dialog.lines[dialog.idx]}</div>
          <div style={{ marginTop: '.4rem', textAlign: 'right', fontSize: '.45rem', color: 'rgba(0,255,65,.28)' }}>[{dialog.idx + 1}/{dialog.lines.length}] CLICK or SPACE ▶</div>
        </div>
      )}

      {/* ── PABLO STORE ACTIVATION ── */}
      {showStore && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,3,0,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 400, maxWidth: '90vw', border: '1px solid rgba(0,255,65,.55)', background: 'rgba(0,10,0,.98)', padding: '1.65rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.7rem', color: '#00ff41', textShadow: '0 0 12px rgba(0,255,65,.4)', letterSpacing: '.15em', marginBottom: '.2rem' }}>PABLO DEVICE</div>
            <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.08em', marginBottom: '1.25rem' }}>REGISTERED — {char.name.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.55rem', marginBottom: '1.1rem' }}>
              {([['FREE', ['PABLO AI chat', 'World access']], ['PRO — $29/mo', ['PABLO AI Pro', 'Live Listen', 'Scan Screen', 'Say This', 'Contacts & CRM']]] as [string, string[]][]).map(([t, f]) => (
                <div key={t} style={{ border: t === 'FREE' ? '1px solid rgba(0,255,65,.15)' : '1px solid rgba(0,255,65,.5)', padding: '.7rem', background: t !== 'FREE' ? 'rgba(0,255,65,.05)' : 'transparent' }}>
                  <div style={{ fontFamily: "'VT323',monospace", fontSize: '.95rem', color: t === 'FREE' ? 'rgba(0,255,65,.45)' : '#00ff41', letterSpacing: '.1em', marginBottom: '.35rem' }}>{t}</div>
                  {f.map(ff => <div key={ff} style={{ fontSize: '.54rem', color: t === 'FREE' ? 'rgba(0,255,65,.32)' : 'rgba(0,255,65,.62)', lineHeight: 1.9 }}>▸ {ff}</div>)}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.55rem' }}>
              <button onClick={() => { setShowStore(false); navigate('/upgrade'); }} style={{ flex: 1, padding: '.55rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.6)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '1rem', letterSpacing: '.15em', cursor: 'pointer' }}>UPGRADE $29/mo</button>
              <button onClick={() => { setShowStore(false); setNarr('> PABLO device active [FREE]. Press [P] to open it.'); }} style={{ padding: '.55rem .85rem', background: 'transparent', border: '1px solid rgba(0,255,65,.18)', color: 'rgba(0,255,65,.38)', fontFamily: "'VT323',monospace", fontSize: '.85rem', cursor: 'pointer' }}>FREE</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PABLO TOWER — OFFICE RENTAL ── */}
      {showOffice && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,3,0,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 460, maxWidth: '90vw', border: '1px solid rgba(140,0,220,.45)', background: 'rgba(6,0,12,.99)', padding: '1.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.7rem', color: '#00ff41', letterSpacing: '.14em' }}>PABLO TOWER</div>
                <div style={{ fontSize: '.52rem', color: 'rgba(140,0,220,.7)', letterSpacing: '.08em', marginTop: '.15rem' }}>FLOORS 1–39 — COMMERCIAL LEASE. FLOOR 40+ RESTRICTED.</div>
              </div>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                {rentedOffice && (
                  <button onClick={() => { const lk = lockMap.get('pablo_tower'); setPwPrompt({ bid: 'pablo_tower', label: 'PABLO TOWER', mode: lk ? 'enter' : 'set' }); setShowOffice(false); }} style={{ fontSize: '.48rem', padding: '2px 7px', background: 'rgba(0,255,65,.06)', border: '1px solid rgba(0,255,65,.22)', color: 'rgba(0,255,65,.45)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace" }}>
                    {lockMap.get('pablo_tower') ? '🔒 LOCKED' : 'SET CODE'}
                  </button>
                )}
                <button onClick={() => setShowOffice(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.32)', cursor: 'pointer', fontFamily: "'VT323',monospace", fontSize: '.95rem' }}>ESC</button>
              </div>
            </div>
            {rentedOffice && <div style={{ marginBottom: '.85rem', padding: '.38rem .6rem', border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,255,65,.05)', fontSize: '.58rem', color: '#00ff41' }}>▸ ACTIVE LEASE: {rentedOffice}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.55rem', marginBottom: '1.1rem' }}>
              {OFFICE_TIERS.map(({ label, price, desc }) => {
                const isRented = rentedOffice === label;
                const canAfford = salary >= price;
                return (
                  <div key={label} style={{ border: isRented ? '1px solid rgba(0,255,65,.65)' : '1px solid rgba(0,255,65,.16)', padding: '.7rem', background: isRented ? 'rgba(0,255,65,.06)' : 'transparent', position: 'relative' }}>
                    {isRented && <div style={{ position: 'absolute', top: 4, right: 5, fontSize: '.45rem', color: '#00ff41', fontFamily: "'VT323',monospace" }}>LEASED</div>}
                    <div style={{ fontFamily: "'VT323',monospace", fontSize: '.95rem', color: isRented ? '#00ff41' : 'rgba(0,255,65,.62)', letterSpacing: '.07em', marginBottom: '.18rem' }}>{label}</div>
                    <div style={{ fontSize: '.62rem', color: isRented ? '#00ff41' : canAfford ? 'rgba(0,255,65,.52)' : 'rgba(255,100,100,.5)', fontFamily: "'VT323',monospace", marginBottom: '.28rem' }}>${price.toLocaleString()}</div>
                    <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.32)', lineHeight: 1.6 }}>{desc}</div>
                    <button onClick={() => {
                      if (isRented) { localStorage.removeItem('sm_office'); setRentedOffice(null); setNarr('> Lease cancelled.'); return; }
                      if (!canAfford) { setNarr(`> Need $${price}. Have $${salary}.`); return; }
                      const g = gs.current; g.salary -= price; setSalary(g.salary);
                      localStorage.setItem('sm_office', label); setRentedOffice(label);
                      setNarr(`> ${label} leased. $${price} deducted. Set a security code from the lease panel.`);
                    }} style={{ marginTop: '.45rem', width: '100%', padding: '.28rem', background: isRented ? 'rgba(255,50,50,.06)' : canAfford ? 'rgba(0,255,65,.07)' : 'transparent', border: isRented ? '1px solid rgba(255,80,80,.28)' : canAfford ? '1px solid rgba(0,255,65,.38)' : '1px solid rgba(0,255,65,.08)', color: isRented ? 'rgba(255,80,80,.62)' : canAfford ? '#00ff41' : 'rgba(0,255,65,.16)', fontFamily: "'VT323',monospace", fontSize: '.8rem', letterSpacing: '.08em', cursor: canAfford || isRented ? 'pointer' : 'default' }}>
                      {isRented ? 'CANCEL' : canAfford ? 'RENT' : 'NO FUNDS'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: '.48rem', color: 'rgba(140,0,220,.35)', lineHeight: 1.7, borderTop: '1px solid rgba(140,0,220,.12)', paddingTop: '.6rem' }}>
              Tenants may set a security code. Floors 40+ are permanently sealed by order of PABLO CORP. management. Do not inquire about the penthouse.
            </div>
          </div>
        </div>
      )}

      {/* ── PASSWORD ── */}
      {pwPrompt && (
        <PwPrompt label={pwPrompt.label} onCancel={() => { setPwPrompt(null); setPendingBid(null); }}
          onOk={pw => { if (pwPrompt.mode === 'set') wsSend({ type: 'building_lock_set', buildingId: pwPrompt.bid, password: pw }); else wsSend({ type: 'building_lock_check', buildingId: pwPrompt.bid, password: pw }); }} />
      )}

      {/* ── DEATH ── */}
      {isDead && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '3.5rem', color: '#ff2222', textShadow: '0 0 24px rgba(255,0,0,.5)', letterSpacing: '.15em', marginBottom: '.7rem' }}>YOU DIED</div>
            <button onClick={() => { const g = gs.current; g.hp = 100; g.px = char.sx; g.py = char.sy; g.threats = THREATS_INIT.map(t => ({ ...t })); g.invincible = 120; setHp(100); setIsDead(false); setNarr('> Respawned. Watch your back.'); }} style={{ padding: '.55rem 1.65rem', background: 'rgba(255,0,0,.1)', border: '1px solid rgba(255,50,50,.45)', color: '#ff4444', fontFamily: "'VT323',monospace", fontSize: '1.35rem', letterSpacing: '.2em', cursor: 'pointer' }}>RESPAWN</button>
          </div>
        </div>
      )}
    </div>
  );
}
