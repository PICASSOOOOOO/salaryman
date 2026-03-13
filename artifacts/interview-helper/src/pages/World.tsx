import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { X, Send, MessageCircle, Mic, MicOff, Lock, Unlock, Users } from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
const WORLD_W = 3200;
const WORLD_H = 2600;
const TILE = 32;
const PLAYER_SPEED = 3.2;
const PLAYER_SIZE = 10;
const INTERACT_RANGE = 65;
const WASTELAND_Y = 1100;
const ENEMY_DETECT = 180;
const ENEMY_ATTACK_RANGE = 18;
const ENEMY_SPEED_CITY = 1.4;
const ENEMY_SPEED_WASTE = 0.9;
const VOICE_PROXIMITY = 320;
const NEARBY_CHAT_RANGE = 200;

// ── Buildings ─────────────────────────────────────────────────────────────────
const BUILDINGS = [
  { id: 'pablo_hq',    x: 600,  y: 300,  w: 240, h: 160, label: 'PABLO CORP. HQ',   bright: true  },
  { id: 'pablo_store', x: 920,  y: 340,  w: 140, h: 100, label: 'PABLO STORE',       bright: true  },
  { id: 'megabank',    x: 360,  y: 280,  w: 180, h: 140, label: 'MOGUL BANK',        bright: false },
  { id: 'city_hall',   x: 520,  y: 520,  w: 200, h: 120, label: 'CITY HALL',         bright: false },
  { id: 'market',      x: 900,  y: 500,  w: 160, h: 100, label: 'BLACK MARKET',      bright: false },
  { id: 'hotel',       x: 1120, y: 300,  w: 120, h: 160, label: 'HOTEL NEON',        bright: false },
  { id: 'clinic',      x: 320,  y: 480,  w: 120, h: 80,  label: 'MED CLINIC',        bright: false },
  { id: 'apt1',        x: 200,  y: 320,  w: 100, h: 120, label: 'APT BLOCK 1A',      bright: false },
  { id: 'apt2',        x: 200,  y: 470,  w: 100, h: 120, label: 'APT BLOCK 1B',      bright: false },
  { id: 'factory',     x: 1300, y: 260,  w: 180, h: 140, label: 'FACTORY 7',         bright: false },
  { id: 'atm',         x: 870,  y: 470,  w: 50,  h: 50,  label: 'ATM',               bright: true  },
  { id: 'office',      x: 1100, y: 500,  w: 180, h: 130, label: 'OFFICE TOWER',      bright: true  },
  { id: 'bunker',      x: 500,  y: 1400, w: 160, h: 100, label: 'BUNKER-09',         bright: false },
  { id: 'scrap',       x: 800,  y: 1350, w: 200, h: 80,  label: 'SCRAP YARD',        bright: false },
  { id: 'outpost',     x: 300,  y: 1500, w: 120, h: 90,  label: 'OUTPOST DELTA',     bright: false },
  { id: 'radio',       x: 1100, y: 1420, w: 100, h: 100, label: 'PIRATE RADIO',      bright: false },
  { id: 'ruins1',      x: 650,  y: 1550, w: 140, h: 80,  label: '[ RUINS ]',         bright: false },
  { id: 'ruins2',      x: 950,  y: 1600, w: 100, h: 120, label: '[ RUINS ]',         bright: false },
];

// ── Friendly NPCs ─────────────────────────────────────────────────────────────
const NPCS = [
  { name: 'WORKER-441', x: 750,  y: 470,  type: 'corp'    },
  { name: 'EXEC-77',    x: 840,  y: 320,  type: 'corp'    },
  { name: 'REPLICANT-X',x: 970,  y: 480,  type: 'android' },
  { name: 'VENDOR',     x: 450,  y: 580,  type: 'human'   },
  { name: 'GUARD-02',   x: 620,  y: 310,  type: 'corp'    },
  { name: 'BROKER',     x: 1050, y: 430,  type: 'corp'    },
  { name: 'UNIT-88',    x: 1150, y: 400,  type: 'android' },
  { name: 'DRIFTER',    x: 280,  y: 560,  type: 'human'   },
  { name: 'SURVIVOR',   x: 550,  y: 1600, type: 'human'   },
  { name: 'EXILE-003',  x: 1050, y: 1380, type: 'android' },
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `NPC-${String(i + 100).padStart(3, '0')}`,
    x: 200 + Math.floor(Math.abs(Math.sin(i * 2.4)) * 900),
    y: 200 + Math.floor(Math.abs(Math.cos(i * 1.7)) * 600),
    type: ['corp', 'human', 'android'][i % 3] as string,
  })),
];
const NPC_COLORS: Record<string, string> = {
  corp: '#00cc33', human: '#009922', android: '#33ffaa', mutant: '#88ff44',
};

// ── Enemies ───────────────────────────────────────────────────────────────────
interface Enemy { id: number; x: number; y: number; dx: number; dy: number; type: 'gang'|'mutant'|'raider'; state: 'patrol'|'chase'|'attack'; health: number; maxHealth: number; patrolX: number; patrolY: number; patrolTimer: number; dead: boolean; }
const spawnEnemies = (): Enemy[] => {
  const list: Enemy[] = [];
  const defs: [number, number, Enemy['type'], number][] = [
    [680,620,'gang',40],[1060,550,'gang',40],[380,640,'gang',40],[1200,560,'gang',40],[550,660,'gang',40],[800,650,'gang',40],
    [480,1460,'mutant',80],[720,1500,'mutant',80],[900,1530,'mutant',80],[350,1600,'mutant',80],[1050,1470,'mutant',80],
    [650,1650,'mutant',80],[820,1580,'mutant',80],[1100,1550,'mutant',80],
    [570,1350,'raider',55],[950,1400,'raider',55],[300,1450,'raider',55],[1150,1350,'raider',55],
  ];
  defs.forEach(([x,y,type,hp], i) => list.push({ id:i, x, y, dx:0, dy:0, type, state:'patrol', health:hp, maxHealth:hp, patrolX:x, patrolY:y, patrolTimer:0, dead:false }));
  return list;
};
const ENEMY_COLORS: Record<string, string> = { gang:'#ff4444', mutant:'#aaff44', raider:'#ff8800' };
const ENEMY_DAMAGE: Record<string, number> = { gang:0.3, mutant:0.5, raider:0.4 };

// ── Chat types ────────────────────────────────────────────────────────────────
interface ChatMsg { id: number; from: string; text: string; ts: number; room: 'world'|'dm'|'nearby'; fromId?: string; }

// ── Online player ─────────────────────────────────────────────────────────────
interface OnlinePlayer { id: string; name: string; class: string; x: number; y: number; speaking: boolean; }

// ── PABLO store dialog ────────────────────────────────────────────────────────
const PABLO_STORE_LINES = [
  '> PABLO CORP. DEVICE — TRANSMISSION ACTIVE',
  '> The city is collapsing around you. The wasteland is worse.',
  '> In this world, information is the only currency that matters.',
  '> A PABLO device: comms, intel, job listings, contacts. Everything.',
  '> Without one — you\'re just another ghost.',
  '> ...',
  '> PABLO Corp. is still accepting new accounts.',
  '> Press [ACTIVATE] to register your device.',
];

// ── Char select ───────────────────────────────────────────────────────────────
type CharClass = 'corporate'|'outcast'|'replicant';
interface CharData { name: string; class: CharClass; startX: number; startY: number; }

function CharacterSelect({ onStart }: { onStart: (c: CharData) => void }) {
  const [name, setName] = useState('');
  const [cls, setCls] = useState<CharClass>('corporate');
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t=>t+1), 600); return () => clearInterval(id); }, []);
  const CLASSES = [
    { id:'corporate' as CharClass, label:'CORPORATE', desc:'City dweller. High salary. Connected. Weak in the wasteland.', sx:820, sy:430 },
    { id:'outcast'   as CharClass, label:'OUTCAST',   desc:'Wasteland born. Tough. Poor. Hunted in the city.', sx:600, sy:1450 },
    { id:'replicant' as CharClass, label:'REPLICANT', desc:'Android faction. Balanced. Distrusted everywhere.', sx:720, sy:420 },
  ];
  const sel = CLASSES.find(c=>c.id===cls)!;
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#030803', fontFamily:"'Share Tech Mono',monospace", position:'relative' }}>
      <div style={{ position:'fixed', inset:0, background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.14) 2px,rgba(0,0,0,.14) 4px)', pointerEvents:'none', zIndex:9999 }} />
      <div style={{ maxWidth:600, width:'100%', padding:'2rem', zIndex:1 }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'3.5rem', color:'#00ff41', textShadow:'0 0 20px rgba(0,255,65,.6)', letterSpacing:'.15em' }}>SALARYMAN</div>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'1rem', color:'rgba(0,255,65,.35)', letterSpacing:'.12em' }}>PABLO CORP. — WORLD INITIALIZATION</div>
          <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.25)', letterSpacing:'.1em', marginTop:'.3rem' }}>SELECT OPERATIVE CLASS {tick%2===0?'_':' '}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.75rem', marginBottom:'1.5rem' }}>
          {CLASSES.map(c=>(
            <button key={c.id} onClick={()=>setCls(c.id)} style={{ padding:'1rem .5rem', border:cls===c.id?'1px solid rgba(0,255,65,.8)':'1px solid rgba(0,255,65,.2)', background:cls===c.id?'rgba(0,255,65,.1)':'rgba(0,255,65,.02)', color:cls===c.id?'#00ff41':'rgba(0,255,65,.4)', cursor:'pointer', textAlign:'center', transition:'all .15s' }}>
              <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.3rem', letterSpacing:'.1em', marginBottom:'.3rem' }}>{c.label}</div>
              <div style={{ fontSize:'.58rem', lineHeight:1.5 }}>{c.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.35)', letterSpacing:'.12em', marginBottom:'.4rem' }}>OPERATIVE DESIGNATION</div>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&name.trim()&&onStart({name:name.trim().toUpperCase(),class:cls,startX:sel.sx,startY:sel.sy})} maxLength={20} placeholder="ENTER NAME..." autoFocus style={{ width:'100%', padding:'.6rem .8rem', background:'rgba(0,15,0,.9)', border:'1px solid rgba(0,255,65,.35)', color:'#00ff41', fontFamily:"'Share Tech Mono',monospace", fontSize:'1rem', letterSpacing:'.1em', outline:'none', caretColor:'#00ff41', boxSizing:'border-box' }} />
        </div>
        <button onClick={()=>name.trim()&&onStart({name:name.trim().toUpperCase(),class:cls,startX:sel.sx,startY:sel.sy})} disabled={!name.trim()} style={{ width:'100%', padding:'.8rem', background:name.trim()?'rgba(0,255,65,.14)':'rgba(0,255,65,.03)', border:name.trim()?'1px solid rgba(0,255,65,.7)':'1px solid rgba(0,255,65,.15)', color:name.trim()?'#00ff41':'rgba(0,255,65,.2)', fontFamily:"'VT323',monospace", fontSize:'1.5rem', letterSpacing:'.2em', cursor:name.trim()?'pointer':'default', transition:'all .15s' }}>
          ENTER THE WORLD {tick%2===0?'▶':'▷'}
        </button>
      </div>
    </div>
  );
}

// ── Stat Ring ─────────────────────────────────────────────────────────────────
function StatRing({ value, max, color, label, size=52 }: { value:number; max:number; color:string; label:string; size?:number }) {
  const r=(size/2)-5; const circ=2*Math.PI*r; const pct=Math.max(0,Math.min(1,value/max));
  return (
    <div style={{ textAlign:'center', width:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,255,65,0.1)" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} style={{ transition:'stroke-dashoffset 0.2s', filter:`drop-shadow(0 0 4px ${color})` }} />
      </svg>
      <div style={{ fontFamily:"'VT323',monospace", fontSize:'.75rem', color, letterSpacing:'.08em', marginTop:'-2px' }}>{label}</div>
    </div>
  );
}

// ── Password Prompt ───────────────────────────────────────────────────────────
function PasswordPrompt({ buildingLabel, mode, ownerName, onSubmit, onCancel }: {
  buildingLabel: string; mode: 'enter'|'set'|'change'; ownerName?: string;
  onSubmit: (pw: string, currentPw?: string) => void; onCancel: () => void;
}) {
  const [pw, setPw] = useState('');
  const [cur, setCur] = useState('');
  return (
    <div style={{ position:'absolute', inset:0, background:'rgba(0,5,0,.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
      <div style={{ width:380, maxWidth:'90vw', border:'1px solid rgba(0,255,65,.6)', background:'rgba(0,15,0,.98)', padding:'1.75rem', boxShadow:'0 0 30px rgba(0,255,65,.15)' }}>
        <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.5rem', color:'#00ff41', letterSpacing:'.15em', marginBottom:'.3rem' }}>
          {mode==='enter'?'🔒 ACCESS LOCKED':mode==='set'?'SET SECURITY CODE':'CHANGE SECURITY CODE'}
        </div>
        <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.4)', letterSpacing:'.08em', marginBottom:'1.25rem' }}>
          {buildingLabel}{ownerName?` — Secured by ${ownerName}`:''}
        </div>
        {mode==='change' && (
          <div style={{ marginBottom:'.75rem' }}>
            <div style={{ fontSize:'.58rem', color:'rgba(0,255,65,.35)', letterSpacing:'.1em', marginBottom:'.3rem' }}>CURRENT PASSWORD</div>
            <input value={cur} onChange={e=>setCur(e.target.value)} type="password" placeholder="••••••••" style={{ width:'100%', padding:'.5rem .7rem', background:'rgba(0,15,0,.9)', border:'1px solid rgba(0,255,65,.25)', color:'#00ff41', fontFamily:"'Share Tech Mono',monospace", fontSize:'.9rem', outline:'none', caretColor:'#00ff41', boxSizing:'border-box' }} />
          </div>
        )}
        <div style={{ marginBottom:'1rem' }}>
          <div style={{ fontSize:'.58rem', color:'rgba(0,255,65,.35)', letterSpacing:'.1em', marginBottom:'.3rem' }}>
            {mode==='enter'?'ENTER PASSWORD':'NEW PASSWORD'}
          </div>
          <input value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&pw.trim()&&onSubmit(pw.trim(),cur||undefined)} type="password" placeholder="••••••••" autoFocus style={{ width:'100%', padding:'.5rem .7rem', background:'rgba(0,15,0,.9)', border:'1px solid rgba(0,255,65,.35)', color:'#00ff41', fontFamily:"'Share Tech Mono',monospace", fontSize:'.9rem', outline:'none', caretColor:'#00ff41', boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          <button onClick={()=>pw.trim()&&onSubmit(pw.trim(),cur||undefined)} style={{ flex:1, padding:'.6rem', background:'rgba(0,255,65,.12)', border:'1px solid rgba(0,255,65,.6)', color:'#00ff41', fontFamily:"'VT323',monospace", fontSize:'1.1rem', letterSpacing:'.1em', cursor:'pointer' }}>
            {mode==='enter'?'UNLOCK':'CONFIRM'}
          </button>
          <button onClick={onCancel} style={{ padding:'.6rem .9rem', background:'transparent', border:'1px solid rgba(0,255,65,.15)', color:'rgba(0,255,65,.35)', fontFamily:"'VT323',monospace", fontSize:'1rem', cursor:'pointer' }}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ── Main World ────────────────────────────────────────────────────────────────
export default function World() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const gsRef = useRef({
    player: { x: 820, y: 430 },
    camera: { x: 0, y: 0 },
    keys: new Set<string>(),
    frameCount: 0,
    blink: 0,
    enemies: spawnEnemies(),
    stats: { health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, salary: 0, level: 1 },
    hasDevice: false,
    invincible: 0,
    damageFlash: 0,
    nearBuilding: null as string | null,
    myId: '',
    onlinePlayers: new Map<string, OnlinePlayer>(),
    speakingPlayers: new Set<string>(),
    buildingLocks: new Map<string, { locked: boolean; ownerName: string | null }>(),
  });

  const animRef = useRef(0);
  const msgIdRef = useRef(0);

  const [, forceRender] = useState(0);
  const [character, setCharacter] = useState<CharData | null>(() => {
    try { const s = localStorage.getItem('salaryman_character'); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  // UI state
  const [dialog, setDialog] = useState<{ lines: string[]; idx: number; bid: string } | null>(null);
  const [narration, setNarration] = useState('PABLO CORP. DEVICE v1.0 — WASD move · SHIFT sprint · E interact · P PABLO · C chat · V voice');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showPablo, setShowPablo] = useState(false);
  const [showOffice, setShowOffice] = useState(false);
  const [rentedOffice, setRentedOffice] = useState<string | null>(() => localStorage.getItem('salaryman_office'));
  const [isDead, setIsDead] = useState(false);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'world'|'dm'|'nearby'>('world');
  const [chatInput, setChatInput] = useState('');
  const [worldMessages, setWorldMessages] = useState<ChatMsg[]>([]);
  const [dmMessages, setDmMessages] = useState<Map<string, ChatMsg[]>>(new Map());
  const [dmTarget, setDmTarget] = useState<{ id: string; name: string } | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [unreadWorld, setUnreadWorld] = useState(0);

  // Voice
  const [voiceActive, setVoiceActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());

  // Building passwords
  const [lockPrompt, setLockPrompt] = useState<{ bid: string; label: string; mode: 'enter'|'set'|'change'; ownerName?: string } | null>(null);
  const [pendingEnter, setPendingEnter] = useState<string | null>(null); // buildingId waiting after unlock
  const [buildingLockStatus, setBuildingLockStatus] = useState<Map<string, { locked: boolean; ownerName: string | null }>>(new Map());

  // PABLO chat
  const [pabloInput, setPabloInput] = useState('');
  const [pabloMessages, setPabloMessages] = useState<{ role: 'user'|'pablo'; text: string }[]>([]);
  const [pabloLoading, setPabloLoading] = useState(false);

  const [stats, setStats] = useState({ health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, salary: 0, level: 1 });
  const [nearBuilding, setNearBuilding] = useState<string | null>(null);

  // ── WebSocket setup ───────────────────────────────────────────────────────
  const connectWS = useCallback((char: CharData) => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws?name=${encodeURIComponent(char.name)}&class=${char.class}&x=${char.startX}&y=${char.startY}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => console.log('[WS] Connected to world server');
    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setTimeout(() => { if (wsRef.current === ws && character) connectWS(char); }, 3000);
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const gs = gsRef.current;

      switch (msg.type) {
        case 'welcome':
          gs.myId = msg.id;
          if (msg.locks) {
            const newLocks = new Map<string, { locked: boolean; ownerName: string | null }>();
            Object.entries(msg.locks).forEach(([bid, v]: [string, any]) => {
              newLocks.set(bid, { locked: true, ownerName: v.ownerName });
              gs.buildingLocks.set(bid, { locked: true, ownerName: v.ownerName });
            });
            setBuildingLockStatus(newLocks);
          }
          break;

        case 'player_list':
          gs.onlinePlayers.clear();
          (msg.players as OnlinePlayer[]).forEach(p => {
            if (p.id !== gs.myId) gs.onlinePlayers.set(p.id, p);
          });
          setOnlinePlayers([...(msg.players as OnlinePlayer[]).filter(p => p.id !== gs.myId)]);
          break;

        case 'player_move': {
          const p = gs.onlinePlayers.get(msg.id);
          if (p) { p.x = msg.x; p.y = msg.y; }
          break;
        }

        case 'player_speaking': {
          if (msg.speaking) gs.speakingPlayers.add(msg.id);
          else gs.speakingPlayers.delete(msg.id);
          setSpeakingIds(new Set(gs.speakingPlayers));
          break;
        }

        case 'player_left':
          gs.onlinePlayers.delete(msg.id);
          setOnlinePlayers(prev => prev.filter(p => p.id !== msg.id));
          setWorldMessages(prev => [...prev, { id: msgIdRef.current++, from: 'SYSTEM', text: `${msg.name} left the server.`, ts: Date.now(), room: 'world' }]);
          break;

        case 'chat': {
          const chatMsg: ChatMsg = { id: msgIdRef.current++, from: msg.from, text: msg.text, ts: msg.ts, room: msg.room };
          if (msg.room === 'world') {
            setWorldMessages(prev => [...prev.slice(-199), chatMsg]);
            if (!chatOpen) setUnreadWorld(n => n + 1);
          } else if (msg.room === 'dm') {
            const key = msg.echo ? msg.to : msg.from;
            setDmMessages(prev => {
              const clone = new Map(prev);
              const existing = clone.get(key) ?? [];
              clone.set(key, [...existing.slice(-99), chatMsg]);
              return clone;
            });
          }
          break;
        }

        case 'building_lock_result':
          if (msg.success && msg.action === 'unlock') {
            const gs2 = gsRef.current;
            gs2.buildingLocks.set(msg.buildingId, { locked: false, ownerName: null });
            setBuildingLockStatus(prev => { const m = new Map(prev); m.set(msg.buildingId, { locked: false, ownerName: null }); return m; });
            if (pendingEnter === msg.buildingId) { setPendingEnter(null); handleEnterUnlocked(msg.buildingId); }
          } else if (!msg.success) {
            setNarration(`> ACCESS DENIED — ${msg.error}`);
          } else if (msg.success && msg.action === 'set') {
            setNarration('> Security code set. Only players with the code can enter.');
          }
          setLockPrompt(null);
          break;

        case 'building_lock_status': {
          const info = { locked: msg.locked, ownerName: msg.ownerName };
          gsRef.current.buildingLocks.set(msg.buildingId, info);
          setBuildingLockStatus(prev => { const m = new Map(prev); m.set(msg.buildingId, info); return m; });
          if (pendingEnter === msg.buildingId) {
            if (!msg.locked) { setPendingEnter(null); handleEnterUnlocked(msg.buildingId); }
            else {
              const b = BUILDINGS.find(b=>b.id===msg.buildingId);
              setLockPrompt({ bid: msg.buildingId, label: b?.label ?? msg.buildingId, mode: 'enter', ownerName: msg.ownerName ?? undefined });
            }
          }
          break;
        }

        case 'building_locked':
          gsRef.current.buildingLocks.set(msg.buildingId, { locked: true, ownerName: msg.ownerName });
          setBuildingLockStatus(prev => { const m = new Map(prev); m.set(msg.buildingId, { locked: true, ownerName: msg.ownerName }); return m; });
          break;

        case 'building_unlocked':
          gsRef.current.buildingLocks.set(msg.buildingId, { locked: false, ownerName: null });
          setBuildingLockStatus(prev => { const m = new Map(prev); m.set(msg.buildingId, { locked: false, ownerName: null }); return m; });
          break;

        // WebRTC signaling
        case 'voice_offer':    handleVoiceOffer(msg.from, msg.sdp); break;
        case 'voice_answer':   handleVoiceAnswer(msg.from, msg.sdp); break;
        case 'voice_ice':      handleVoiceICE(msg.from, msg.candidate); break;
        case 'voice_peer_joined': initiateVoiceWith(msg.id); break;
      }
    };
  }, [character, chatOpen, pendingEnter]);

  // ── Send WS helper ────────────────────────────────────────────────────────
  const wsSend = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // ── Building enter logic ──────────────────────────────────────────────────
  const handleEnterUnlocked = (bid: string) => {
    const gs = gsRef.current;
    if (bid === 'pablo_store') {
      setDialog({ lines: PABLO_STORE_LINES, idx: 0, bid });
    } else if (bid === 'clinic') {
      if (gs.stats.salary >= 100) { gs.stats.health = gs.stats.maxHealth; gs.stats.salary -= 100; setStats({...gs.stats}); setNarration('> MED CLINIC — [$100 charged] Health fully restored.'); }
      else setNarration('> MED CLINIC — "That\'ll be $100. You can\'t afford it."');
    } else if (bid === 'atm') {
      gs.stats.salary += 50; setStats({...gs.stats}); setNarration('> ATM — +$50 from odd jobs. Balance updated.');
    } else if (bid === 'office') {
      setShowOffice(true);
    } else if (bid === 'megabank') {
      setNarration('> MOGUL BANK — "Access restricted. Your balance: insufficient to matter."');
    } else if (bid === 'pablo_hq') {
      setNarration('> PABLO CORP. HQ — Employee access only. Security androids are watching.');
    } else {
      const b = BUILDINGS.find(b=>b.id===bid);
      setNarration(`> ${b?.label ?? bid} — Locked. Come back with better credentials.`);
    }
  };

  const handleEnter = useCallback((bid: string) => {
    const gs = gsRef.current;
    const lock = gs.buildingLocks.get(bid);
    if (!lock) {
      // Query server
      setPendingEnter(bid);
      wsSend({ type: 'building_lock_query', buildingId: bid });
      return;
    }
    if (lock.locked) {
      const b = BUILDINGS.find(b=>b.id===bid);
      setLockPrompt({ bid, label: b?.label ?? bid, mode: 'enter', ownerName: lock.ownerName ?? undefined });
      setPendingEnter(bid);
    } else {
      handleEnterUnlocked(bid);
    }
  }, [wsSend]);

  // ── Voice / WebRTC ────────────────────────────────────────────────────────
  const createPeerConn = (peerId: string) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnsRef.current.set(peerId, pc);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    pc.onicecandidate = e => { if (e.candidate) wsSend({ type: 'voice_ice', to: peerId, candidate: e.candidate }); };
    pc.ontrack = e => {
      const audio = new Audio();
      audio.srcObject = e.streams[0];
      audio.play().catch(()=>{});
    };
    return pc;
  };

  const initiateVoiceWith = async (peerId: string) => {
    if (!localStreamRef.current) return;
    const pc = createPeerConn(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsSend({ type: 'voice_offer', to: peerId, sdp: offer });
  };

  const handleVoiceOffer = async (fromId: string, sdp: RTCSessionDescriptionInit) => {
    if (!localStreamRef.current) return;
    const pc = createPeerConn(fromId);
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsSend({ type: 'voice_answer', to: fromId, sdp: answer });
  };

  const handleVoiceAnswer = async (fromId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = peerConnsRef.current.get(fromId);
    if (pc) await pc.setRemoteDescription(sdp);
  };

  const handleVoiceICE = async (fromId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnsRef.current.get(fromId);
    if (pc) await pc.addIceCandidate(candidate);
  };

  const toggleVoice = useCallback(async () => {
    if (voiceActive) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      peerConnsRef.current.forEach(pc => pc.close());
      peerConnsRef.current.clear();
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      setVoiceActive(false);
      setIsSpeaking(false);
      wsSend({ type: 'speaking', speaking: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        setVoiceActive(true);
        wsSend({ type: 'voice_join' });

        // Volume detection for speaking indicator
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const detect = () => {
          if (!localStreamRef.current) return;
          analyser.getByteFrequencyData(data);
          const vol = data.reduce((a, b) => a + b, 0) / data.length;
          const speaking = vol > 12;
          setIsSpeaking(speaking);
          wsSend({ type: 'speaking', speaking });
          requestAnimationFrame(detect);
        };
        detect();
      } catch (err) {
        setNarration('> VOICE — Microphone access denied. Check browser permissions.');
      }
    }
  }, [voiceActive, wsSend]);

  // ── Keys ──────────────────────────────────────────────────────────────────
  const anyPanelOpen = useCallback(() => !!dialog || showUpgrade || showPablo || showOffice || !!lockPrompt, [dialog, showUpgrade, showPablo, showOffice, lockPrompt]);

  useEffect(() => {
    if (!character) return;
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      gsRef.current.keys.add(e.key.toLowerCase());
      if (e.key === 'p' || e.key === 'P') { setShowPablo(v => !v); setShowOffice(false); }
      if (e.key === 'c' || e.key === 'C') { setChatOpen(v => !v); setUnreadWorld(0); }
      if (e.key === 'v' || e.key === 'V') toggleVoice();
      if ((e.key === 'e' || e.key === 'E') && gsRef.current.nearBuilding && !anyPanelOpen() && !chatOpen) {
        handleEnter(gsRef.current.nearBuilding);
      }
      if (e.key === 'Escape') { setDialog(null); setShowUpgrade(false); setShowPablo(false); setShowOffice(false); setLockPrompt(null); setPendingEnter(null); }
    };
    const up = (e: KeyboardEvent) => gsRef.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [character, anyPanelOpen, chatOpen, handleEnter, toggleVoice]);

  // Dialog advance
  const advanceDialog = useCallback(() => {
    if (!dialog) return;
    if (dialog.idx < dialog.lines.length - 1) setDialog(d => d ? { ...d, idx: d.idx + 1 } : null);
    else { if (dialog.bid === 'pablo_store') { gsRef.current.hasDevice = true; setShowUpgrade(true); } setDialog(null); }
  }, [dialog]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && dialog) { e.preventDefault(); advanceDialog(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [advanceDialog, dialog]);

  // Char start
  const handleCharacterStart = useCallback((c: CharData) => {
    localStorage.setItem('salaryman_character', JSON.stringify(c));
    const gs = gsRef.current;
    gs.player = { x: c.startX, y: c.startY };
    gs.stats.salary = c.class === 'corporate' ? 500 : c.class === 'replicant' ? 200 : 0;
    setCharacter(c);
    setStats({ ...gs.stats });
    setTimeout(() => setNarration(`> ${c.name} [${c.class.toUpperCase()}] — Entered the world. Find the PABLO STORE. [C] to open chat.`), 300);
  }, []);

  // Connect WS when character is set
  useEffect(() => {
    if (!character) return;
    connectWS(character);
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, [character?.name]);

  // Broadcast position periodically
  useEffect(() => {
    if (!character) return;
    const id = setInterval(() => {
      const gs = gsRef.current;
      wsSend({ type: 'move', x: gs.player.x, y: gs.player.y });
    }, 100);
    return () => clearInterval(id);
  }, [character, wsSend]);

  // Send chat
  const sendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    if (chatTab === 'dm' && dmTarget) {
      wsSend({ type: 'chat', room: 'dm', text, toId: dmTarget.id });
    } else {
      wsSend({ type: 'chat', room: 'world', text });
    }
  }, [chatInput, chatTab, dmTarget, wsSend]);

  // PABLO AI
  const sendPablo = useCallback(async () => {
    if (!pabloInput.trim() || pabloLoading) return;
    const msg = pabloInput.trim(); setPabloInput('');
    setPabloMessages(m => [...m, { role: 'user', text: msg }]);
    if (!gsRef.current.hasDevice) { setPabloMessages(m => [...m, { role: 'pablo', text: '> DEVICE NOT ACTIVATED. Visit the PABLO STORE.' }]); return; }
    setPabloLoading(true);
    try {
      const res = await fetch('/api/advisor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, context: `You are PABLO, the in-world AI assistant for ${character?.name} (${character?.class}), playing Salaryman — a post-apocalyptic RPG. Be gritty and brief.` }), credentials: 'include' });
      const data = res.ok ? await res.json() : {};
      setPabloMessages(m => [...m, { role: 'pablo', text: data.response ?? '> SIGNAL LOST.' }]);
    } catch { setPabloMessages(m => [...m, { role: 'pablo', text: '> NETWORK DEAD.' }]); }
    setPabloLoading(false);
  }, [pabloInput, pabloLoading, character]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!character) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    let lastStatHash = '';
    let lastNear: string | null = null;
    let lastDead = false;

    const loop = () => {
      const gs = gsRef.current;
      gs.frameCount++;
      gs.blink = Math.floor(gs.frameCount / 28) % 2;
      if (gs.invincible > 0) gs.invincible--;
      if (gs.damageFlash > 0) gs.damageFlash--;

      const frozen = !!dialog || showUpgrade || showPablo || showOffice || !!lockPrompt || isDead;

      // Movement
      if (!frozen) {
        let dx = 0, dy = 0;
        if (gs.keys.has('arrowleft') ||gs.keys.has('a')) dx -= PLAYER_SPEED;
        if (gs.keys.has('arrowright')||gs.keys.has('d')) dx += PLAYER_SPEED;
        if (gs.keys.has('arrowup')   ||gs.keys.has('w')) dy -= PLAYER_SPEED;
        if (gs.keys.has('arrowdown') ||gs.keys.has('s')) dy += PLAYER_SPEED;
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
        const sprinting = gs.keys.has('shift') && (dx||dy);
        if (sprinting && gs.stats.stamina > 0) { dx *= 1.8; dy *= 1.8; gs.stats.stamina = Math.max(0, gs.stats.stamina - 0.4); }
        else if (!sprinting) gs.stats.stamina = Math.min(gs.stats.maxStamina, gs.stats.stamina + 0.15);
        const col = (px:number,py:number) => BUILDINGS.some(b => px+PLAYER_SIZE>b.x && px-PLAYER_SIZE<b.x+b.w && py+PLAYER_SIZE>b.y && py-PLAYER_SIZE<b.y+b.h);
        let nx = gs.player.x+dx, ny = gs.player.y+dy;
        if (col(nx,gs.player.y)) nx = gs.player.x;
        if (col(gs.player.x,ny)) ny = gs.player.y;
        gs.player.x = Math.max(PLAYER_SIZE, Math.min(WORLD_W-PLAYER_SIZE, nx));
        gs.player.y = Math.max(PLAYER_SIZE, Math.min(WORLD_H-PLAYER_SIZE, ny));
      }

      // Enemy AI
      for (const e of gs.enemies) {
        if (e.dead) continue;
        const dist = Math.hypot(gs.player.x-e.x, gs.player.y-e.y);
        const spd = e.type==='gang' ? ENEMY_SPEED_CITY : ENEMY_SPEED_WASTE;
        if (dist < ENEMY_ATTACK_RANGE) {
          e.state = 'attack';
          if (gs.invincible===0) { gs.stats.health = Math.max(0, gs.stats.health-ENEMY_DAMAGE[e.type]); gs.invincible=20; gs.damageFlash=8; }
        } else if (dist < ENEMY_DETECT) {
          e.state = 'chase';
          const ang = Math.atan2(gs.player.y-e.y, gs.player.x-e.x);
          e.dx = Math.cos(ang)*spd; e.dy = Math.sin(ang)*spd;
        } else {
          e.state = 'patrol'; e.patrolTimer--;
          if (e.patrolTimer <= 0) { const ang=Math.random()*Math.PI*2; e.dx=Math.cos(ang)*spd*.5; e.dy=Math.sin(ang)*spd*.5; e.patrolTimer=80+Math.floor(Math.random()*80); }
        }
        if (e.state !== 'attack') {
          const ne = { x:e.x+e.dx, y:e.y+e.dy };
          if (!BUILDINGS.some(b=>ne.x>b.x&&ne.x<b.x+b.w&&ne.y>b.y&&ne.y<b.y+b.h)) { e.x=Math.max(10,Math.min(WORLD_W-10,ne.x)); e.y=Math.max(10,Math.min(WORLD_H-10,ne.y)); }
          else { e.dx=-e.dx; e.dy=-e.dy; e.patrolTimer=0; }
        }
      }

      if (gs.stats.health <= 0 && !lastDead) { lastDead=true; setIsDead(true); }

      // Camera
      const cw=canvas.width, ch=canvas.height;
      gs.camera.x = Math.max(0, Math.min(WORLD_W-cw, gs.player.x-cw/2));
      gs.camera.y = Math.max(0, Math.min(WORLD_H-ch, gs.player.y-ch/2));
      const ox=-gs.camera.x, oy=-gs.camera.y;

      // Proximity
      let near: string|null = null;
      for (const b of BUILDINGS) {
        if (Math.hypot(gs.player.x-(b.x+b.w/2), gs.player.y-(b.y+b.h/2)) < INTERACT_RANGE) { near=b.id; break; }
      }
      gs.nearBuilding = near;
      if (near !== lastNear) {
        lastNear = near;
        if (near && !frozen) {
          const b = BUILDINGS.find(bb=>bb.id===near);
          const lk = gs.buildingLocks.get(near);
          const lockTxt = lk?.locked ? ' [LOCKED]' : '';
          setNarration(`> Approaching ${b?.label}${lockTxt} — Press [E] to interact.`);
        }
        setNearBuilding(near);
      }

      // Sync stats
      const sh = `${Math.floor(gs.stats.health)},${Math.floor(gs.stats.stamina)},${gs.stats.salary}`;
      if (sh !== lastStatHash) { lastStatHash=sh; setStats({...gs.stats}); }

      // ─── RENDER ───────────────────────────────────────────────────────────
      if (gs.damageFlash > 0) { ctx.fillStyle=`rgba(255,0,0,${gs.damageFlash*.04})`; ctx.fillRect(0,0,cw,ch); }
      ctx.fillStyle='#030803'; ctx.fillRect(0,0,cw,ch);

      // Grid
      ctx.strokeStyle='rgba(0,255,65,0.04)'; ctx.lineWidth=1;
      const sgx=Math.floor(gs.camera.x/TILE)*TILE, sgy=Math.floor(gs.camera.y/TILE)*TILE;
      for (let gx=sgx; gx<gs.camera.x+cw+TILE; gx+=TILE) { ctx.beginPath(); ctx.moveTo(gx+ox,0); ctx.lineTo(gx+ox,ch); ctx.stroke(); }
      for (let gy=sgy; gy<gs.camera.y+ch+TILE; gy+=TILE) { ctx.beginPath(); ctx.moveTo(0,gy+oy); ctx.lineTo(cw,gy+oy); ctx.stroke(); }

      // Zone
      const wbY = WASTELAND_Y+oy;
      if (wbY>0&&wbY<ch) {
        ctx.strokeStyle='rgba(0,255,65,0.15)'; ctx.setLineDash([8,4]); ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(0,wbY); ctx.lineTo(cw,wbY); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle='rgba(0,255,65,0.2)'; ctx.font='9px "Share Tech Mono"'; ctx.textAlign='center';
        ctx.fillText('── WASTELAND BORDER ──', cw/2, wbY-5);
      }
      ctx.fillStyle='rgba(0,255,65,0.025)'; ctx.font='72px "VT323"'; ctx.textAlign='center';
      ctx.fillText(gs.player.y < WASTELAND_Y ? 'CITY SECTOR' : 'WASTELAND', cw/2, ch/2);

      // Roads
      ctx.lineWidth=22; ctx.strokeStyle='rgba(0,255,65,0.07)';
      ctx.beginPath(); ctx.moveTo(0,700+oy); ctx.lineTo(WORLD_W+ox,700+oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(800+ox,0); ctx.lineTo(800+ox,WORLD_H+oy); ctx.stroke();
      ctx.lineWidth=14; ctx.beginPath(); ctx.moveTo(0,250+oy); ctx.lineTo(WORLD_W+ox,250+oy); ctx.stroke();

      // Buildings
      for (const b of BUILDINGS) {
        const bx=b.x+ox, by=b.y+oy;
        if (bx+b.w<0||bx>cw||by+b.h<0||by>ch) continue;
        const isNear = near===b.id;
        const isLocked = gs.buildingLocks.get(b.id)?.locked;
        ctx.strokeStyle = isLocked ? `rgba(255,100,50,${isNear?.7:.3})` : b.bright ? `rgba(0,255,65,${isNear?.9:.55})` : `rgba(0,180,50,${isNear?.7:.35})`;
        ctx.lineWidth = isNear ? 2 : 1;
        ctx.strokeRect(bx,by,b.w,b.h);
        ctx.fillStyle = isLocked ? 'rgba(255,80,0,0.04)' : `rgba(0,${b.bright?255:160},50,0.04)`;
        ctx.fillRect(bx,by,b.w,b.h);
        const cs=8; ctx.strokeStyle=isLocked?'rgba(255,100,50,.6)':b.bright?'rgba(0,255,65,.8)':'rgba(0,200,50,.45)'; ctx.lineWidth=1.5;
        [[bx,by,1,1],[bx+b.w,by,-1,1],[bx,by+b.h,1,-1],[bx+b.w,by+b.h,-1,-1]].forEach(([cx2,cy2,sx,sy])=>{
          ctx.beginPath(); ctx.moveTo(cx2,cy2+sy*cs); ctx.lineTo(cx2,cy2); ctx.lineTo(cx2+sx*cs,cy2); ctx.stroke();
        });
        ctx.fillStyle = isLocked ? 'rgba(255,130,50,.7)' : b.bright?(isNear?'#00ff41':'rgba(0,255,65,.65)'):'rgba(0,200,50,.45)';
        ctx.font=`${b.bright?11:9}px "Share Tech Mono"`; ctx.textAlign='center';
        ctx.fillText(b.label+(isLocked?' 🔒':''), bx+b.w/2, by+b.h/2+4);
        if (isNear) { ctx.fillStyle=gs.blink?'rgba(0,255,65,.9)':'rgba(0,255,65,.4)'; ctx.font='9px "Share Tech Mono"'; ctx.fillText('[E] ENTER', bx+b.w/2, by-8); }
      }

      // Friendly NPCs
      for (const npc of NPCS) {
        const nx2=npc.x+ox, ny2=npc.y+oy;
        if (nx2<-20||nx2>cw+20||ny2<-20||ny2>ch+20) continue;
        ctx.fillStyle=NPC_COLORS[npc.type]??'#009922'; ctx.fillRect(nx2-3,ny2-3,6,6);
        if (Math.hypot(gs.player.x-npc.x, gs.player.y-npc.y) < 90) { ctx.fillStyle='rgba(0,255,65,.45)'; ctx.font='8px "Share Tech Mono"'; ctx.textAlign='center'; ctx.fillText(npc.name,nx2,ny2-8); }
      }

      // Online players (other real users)
      for (const [, op] of gs.onlinePlayers) {
        const px2=op.x+ox, py2=op.y+oy;
        if (px2<-20||px2>cw+20||py2<-20||py2>ch+20) continue;
        const isSpk = gs.speakingPlayers.has(op.id);
        if (isSpk) { ctx.shadowColor='rgba(0,255,200,.7)'; ctx.shadowBlur=14; }
        ctx.fillStyle = isSpk ? '#00ffcc' : '#44aaff';
        ctx.beginPath(); ctx.moveTo(px2,py2-10); ctx.lineTo(px2+7,py2+5); ctx.lineTo(px2-7,py2+5); ctx.closePath(); ctx.fill();
        ctx.shadowBlur=0;
        ctx.fillStyle=isSpk?'#00ffcc':'rgba(100,200,255,.7)'; ctx.font='bold 9px "Share Tech Mono"'; ctx.textAlign='center';
        ctx.fillText(op.name, px2, py2-13);
        if (isSpk) { ctx.fillStyle='rgba(0,255,200,.5)'; ctx.font='7px "Share Tech Mono"'; ctx.fillText('🎙', px2+10, py2-13); }
      }

      // Voice proximity rings (who you can hear)
      if (voiceActive) {
        ctx.strokeStyle='rgba(0,255,200,0.08)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.arc(gs.player.x+ox, gs.player.y+oy, VOICE_PROXIMITY, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Enemies
      for (const e of gs.enemies) {
        if (e.dead) continue;
        const ex=e.x+ox, ey=e.y+oy;
        if (ex<-20||ex>cw+20||ey<-20||ey>ch+20) continue;
        const ec=ENEMY_COLORS[e.type];
        const chasing = e.state==='chase'||e.state==='attack';
        ctx.shadowColor=ec; ctx.shadowBlur=chasing?10:4;
        ctx.fillStyle=chasing?ec:`${ec}88`; ctx.fillRect(ex-5,ey-5,10,10);
        ctx.shadowBlur=0;
        const hbW=20; ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(ex-hbW/2,ey-12,hbW,3);
        ctx.fillStyle=ec; ctx.fillRect(ex-hbW/2,ey-12,hbW*(e.health/e.maxHealth),3);
        if (chasing) { ctx.fillStyle=ec; ctx.font='8px "Share Tech Mono"'; ctx.textAlign='center'; ctx.fillText(e.type.toUpperCase(),ex,ey-15); }
      }

      // Player
      const px=gs.player.x+ox, py=gs.player.y+oy;
      const pCol = gs.invincible%4<2 ? '#00ff41' : 'rgba(0,255,65,.3)';
      ctx.shadowColor='#00ff41'; ctx.shadowBlur=12;
      ctx.fillStyle=pCol;
      ctx.beginPath(); ctx.moveTo(px,py-PLAYER_SIZE); ctx.lineTo(px+PLAYER_SIZE*.7,py+PLAYER_SIZE*.5); ctx.lineTo(px-PLAYER_SIZE*.7,py+PLAYER_SIZE*.5); ctx.closePath(); ctx.fill();
      ctx.shadowBlur=0;
      if (isSpeaking) { ctx.strokeStyle='rgba(0,255,200,.7)'; ctx.lineWidth=2; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.arc(px,py,16,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle='rgba(0,255,65,.7)'; ctx.font='bold 9px "Share Tech Mono"'; ctx.textAlign='center';
      ctx.fillText(character.name, px, py-PLAYER_SIZE-4);

      // Minimap
      const mmW=130, mmH=90, mmX=cw-mmW-12, mmY=50;
      ctx.fillStyle='rgba(0,8,0,.9)'; ctx.fillRect(mmX,mmY,mmW,mmH);
      ctx.strokeStyle='rgba(0,255,65,.3)'; ctx.lineWidth=1; ctx.strokeRect(mmX,mmY,mmW,mmH);
      ctx.fillStyle='rgba(0,255,65,.2)'; ctx.font='7px "Share Tech Mono"'; ctx.textAlign='left';
      ctx.fillText(`MINIMAP  ${gs.onlinePlayers.size+1}P`, mmX+4, mmY+10);
      const mmWY=mmY+(WASTELAND_Y/WORLD_H)*mmH;
      ctx.strokeStyle='rgba(0,255,65,.2)'; ctx.setLineDash([2,2]);
      ctx.beginPath(); ctx.moveTo(mmX,mmWY); ctx.lineTo(mmX+mmW,mmWY); ctx.stroke(); ctx.setLineDash([]);
      for (const b of BUILDINGS) {
        const mx=mmX+(b.x/WORLD_W)*mmW, my=mmY+(b.y/WORLD_H)*mmH;
        const isLk=gs.buildingLocks.get(b.id)?.locked;
        ctx.fillStyle=isLk?'rgba(255,100,50,.5)':b.bright?'rgba(0,255,65,.8)':'rgba(0,180,50,.4)';
        ctx.fillRect(mx,my,Math.max(2,(b.w/WORLD_W)*mmW),Math.max(1,(b.h/WORLD_H)*mmH));
      }
      for (const e of gs.enemies) { if (e.dead) continue; ctx.fillStyle=ENEMY_COLORS[e.type]; ctx.fillRect(mmX+(e.x/WORLD_W)*mmW-1,mmY+(e.y/WORLD_H)*mmH-1,2,2); }
      // Online players on minimap (blue)
      for (const [,op] of gs.onlinePlayers) { ctx.fillStyle='#44aaff'; ctx.fillRect(mmX+(op.x/WORLD_W)*mmW-2,mmY+(op.y/WORLD_H)*mmH-2,3,3); }
      ctx.fillStyle='#00ff41'; ctx.shadowColor='#00ff41'; ctx.shadowBlur=4;
      ctx.fillRect(mmX+(gs.player.x/WORLD_W)*mmW-2,mmY+(gs.player.y/WORLD_H)*mmH-2,4,4);
      ctx.shadowBlur=0;
      ctx.fillStyle='rgba(0,255,65,.3)'; ctx.font='7px "Share Tech Mono"'; ctx.textAlign='left';
      ctx.fillText(`${Math.floor(gs.player.x)},${Math.floor(gs.player.y)}`, mmX+4, mmY+mmH-4);

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [character, dialog, showUpgrade, showPablo, showOffice, lockPrompt, isDead, voiceActive, isSpeaking]);

  if (!character) return <CharacterSelect onStart={handleCharacterStart} />;

  const nearOnlinePlayers = onlinePlayers.filter(p => Math.hypot(gsRef.current.player.x-p.x, gsRef.current.player.y-p.y) < NEARBY_CHAT_RANGE);

  return (
    <div style={{ width:'100vw', height:'100vh', overflow:'hidden', background:'#030803', position:'relative', fontFamily:"'Share Tech Mono',monospace" }}>
      <div style={{ position:'fixed', inset:0, background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.14) 2px,rgba(0,0,0,.14) 4px)', pointerEvents:'none', zIndex:9999 }} />
      <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />

      {/* ── TOP HUD ── */}
      <div style={{ position:'absolute', top:0, left:0, right:0, padding:'.35rem 1rem', background:'rgba(0,8,0,.92)', borderBottom:'1px solid rgba(0,255,65,.18)', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'1.25rem' }}>
          <span style={{ fontFamily:"'VT323',monospace", fontSize:'1.4rem', color:'#00ff41', textShadow:'0 0 10px rgba(0,255,65,.5)', letterSpacing:'.12em' }}>SALARYMAN</span>
          <span style={{ fontSize:'.6rem', color:'rgba(0,255,65,.4)', letterSpacing:'.08em' }}>{character.name} [{character.class.toUpperCase()}]</span>
          {gsRef.current.hasDevice && <span style={{ fontSize:'.55rem', color:'rgba(0,255,65,.6)', border:'1px solid rgba(0,255,65,.3)', padding:'1px 6px' }}>PABLO ✓</span>}
          <span style={{ fontSize:'.55rem', color:'rgba(100,200,255,.6)', border:'1px solid rgba(100,200,255,.25)', padding:'1px 6px' }}>{onlinePlayers.length + 1} ONLINE</span>
        </div>
        <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
          <span style={{ fontSize:'.5rem', color:'rgba(0,255,65,.25)', letterSpacing:'.07em' }}>WASD · SHIFT sprint · E enter · P pablo · C chat · V voice</span>
          <button onClick={() => { localStorage.removeItem('salaryman_character'); setCharacter(null); gsRef.current.enemies=spawnEnemies(); setIsDead(false); }} style={{ fontSize:'.5rem', color:'rgba(0,255,65,.3)', border:'1px solid rgba(0,255,65,.15)', background:'transparent', padding:'2px 8px', cursor:'pointer' }}>RESPAWN</button>
          <button onClick={() => navigate('/')} style={{ fontSize:'.5rem', color:'rgba(0,255,65,.3)', border:'1px solid rgba(0,255,65,.15)', background:'transparent', padding:'2px 8px', cursor:'pointer' }}>← EXIT</button>
        </div>
      </div>

      {/* ── BOTTOM HUD ── */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:100, background:'rgba(0,8,0,.9)', borderTop:'1px solid rgba(0,255,65,.18)', padding:'.5rem 1rem', display:'flex', alignItems:'center', gap:'1.25rem' }}>
        <StatRing value={stats.health} max={stats.maxHealth} color="#00ff41" label="HP" />
        <StatRing value={stats.stamina} max={stats.maxStamina} color="#44aaff" label="STM" size={40} />
        <div style={{ borderLeft:'1px solid rgba(0,255,65,.15)', paddingLeft:'1rem' }}>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.5rem', color:'#00ff41', textShadow:'0 0 8px rgba(0,255,65,.4)', letterSpacing:'.08em' }}>${stats.salary.toFixed(0)}</div>
          <div style={{ fontSize:'.5rem', color:'rgba(0,255,65,.3)', letterSpacing:'.1em' }}>SALARY</div>
        </div>
        <div style={{ flex:1, fontSize:'.7rem', color:'rgba(0,255,65,.65)', lineHeight:1.5, letterSpacing:'.04em', borderLeft:'1px solid rgba(0,255,65,.12)', paddingLeft:'1rem' }}>{narration}</div>
        {/* Voice button */}
        <button onClick={toggleVoice} style={{ flexShrink:0, padding:'.4rem .7rem', background:voiceActive?(isSpeaking?'rgba(0,255,200,.2)':'rgba(0,255,65,.1)'):'rgba(0,255,65,.04)', border:voiceActive?`1px solid ${isSpeaking?'rgba(0,255,200,.7)':'rgba(0,255,65,.5)'}`:'1px solid rgba(0,255,65,.15)', color:voiceActive?(isSpeaking?'#00ffcc':'#00ff41'):'rgba(0,255,65,.3)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' }}>
          {voiceActive ? <Mic size={14}/> : <MicOff size={14}/>}
          <span style={{ fontSize:'.45rem', letterSpacing:'.08em' }}>[V]</span>
        </button>
        {/* Chat button */}
        <button onClick={() => { setChatOpen(v=>!v); setUnreadWorld(0); }} style={{ flexShrink:0, padding:'.4rem .7rem', background:chatOpen?'rgba(0,255,65,.1)':'rgba(0,255,65,.04)', border:chatOpen?'1px solid rgba(0,255,65,.5)':'1px solid rgba(0,255,65,.15)', color:chatOpen?'#00ff41':'rgba(0,255,65,.3)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', position:'relative' }}>
          <MessageCircle size={14}/>
          {unreadWorld > 0 && <div style={{ position:'absolute', top:2, right:2, width:8, height:8, background:'#ff4444', borderRadius:'50%' }} />}
          <span style={{ fontSize:'.45rem', letterSpacing:'.08em' }}>[C]</span>
        </button>
        {/* PABLO button */}
        <div style={{ flexShrink:0, borderLeft:'1px solid rgba(0,255,65,.15)', paddingLeft:'.75rem', cursor:'pointer' }} onClick={() => setShowPablo(v=>!v)}>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.1rem', color:showPablo?'#00ff41':'rgba(0,255,65,.4)', textShadow:showPablo?'0 0 10px rgba(0,255,65,.6)':'none', letterSpacing:'.1em' }}>PABLO</div>
          <div style={{ fontSize:'.45rem', color:'rgba(0,255,65,.3)', letterSpacing:'.08em' }}>[P] DEVICE</div>
        </div>
      </div>

      {/* ── Chat Panel ── */}
      {chatOpen && (
        <div style={{ position:'absolute', bottom:'5rem', left:'1rem', width:360, maxHeight:'50vh', background:'rgba(0,8,0,.97)', border:'1px solid rgba(0,255,65,.4)', boxShadow:'0 0 20px rgba(0,255,65,.1)', display:'flex', flexDirection:'column', zIndex:200 }}>
          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid rgba(0,255,65,.2)' }}>
            {(['world','dm','nearby'] as const).map(tab => (
              <button key={tab} onClick={() => setChatTab(tab)} style={{ flex:1, padding:'.4rem', background:chatTab===tab?'rgba(0,255,65,.1)':'transparent', border:'none', borderRight:'1px solid rgba(0,255,65,.15)', color:chatTab===tab?'#00ff41':'rgba(0,255,65,.35)', fontFamily:"'VT323',monospace", fontSize:'.85rem', letterSpacing:'.1em', cursor:'pointer' }}>
                {tab==='world'?'WORLD':tab==='dm'?'DM':'NEARBY'}
              </button>
            ))}
            <button onClick={() => setChatOpen(false)} style={{ padding:'.4rem .6rem', background:'transparent', border:'none', color:'rgba(0,255,65,.3)', cursor:'pointer' }}><X size={12}/></button>
          </div>

          {/* DM target selector */}
          {chatTab === 'dm' && (
            <div style={{ padding:'.4rem .6rem', borderBottom:'1px solid rgba(0,255,65,.15)', display:'flex', gap:'.4rem', flexWrap:'wrap' }}>
              {onlinePlayers.length === 0
                ? <span style={{ fontSize:'.58rem', color:'rgba(0,255,65,.3)' }}>No other players online.</span>
                : onlinePlayers.map(p => (
                  <button key={p.id} onClick={() => setDmTarget({ id: p.id, name: p.name })} style={{ fontSize:'.6rem', padding:'2px 6px', background:dmTarget?.id===p.id?'rgba(0,255,65,.15)':'transparent', border:dmTarget?.id===p.id?'1px solid rgba(0,255,65,.5)':'1px solid rgba(0,255,65,.2)', color:dmTarget?.id===p.id?'#00ff41':'rgba(0,255,65,.45)', cursor:'pointer', fontFamily:"'Share Tech Mono',monospace" }}>
                    {p.name}
                  </button>
                ))
              }
            </div>
          )}

          {/* Nearby info */}
          {chatTab === 'nearby' && (
            <div style={{ padding:'.4rem .6rem', borderBottom:'1px solid rgba(0,255,65,.15)', fontSize:'.58rem', color:'rgba(0,255,65,.4)' }}>
              {nearOnlinePlayers.length > 0 ? `${nearOnlinePlayers.map(p=>p.name).join(', ')} nearby` : 'No players in range.'}
            </div>
          )}

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'.6rem', display:'flex', flexDirection:'column', gap:'.3rem', minHeight:80 }}>
            {chatTab === 'world' && (
              worldMessages.length === 0
                ? <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.2)' }}>World chat is empty. Say something.</div>
                : worldMessages.slice(-50).map(m => (
                  <div key={m.id} style={{ fontSize:'.68rem', lineHeight:1.5, color: m.from==='SYSTEM'?'rgba(0,255,65,.35)':'rgba(0,255,65,.75)' }}>
                    <span style={{ color:'rgba(0,255,65,.45)', fontFamily:"'VT323',monospace", fontSize:'.8rem' }}>[{m.from}]</span>{' '}{m.text}
                  </div>
                ))
            )}
            {chatTab === 'dm' && dmTarget && (
              (dmMessages.get(dmTarget.id) ?? []).map(m => (
                <div key={m.id} style={{ fontSize:'.68rem', lineHeight:1.5, color:'rgba(0,255,65,.75)' }}>
                  <span style={{ color:'rgba(0,255,65,.45)', fontFamily:"'VT323',monospace", fontSize:'.8rem' }}>[{m.from}]</span>{' '}{m.text}
                </div>
              ))
            )}
            {chatTab === 'nearby' && (
              <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.3)', lineHeight:1.7 }}>
                Voice chat is active for nearby players within range.<br/>
                Use world or DM chat to send text messages.
              </div>
            )}
          </div>

          {/* Input */}
          {chatTab !== 'nearby' && (
            <div style={{ padding:'.4rem', borderTop:'1px solid rgba(0,255,65,.15)', display:'flex', gap:'.4rem' }}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder={chatTab==='dm'?`DM ${dmTarget?.name??'...'}...`:'Message world...'} style={{ flex:1, background:'rgba(0,15,0,.9)', border:'1px solid rgba(0,255,65,.2)', color:'#00ff41', fontFamily:"'Share Tech Mono',monospace", fontSize:'.7rem', padding:'.3rem .5rem', outline:'none', caretColor:'#00ff41' }} />
              <button onClick={sendChat} style={{ background:'rgba(0,255,65,.1)', border:'1px solid rgba(0,255,65,.35)', color:'#00ff41', cursor:'pointer', padding:'0 .5rem' }}><Send size={11}/></button>
            </div>
          )}
        </div>
      )}

      {/* ── Online Players Sidebar ── */}
      {onlinePlayers.length > 0 && (
        <div style={{ position:'absolute', top:'2.5rem', right:'1rem', width:130, background:'rgba(0,8,0,.88)', border:'1px solid rgba(0,255,65,.2)', zIndex:100, padding:'.5rem' }}>
          <div style={{ fontSize:'.55rem', color:'rgba(0,255,65,.3)', letterSpacing:'.1em', marginBottom:'.3rem', display:'flex', alignItems:'center', gap:'.3rem' }}><Users size={9}/> ONLINE</div>
          {onlinePlayers.slice(0,8).map(p => (
            <div key={p.id} style={{ fontSize:'.6rem', color: speakingIds.has(p.id) ? '#00ffcc' : 'rgba(0,255,65,.55)', lineHeight:1.8, display:'flex', alignItems:'center', gap:'.3rem', cursor:'pointer' }}
              onClick={() => { setChatTab('dm'); setDmTarget({ id: p.id, name: p.name }); setChatOpen(true); }}>
              {speakingIds.has(p.id) && <span style={{ color:'#00ffcc' }}>🎙</span>}
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
              <span style={{ fontSize:'.5rem', color:'rgba(0,255,65,.2)' }}>[DM]</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Dialog ── */}
      {dialog && (
        <div style={{ position:'absolute', bottom:'5.5rem', left:'50%', transform:'translateX(-50%)', width:600, maxWidth:'90vw', background:'rgba(0,10,0,.97)', border:'1px solid rgba(0,255,65,.6)', boxShadow:'0 0 30px rgba(0,255,65,.12)', padding:'1.25rem', zIndex:200, cursor:'pointer' }} onClick={advanceDialog}>
          <div style={{ fontFamily:"'VT323',monospace", fontSize:'1rem', color:'rgba(0,255,65,.4)', letterSpacing:'.1em', marginBottom:'.5rem' }}>PABLO CORP. TRANSMISSION</div>
          <div style={{ fontSize:'.85rem', color:'#00ff41', lineHeight:1.7, letterSpacing:'.04em', minHeight:'2.5rem' }}>{dialog.lines[dialog.idx]}</div>
          <div style={{ marginTop:'.6rem', textAlign:'right', fontSize:'.55rem', color:'rgba(0,255,65,.35)', letterSpacing:'.1em' }}>[{dialog.idx+1}/{dialog.lines.length}] CLICK OR [SPACE] ▶</div>
        </div>
      )}

      {/* ── PABLO Device Panel ── */}
      {showPablo && (
        <div style={{ position:'absolute', bottom:'5rem', right:'1rem', width:360, maxHeight:'55vh', background:'rgba(0,10,0,.97)', border:'1px solid rgba(0,255,65,.5)', boxShadow:'0 0 30px rgba(0,255,65,.12)', display:'flex', flexDirection:'column', zIndex:200 }}>
          <div style={{ padding:'.75rem 1rem', borderBottom:'1px solid rgba(0,255,65,.2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.2rem', color:'#00ff41', letterSpacing:'.12em' }}>PABLO DEVICE</div>
              <div style={{ fontSize:'.55rem', color:'rgba(0,255,65,.35)', letterSpacing:'.08em' }}>{gsRef.current.hasDevice ? 'ACTIVATED' : 'NOT REGISTERED — VISIT PABLO STORE'}</div>
            </div>
            <button onClick={() => setShowPablo(false)} style={{ background:'transparent', border:'none', color:'rgba(0,255,65,.5)', cursor:'pointer' }}><X size={14}/></button>
          </div>
          {!gsRef.current.hasDevice ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', textAlign:'center' }}>
              <div>
                <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.4rem', color:'rgba(0,255,65,.4)', letterSpacing:'.1em', marginBottom:'.5rem' }}>DEVICE LOCKED</div>
                <div style={{ fontSize:'.63rem', color:'rgba(0,255,65,.35)', lineHeight:1.7 }}>Visit the <span style={{ color:'#00ff41' }}>PABLO STORE</span> in the city to register.</div>
                <button onClick={() => { setShowPablo(false); setNarration('> Navigate north-east to find the PABLO STORE.'); }} style={{ marginTop:'1rem', padding:'.4rem .9rem', background:'rgba(0,255,65,.1)', border:'1px solid rgba(0,255,65,.4)', color:'#00ff41', fontFamily:"'VT323',monospace", fontSize:'.9rem', letterSpacing:'.1em', cursor:'pointer' }}>FIND STORE ▶</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex:1, overflowY:'auto', padding:'.75rem', display:'flex', flexDirection:'column', gap:'.5rem', minHeight:100 }}>
                {pabloMessages.length===0 && <div style={{ fontSize:'.62rem', color:'rgba(0,255,65,.3)', lineHeight:1.7 }}>&gt; PABLO CORP. AI — ONLINE<br/>&gt; Ask me anything.</div>}
                {pabloMessages.map((m,i)=>(
                  <div key={i} style={{ fontSize:'.68rem', lineHeight:1.6, color:m.role==='user'?'rgba(0,255,65,.6)':'#00ff41', paddingLeft:m.role==='pablo'?'.5rem':0, borderLeft:m.role==='pablo'?'2px solid rgba(0,255,65,.3)':'none' }}>
                    <span style={{ color:'rgba(0,255,65,.4)', fontFamily:"'VT323',monospace", fontSize:'.8rem', marginRight:'.3rem' }}>{m.role==='user'?`[${character.name}]`:'[PABLO]'}</span>{m.text}
                  </div>
                ))}
                {pabloLoading && <div style={{ fontSize:'.62rem', color:'rgba(0,255,65,.4)', fontFamily:"'VT323',monospace" }}>PABLO PROCESSING_</div>}
              </div>
              <div style={{ padding:'.5rem', borderTop:'1px solid rgba(0,255,65,.2)', display:'flex', gap:'.4rem' }}>
                <input value={pabloInput} onChange={e=>setPabloInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendPablo()} placeholder="Message PABLO..." style={{ flex:1, background:'rgba(0,15,0,.9)', border:'1px solid rgba(0,255,65,.25)', color:'#00ff41', fontFamily:"'Share Tech Mono',monospace", fontSize:'.7rem', padding:'.35rem .5rem', outline:'none', caretColor:'#00ff41' }} />
                <button onClick={sendPablo} style={{ background:'rgba(0,255,65,.12)', border:'1px solid rgba(0,255,65,.4)', color:'#00ff41', cursor:'pointer', padding:'0 .5rem' }}><Send size={12}/></button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Office Panel ── */}
      {showOffice && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,5,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
          <div style={{ width:540, maxWidth:'92vw', border:'1px solid rgba(0,255,65,.6)', background:'rgba(0,15,0,.98)', boxShadow:'0 0 40px rgba(0,255,65,.15)', padding:'2rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' }}>
              <div>
                <div style={{ fontFamily:"'VT323',monospace", fontSize:'2rem', color:'#00ff41', letterSpacing:'.15em' }}>OFFICE TOWER</div>
                <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.4)', letterSpacing:'.08em', marginTop:'.2rem' }}>PUBLIC COMMERCIAL SPACE — PABLO CORP. MANAGED</div>
              </div>
              <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
                {rentedOffice && (
                  <button onClick={() => {
                    const lockInfo = buildingLockStatus.get('office');
                    if (lockInfo?.locked) setLockPrompt({ bid:'office', label:'OFFICE TOWER', mode:'change' });
                    else setLockPrompt({ bid:'office', label:'OFFICE TOWER', mode:'set' });
                  }} style={{ fontSize:'.6rem', padding:'3px 8px', background:'rgba(0,255,65,.08)', border:'1px solid rgba(0,255,65,.3)', color:'rgba(0,255,65,.6)', cursor:'pointer', display:'flex', alignItems:'center', gap:'.3rem', fontFamily:"'Share Tech Mono',monospace" }}>
                    <Lock size={10}/> {buildingLockStatus.get('office')?.locked ? 'LOCKED' : 'SET CODE'}
                  </button>
                )}
                <button onClick={() => setShowOffice(false)} style={{ background:'transparent', border:'none', color:'rgba(0,255,65,.4)', cursor:'pointer', fontFamily:"'VT323',monospace", fontSize:'1.1rem' }}>[ESC]</button>
              </div>
            </div>
            {rentedOffice && (
              <div style={{ marginBottom:'1rem', padding:'.5rem .75rem', border:'1px solid rgba(0,255,65,.4)', background:'rgba(0,255,65,.06)', fontSize:'.62rem', color:'#00ff41', letterSpacing:'.06em' }}>
                ▸ CURRENT LEASE: <b>{rentedOffice}</b> — Active. {buildingLockStatus.get('office')?.locked && <span style={{ color:'rgba(255,140,50,.8)' }}>🔒 Security code active.</span>}
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem', marginBottom:'1.5rem' }}>
              {([
                { tier:'HOT DESK',       price:50,   period:'/day', perks:['Open floor plan','Shared terminal','No lock code'] },
                { tier:'PRIVATE OFFICE', price:200,  period:'/mo',  perks:['Single room','Personal lock code','Alley view'] },
                { tier:'TEAM SUITE',     price:500,  period:'/mo',  perks:['4-desk suite','Conference room','Secure entry'] },
                { tier:'EXEC FLOOR',     price:1500, period:'/mo',  perks:['Full exec suite','PABLO adjacency','AI concierge'] },
              ] as { tier:string; price:number; period:string; perks:string[] }[]).map(({ tier, price, period, perks }) => {
                const isRented = rentedOffice === tier;
                const canAfford = stats.salary >= price;
                return (
                  <div key={tier} style={{ border:isRented?'1px solid rgba(0,255,65,.8)':'1px solid rgba(0,255,65,.2)', padding:'.9rem', background:isRented?'rgba(0,255,65,.08)':'transparent', position:'relative' }}>
                    {isRented && <div style={{ position:'absolute', top:5, right:6, fontSize:'.5rem', color:'#00ff41', fontFamily:"'VT323',monospace" }}>LEASED ✓</div>}
                    <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.1rem', color:isRented?'#00ff41':'rgba(0,255,65,.7)', letterSpacing:'.08em', marginBottom:'.2rem' }}>{tier}</div>
                    <div style={{ fontSize:'.75rem', color:isRented?'#00ff41':canAfford?'rgba(0,255,65,.6)':'rgba(255,100,100,.5)', fontFamily:"'VT323',monospace", marginBottom:'.4rem' }}>${price.toLocaleString()}<span style={{ fontSize:'.6rem' }}>{period}</span></div>
                    {perks.map(p => <div key={p} style={{ fontSize:'.57rem', color:'rgba(0,255,65,.4)', lineHeight:1.8 }}>· {p}</div>)}
                    <button onClick={() => {
                      const gs = gsRef.current;
                      if (isRented) { localStorage.removeItem('salaryman_office'); setRentedOffice(null); setNarration(`> Lease cancelled for ${tier}.`); return; }
                      if (!canAfford) { setNarration(`> Insufficient funds. ${tier} = $${price}. Balance: $${Math.floor(stats.salary)}.`); return; }
                      gs.stats.salary -= price; setStats({...gs.stats});
                      localStorage.setItem('salaryman_office', tier); setRentedOffice(tier);
                      setNarration(`> ${tier} leased. $${price} deducted. Access code ready. Set a security password from the lease panel.`);
                    }} style={{ marginTop:'.6rem', width:'100%', padding:'.3rem', background:isRented?'rgba(255,50,50,.08)':canAfford?'rgba(0,255,65,.1)':'rgba(0,255,65,.02)', border:isRented?'1px solid rgba(255,80,80,.35)':canAfford?'1px solid rgba(0,255,65,.45)':'1px solid rgba(0,255,65,.1)', color:isRented?'rgba(255,80,80,.7)':canAfford?'#00ff41':'rgba(0,255,65,.2)', fontFamily:"'VT323',monospace", fontSize:'.9rem', letterSpacing:'.1em', cursor:canAfford||isRented?'pointer':'default' }}>
                      {isRented?'CANCEL LEASE':canAfford?'RENT NOW':'INSUFFICIENT $'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize:'.55rem', color:'rgba(0,255,65,.2)', lineHeight:1.8, borderTop:'1px solid rgba(0,255,65,.1)', paddingTop:'.75rem' }}>
              Tenants may set a security password to restrict access to their space. PABLO Corp. assumes no liability for mutant incursion, gang activity, or infrastructure failure.
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade Panel ── */}
      {showUpgrade && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,5,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
          <div style={{ width:480, maxWidth:'90vw', border:'1px solid rgba(0,255,65,.7)', background:'rgba(0,15,0,.98)', boxShadow:'0 0 40px rgba(0,255,65,.2)', padding:'2rem' }}>
            <div style={{ fontFamily:"'VT323',monospace", fontSize:'2rem', color:'#00ff41', textShadow:'0 0 15px rgba(0,255,65,.5)', letterSpacing:'.15em', marginBottom:'.25rem' }}>PABLO DEVICE</div>
            <div style={{ fontSize:'.6rem', color:'rgba(0,255,65,.4)', letterSpacing:'.08em', marginBottom:'1.5rem' }}>REGISTERED TO {character.name}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem', marginBottom:'1.5rem' }}>
              {([['FREE',['PABLO AI chat','Basic comms','World access','ATM access']],['PRO — $29/mo',['PABLO AI Pro','Live Listen','Scan Screen','Say This / Hints','Presenter Mode','Contacts & CRM','Workspace']]] as [string,string[]][]).map(([tier,features])=>(
                <div key={tier} style={{ border:tier==='FREE'?'1px solid rgba(0,255,65,.2)':'1px solid rgba(0,255,65,.6)', padding:'1rem', background:tier!=='FREE'?'rgba(0,255,65,.06)':'transparent' }}>
                  <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.1rem', color:tier==='FREE'?'rgba(0,255,65,.5)':'#00ff41', letterSpacing:'.1em', marginBottom:'.5rem' }}>{tier}</div>
                  {features.map(f=><div key={f} style={{ fontSize:'.6rem', color:tier==='FREE'?'rgba(0,255,65,.4)':'rgba(0,255,65,.7)', lineHeight:2 }}>▸ {f}</div>)}
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:'.75rem' }}>
              <button onClick={()=>{setShowUpgrade(false);navigate('/upgrade');}} style={{ flex:1, padding:'.75rem', background:'rgba(0,255,65,.14)', border:'1px solid rgba(0,255,65,.7)', color:'#00ff41', fontFamily:"'VT323',monospace", fontSize:'1.2rem', letterSpacing:'.15em', cursor:'pointer' }}>UPGRADE TO PRO</button>
              <button onClick={()=>{setShowUpgrade(false);setNarration(`> PABLO device activated for ${character.name}. Press [P] to open.`);}} style={{ padding:'.75rem 1.25rem', background:'transparent', border:'1px solid rgba(0,255,65,.2)', color:'rgba(0,255,65,.45)', fontFamily:"'Share Tech Mono',monospace", fontSize:'.65rem', cursor:'pointer' }}>TAKE FREE</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Building Password Prompt ── */}
      {lockPrompt && (
        <PasswordPrompt
          buildingLabel={lockPrompt.label}
          mode={lockPrompt.mode}
          ownerName={lockPrompt.ownerName}
          onSubmit={(pw, cur) => {
            if (lockPrompt.mode === 'enter') {
              wsSend({ type: 'building_lock_check', buildingId: lockPrompt.bid, password: pw });
            } else if (lockPrompt.mode === 'set') {
              wsSend({ type: 'building_lock_set', buildingId: lockPrompt.bid, password: pw });
            } else {
              wsSend({ type: 'building_lock_set', buildingId: lockPrompt.bid, password: pw, currentPassword: cur });
            }
          }}
          onCancel={() => { setLockPrompt(null); setPendingEnter(null); }}
        />
      )}

      {/* ── Death Screen ── */}
      {isDead && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'VT323',monospace", fontSize:'4rem', color:'#ff2222', textShadow:'0 0 30px rgba(255,0,0,.5)', letterSpacing:'.15em', marginBottom:'1rem' }}>YOU DIED</div>
            <div style={{ fontSize:'.7rem', color:'rgba(255,50,50,.6)', letterSpacing:'.1em', marginBottom:'2rem' }}>The wasteland doesn't negotiate.</div>
            <button onClick={() => {
              const gs = gsRef.current;
              gs.stats.health=gs.stats.maxHealth; gs.stats.stamina=gs.stats.maxStamina;
              gs.player={x:character.startX,y:character.startY};
              gs.enemies=spawnEnemies(); gs.invincible=120;
              setStats({...gs.stats}); setIsDead(false);
              setNarration('> Respawned. Watch your back.');
            }} style={{ padding:'.75rem 2rem', background:'rgba(255,0,0,.1)', border:'1px solid rgba(255,50,50,.5)', color:'#ff4444', fontFamily:"'VT323',monospace", fontSize:'1.5rem', letterSpacing:'.2em', cursor:'pointer' }}>RESPAWN</button>
          </div>
        </div>
      )}
    </div>
  );
}
