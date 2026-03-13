import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { X, Send } from 'lucide-react';

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
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `NPC-${String(i + 100).padStart(3, '0')}`,
    x: 200 + Math.floor(Math.abs(Math.sin(i * 2.4)) * 900),
    y: 200 + Math.floor(Math.abs(Math.cos(i * 1.7)) * 600),
    type: ['corp', 'human', 'android'][i % 3] as string,
  })),
];

const NPC_COLORS: Record<string, string> = {
  corp: '#00cc33', human: '#009922', android: '#33ffaa', mutant: '#88ff44',
};

// ── Enemy spawn data ──────────────────────────────────────────────────────────
interface Enemy {
  id: number; x: number; y: number; dx: number; dy: number;
  type: 'gang' | 'mutant' | 'raider';
  state: 'patrol' | 'chase' | 'attack';
  health: number; maxHealth: number;
  patrolX: number; patrolY: number; patrolTimer: number;
  dead: boolean;
}

const spawnEnemies = (): Enemy[] => {
  const list: Enemy[] = [];
  const gang = [
    [680, 620], [1060, 550], [380, 640], [1200, 560], [550, 660], [800, 650],
  ];
  const mutants = [
    [480, 1460], [720, 1500], [900, 1530], [350, 1600], [1050, 1470],
    [650, 1650], [820, 1580], [1100, 1550], [450, 1700], [700, 1700],
  ];
  const raiders = [
    [570, 1350], [950, 1400], [300, 1450], [1150, 1350],
  ];
  gang.forEach(([x, y], i) => list.push({ id: i, x, y, dx: 0, dy: 0, type: 'gang', state: 'patrol', health: 40, maxHealth: 40, patrolX: x, patrolY: y, patrolTimer: 0, dead: false }));
  mutants.forEach(([x, y], i) => list.push({ id: 100 + i, x, y, dx: 0, dy: 0, type: 'mutant', state: 'patrol', health: 80, maxHealth: 80, patrolX: x, patrolY: y, patrolTimer: 0, dead: false }));
  raiders.forEach(([x, y], i) => list.push({ id: 200 + i, x, y, dx: 0, dy: 0, type: 'raider', state: 'patrol', health: 55, maxHealth: 55, patrolX: x, patrolY: y, patrolTimer: 0, dead: false }));
  return list;
};

const ENEMY_COLORS: Record<string, string> = { gang: '#ff4444', mutant: '#aaff44', raider: '#ff8800' };
const ENEMY_DAMAGE: Record<string, number> = { gang: 0.3, mutant: 0.5, raider: 0.4 };

// ── PABLO store dialog ────────────────────────────────────────────────────────
const PABLO_STORE_LINES = [
  '> PABLO CORP. DEVICE — TRANSMISSION ACTIVE',
  '> The city is collapsing around you. The wasteland is worse.',
  '> In this world, information is the only currency that matters.',
  '> A PABLO device gives you access to everything: comms, intel, job listings, contacts.',
  '> Without one, you\'re just another ghost.',
  '> ...',
  '> PABLO Corp. is still accepting new accounts.',
  '> Press [ACTIVATE] to register your device.',
];

// ── CharacterSelect ───────────────────────────────────────────────────────────
type CharClass = 'corporate' | 'outcast' | 'replicant';
interface CharData { name: string; class: CharClass; startX: number; startY: number; }

function CharacterSelect({ onStart }: { onStart: (c: CharData) => void }) {
  const [name, setName] = useState('');
  const [cls, setCls] = useState<CharClass>('corporate');
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 600); return () => clearInterval(id); }, []);
  const CLASSES = [
    { id: 'corporate' as CharClass, label: 'CORPORATE', desc: 'City dweller. High salary. Connected. Weak in the wasteland.', sx: 820, sy: 430 },
    { id: 'outcast'   as CharClass, label: 'OUTCAST',   desc: 'Wasteland born. Tough and stealthy. Poor. Hunted in the city.', sx: 600, sy: 1450 },
    { id: 'replicant' as CharClass, label: 'REPLICANT', desc: 'Android faction. Balanced stats. Distrusted everywhere.', sx: 720, sy: 420 },
  ];
  const sel = CLASSES.find(c => c.id === cls)!;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030803', fontFamily: "'Share Tech Mono', monospace", position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents: 'none', zIndex: 9999 }} />
      <div style={{ maxWidth: 600, width: '100%', padding: '2rem', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '3.5rem', color: '#00ff41', textShadow: '0 0 20px rgba(0,255,65,.6)', letterSpacing: '.15em' }}>SALARYMAN</div>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.12em' }}>PABLO CORP. — WORLD INITIALIZATION</div>
          <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', marginTop: '.3rem' }}>SELECT OPERATIVE CLASS {tick % 2 === 0 ? '_' : ' '}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem', marginBottom: '1.5rem' }}>
          {CLASSES.map(c => (
            <button key={c.id} onClick={() => setCls(c.id)} style={{ padding: '1rem .5rem', border: cls === c.id ? '1px solid rgba(0,255,65,.8)' : '1px solid rgba(0,255,65,.2)', background: cls === c.id ? 'rgba(0,255,65,.1)' : 'rgba(0,255,65,.02)', color: cls === c.id ? '#00ff41' : 'rgba(0,255,65,.4)', cursor: 'pointer', textAlign: 'center', boxShadow: cls === c.id ? '0 0 16px rgba(0,255,65,.2)' : 'none', transition: 'all .15s' }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.3rem', letterSpacing: '.1em', marginBottom: '.3rem' }}>{c.label}</div>
              <div style={{ fontSize: '.58rem', lineHeight: 1.5, color: cls === c.id ? 'rgba(0,255,65,.7)' : 'rgba(0,255,65,.3)' }}>{c.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.12em', marginBottom: '.4rem' }}>OPERATIVE DESIGNATION</div>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && onStart({ name: name.trim().toUpperCase(), class: cls, startX: sel.sx, startY: sel.sy })} maxLength={20} placeholder="ENTER NAME..." autoFocus style={{ width: '100%', padding: '.6rem .8rem', background: 'rgba(0,15,0,.9)', border: '1px solid rgba(0,255,65,.35)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '1rem', letterSpacing: '.1em', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }} />
        </div>
        <button onClick={() => name.trim() && onStart({ name: name.trim().toUpperCase(), class: cls, startX: sel.sx, startY: sel.sy })} disabled={!name.trim()} style={{ width: '100%', padding: '.8rem', background: name.trim() ? 'rgba(0,255,65,.14)' : 'rgba(0,255,65,.03)', border: name.trim() ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.15)', color: name.trim() ? '#00ff41' : 'rgba(0,255,65,.2)', fontFamily: "'VT323',monospace", fontSize: '1.5rem', letterSpacing: '.2em', cursor: name.trim() ? 'pointer' : 'default', transition: 'all .15s', boxShadow: name.trim() ? '0 0 20px rgba(0,255,65,.15)' : 'none' }}>
          ENTER THE WORLD {tick % 2 === 0 ? '▶' : '▷'}
        </button>
        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.08em' }}>SALARYMAN ALPHA — PICASSOO.AI / PABLO CORP.</div>
      </div>
    </div>
  );
}

// ── Stat Ring component (RDR2 style) ──────────────────────────────────────────
function StatRing({ value, max, color, label, size = 52 }: { value: number; max: number; color: string; label: string; size?: number }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ textAlign: 'center', width: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,255,65,0.1)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.2s', filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
      <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color, letterSpacing: '.08em', marginTop: '-2px' }}>{label}</div>
    </div>
  );
}

// ── Main World ────────────────────────────────────────────────────────────────
export default function World() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
  });

  const animRef = useRef(0);
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender(n => n + 1), []);

  const [character, setCharacter] = useState<CharData | null>(() => {
    try { const s = localStorage.getItem('salaryman_character'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [dialog, setDialog] = useState<{ lines: string[]; idx: number; bid: string } | null>(null);
  const [narration, setNarration] = useState('PABLO CORP. DEVICE v1.0 — WASD/ARROWS to move. [E] interact. [P] PABLO device.');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showPablo, setShowPablo] = useState(false);
  const [showOffice, setShowOffice] = useState(false);
  const [rentedOffice, setRentedOffice] = useState<string | null>(() => localStorage.getItem('salaryman_office'));
  const [pabloInput, setPabloInput] = useState('');
  const [pabloMessages, setPabloMessages] = useState<{ role: 'user' | 'pablo'; text: string }[]>([]);
  const [pabloLoading, setPabloLoading] = useState(false);
  const [nearBuilding, setNearBuilding] = useState<string | null>(null);
  const [stats, setStats] = useState({ health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, salary: 0, level: 1 });
  const [isDead, setIsDead] = useState(false);

  // Save character
  const handleCharacterStart = useCallback((c: CharData) => {
    localStorage.setItem('salaryman_character', JSON.stringify(c));
    const gs = gsRef.current;
    gs.player = { x: c.startX, y: c.startY };
    if (c.class === 'outcast') gs.stats.salary = 0;
    else if (c.class === 'corporate') gs.stats.salary = 500;
    else gs.stats.salary = 200;
    setCharacter(c);
    setStats({ ...gs.stats });
    setTimeout(() => setNarration(`> ${c.name} [${c.class.toUpperCase()}] — Entering the world. Find the PABLO STORE to activate your device. [P] to try your device.`), 400);
  }, []);

  // Keys
  useEffect(() => {
    if (!character) return;
    const down = (e: KeyboardEvent) => {
      gsRef.current.keys.add(e.key.toLowerCase());
      if (e.key === 'p' || e.key === 'P') {
        setShowPablo(v => !v);
        setShowUpgrade(false);
      }
      if ((e.key === 'e' || e.key === 'E') && gsRef.current.nearBuilding && !dialog && !showPablo) {
        handleEnter(gsRef.current.nearBuilding);
      }
      if (e.key === 'Escape') { setDialog(null); setShowUpgrade(false); setShowPablo(false); setShowOffice(false); }
    };
    const up = (e: KeyboardEvent) => gsRef.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [character, dialog, showPablo]);

  const handleEnter = (bid: string) => {
    if (bid === 'pablo_store') {
      setDialog({ lines: PABLO_STORE_LINES, idx: 0, bid });
      setNarration('> PABLO STORE — PABLO Corp. device activation center.');
    } else if (bid === 'clinic') {
      const gs = gsRef.current;
      if (gs.stats.salary >= 100) {
        gs.stats.health = gs.stats.maxHealth;
        gs.stats.salary -= 100;
        setStats({ ...gs.stats });
        setNarration('> MED CLINIC — [$100 charged] Health restored. "Stay out of the wasteland."');
      } else {
        setNarration('> MED CLINIC — "That\'ll be $100. You can\'t afford it. Get out."');
      }
    } else if (bid === 'office') {
      setShowOffice(true);
    } else if (bid === 'megabank') {
      setNarration('> MOGUL BANK — "Access restricted to account holders. Your balance: insufficient to matter."');
    } else if (bid === 'atm') {
      const gs = gsRef.current;
      gs.stats.salary += 50;
      setStats({ ...gs.stats });
      setNarration('> ATM — Transaction complete. +$50 from odd jobs. Balance updated.');
    } else if (bid === 'pablo_hq') {
      setNarration('> PABLO CORP. HQ — "Employee access only. Security androids are watching."');
    } else {
      const b = BUILDINGS.find(b => b.id === bid);
      setNarration(`> ${b?.label ?? bid} — Locked. Come back with better credentials.`);
    }
  };

  // Dialog advance
  const advanceDialog = useCallback(() => {
    if (!dialog) return;
    if (dialog.idx < dialog.lines.length - 1) {
      setDialog(d => d ? { ...d, idx: d.idx + 1 } : null);
    } else {
      if (dialog.bid === 'pablo_store') { gsRef.current.hasDevice = true; setShowUpgrade(true); }
      setDialog(null);
    }
  }, [dialog]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && dialog) { e.preventDefault(); advanceDialog(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [advanceDialog, dialog]);

  // PABLO AI send
  const sendPablo = useCallback(async () => {
    if (!pabloInput.trim() || pabloLoading) return;
    const gs = gsRef.current;
    const msg = pabloInput.trim();
    setPabloInput('');
    setPabloMessages(m => [...m, { role: 'user', text: msg }]);
    if (!gs.hasDevice) {
      setPabloMessages(m => [...m, { role: 'pablo', text: '> PABLO DEVICE NOT ACTIVATED. Visit the PABLO STORE in the city to register your device.' }]);
      return;
    }
    setPabloLoading(true);
    try {
      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, context: `The user is playing Salaryman, a post-apocalyptic RPG world. They are ${character?.name}, a ${character?.class}. Respond as PABLO, the in-world AI assistant made by PABLO Corp. Keep responses short and gritty.` }),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setPabloMessages(m => [...m, { role: 'pablo', text: data.response ?? '> SIGNAL LOST.' }]);
      } else {
        setPabloMessages(m => [...m, { role: 'pablo', text: '> CONNECTION UNSTABLE. Try again.' }]);
      }
    } catch {
      setPabloMessages(m => [...m, { role: 'pablo', text: '> NETWORK DEAD. Are you in a dead zone?' }]);
    }
    setPabloLoading(false);
  }, [pabloInput, pabloLoading, character]);

  // ── Game loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!character) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    let lastStats = { ...gsRef.current.stats };
    let lastNear: string | null = null;
    let lastDead = false;

    const loop = () => {
      const gs = gsRef.current;
      gs.frameCount++;
      gs.blink = Math.floor(gs.frameCount / 28) % 2;
      if (gs.invincible > 0) gs.invincible--;
      if (gs.damageFlash > 0) gs.damageFlash--;

      const frozen = !!dialog || showUpgrade || showPablo || showOffice || isDead;

      // ── Player movement ──
      if (!frozen) {
        let dx = 0, dy = 0;
        if (gs.keys.has('arrowleft')  || gs.keys.has('a')) dx -= PLAYER_SPEED;
        if (gs.keys.has('arrowright') || gs.keys.has('d')) dx += PLAYER_SPEED;
        if (gs.keys.has('arrowup')    || gs.keys.has('w')) dy -= PLAYER_SPEED;
        if (gs.keys.has('arrowdown')  || gs.keys.has('s')) dy += PLAYER_SPEED;
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }

        // Stamina sprint
        const sprinting = gs.keys.has('shift') && (dx !== 0 || dy !== 0);
        if (sprinting && gs.stats.stamina > 0) { dx *= 1.8; dy *= 1.8; gs.stats.stamina = Math.max(0, gs.stats.stamina - 0.4); }
        else if (!sprinting) gs.stats.stamina = Math.min(gs.stats.maxStamina, gs.stats.stamina + 0.15);

        const col = (px: number, py: number) =>
          BUILDINGS.some(b => px + PLAYER_SIZE > b.x && px - PLAYER_SIZE < b.x + b.w && py + PLAYER_SIZE > b.y && py - PLAYER_SIZE < b.y + b.h);
        let nx = gs.player.x + dx, ny = gs.player.y + dy;
        if (col(nx, gs.player.y)) nx = gs.player.x;
        if (col(gs.player.x, ny)) ny = gs.player.y;
        gs.player.x = Math.max(PLAYER_SIZE, Math.min(WORLD_W - PLAYER_SIZE, nx));
        gs.player.y = Math.max(PLAYER_SIZE, Math.min(WORLD_H - PLAYER_SIZE, ny));
      }

      // ── Enemy AI ──
      for (const e of gs.enemies) {
        if (e.dead) continue;
        const dist = Math.hypot(gs.player.x - e.x, gs.player.y - e.y);
        const spd = e.type === 'gang' ? ENEMY_SPEED_CITY : ENEMY_SPEED_WASTE;

        if (dist < ENEMY_ATTACK_RANGE) {
          e.state = 'attack';
          if (gs.invincible === 0) {
            gs.stats.health = Math.max(0, gs.stats.health - ENEMY_DAMAGE[e.type]);
            gs.invincible = 20;
            gs.damageFlash = 8;
          }
        } else if (dist < ENEMY_DETECT) {
          e.state = 'chase';
          const ang = Math.atan2(gs.player.y - e.y, gs.player.x - e.x);
          e.dx = Math.cos(ang) * spd;
          e.dy = Math.sin(ang) * spd;
        } else {
          e.state = 'patrol';
          e.patrolTimer--;
          if (e.patrolTimer <= 0) {
            const ang = Math.random() * Math.PI * 2;
            e.dx = Math.cos(ang) * spd * 0.5;
            e.dy = Math.sin(ang) * spd * 0.5;
            e.patrolTimer = 80 + Math.floor(Math.random() * 80);
          }
        }

        if (e.state !== 'attack') {
          const ne = { x: e.x + e.dx, y: e.y + e.dy };
          const col = BUILDINGS.some(b => ne.x > b.x && ne.x < b.x + b.w && ne.y > b.y && ne.y < b.y + b.h);
          if (!col) { e.x = Math.max(10, Math.min(WORLD_W - 10, ne.x)); e.y = Math.max(10, Math.min(WORLD_H - 10, ne.y)); }
          else { e.dx = -e.dx; e.dy = -e.dy; e.patrolTimer = 0; }
        }
      }

      // ── Death check ──
      if (gs.stats.health <= 0 && !lastDead) {
        lastDead = true;
        setIsDead(true);
      }

      // ── Camera ──
      const cw = canvas.width, ch = canvas.height;
      gs.camera.x = Math.max(0, Math.min(WORLD_W - cw, gs.player.x - cw / 2));
      gs.camera.y = Math.max(0, Math.min(WORLD_H - ch, gs.player.y - ch / 2));
      const ox = -gs.camera.x, oy = -gs.camera.y;

      // ── Proximity check ──
      let near: string | null = null;
      for (const b of BUILDINGS) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (Math.hypot(gs.player.x - cx, gs.player.y - cy) < INTERACT_RANGE) { near = b.id; break; }
      }
      gs.nearBuilding = near;
      if (near !== lastNear) {
        lastNear = near;
        if (near && !dialog && !frozen) {
          const b = BUILDINGS.find(bb => bb.id === near);
          setNarration(`> Approaching ${b?.label} — Press [E] to interact.`);
        }
        setNearBuilding(near);
      }

      // ── Sync stats to React ──
      const s = gs.stats;
      if (s.health !== lastStats.health || s.stamina !== lastStats.stamina || s.salary !== lastStats.salary) {
        lastStats = { ...s };
        setStats({ ...s });
      }

      // ─────────────────────────────────────────────────────────────
      // RENDER
      // ─────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, cw, ch);

      // Damage flash
      if (gs.damageFlash > 0) {
        ctx.fillStyle = `rgba(255,0,0,${gs.damageFlash * 0.04})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      ctx.fillStyle = '#030803';
      ctx.fillRect(0, 0, cw, ch);

      // Grid
      ctx.strokeStyle = 'rgba(0,255,65,0.04)';
      ctx.lineWidth = 1;
      const sgx = Math.floor(gs.camera.x / TILE) * TILE;
      const sgy = Math.floor(gs.camera.y / TILE) * TILE;
      for (let gx = sgx; gx < gs.camera.x + cw + TILE; gx += TILE) { ctx.beginPath(); ctx.moveTo(gx + ox, 0); ctx.lineTo(gx + ox, ch); ctx.stroke(); }
      for (let gy = sgy; gy < gs.camera.y + ch + TILE; gy += TILE) { ctx.beginPath(); ctx.moveTo(0, gy + oy); ctx.lineTo(cw, gy + oy); ctx.stroke(); }

      // Zone labels + border
      const wbY = WASTELAND_Y + oy;
      if (wbY > 0 && wbY < ch) {
        ctx.strokeStyle = 'rgba(0,255,65,0.15)'; ctx.setLineDash([8, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, wbY); ctx.lineTo(cw, wbY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,255,65,0.2)'; ctx.font = '9px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('── WASTELAND BORDER ──', cw / 2, wbY - 5);
      }
      // Ambient zone watermarks
      const inCity = gs.player.y < WASTELAND_Y;
      ctx.fillStyle = inCity ? 'rgba(0,255,65,0.025)' : 'rgba(100,255,50,0.03)';
      ctx.font = '72px "VT323"'; ctx.textAlign = 'center';
      ctx.fillText(inCity ? 'CITY SECTOR' : 'WASTELAND', cw / 2, ch / 2);

      // Roads
      ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(0,255,65,0.07)';
      ctx.beginPath(); ctx.moveTo(0, 700 + oy); ctx.lineTo(WORLD_W + ox, 700 + oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(800 + ox, 0); ctx.lineTo(800 + ox, WORLD_H + oy); ctx.stroke();
      ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(0, 250 + oy); ctx.lineTo(WORLD_W + ox, 250 + oy); ctx.stroke();
      ctx.setLineDash([16, 8]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,255,65,0.06)';
      ctx.beginPath(); ctx.moveTo(0, 700 + oy); ctx.lineTo(WORLD_W + ox, 700 + oy); ctx.stroke();
      ctx.setLineDash([]);

      // Buildings
      for (const b of BUILDINGS) {
        const bx = b.x + ox, by = b.y + oy;
        if (bx + b.w < 0 || bx > cw || by + b.h < 0 || by > ch) continue;
        const isNear = near === b.id;
        ctx.strokeStyle = b.bright ? `rgba(0,255,65,${isNear ? .9 : .55})` : `rgba(0,180,50,${isNear ? .7 : .35})`;
        ctx.lineWidth = isNear ? 2 : 1;
        ctx.strokeRect(bx, by, b.w, b.h);
        ctx.fillStyle = `rgba(0,${b.bright ? 255 : 160},50,0.04)`;
        ctx.fillRect(bx, by, b.w, b.h);
        // Corner brackets
        const cs = 8; ctx.strokeStyle = b.bright ? 'rgba(0,255,65,.8)' : 'rgba(0,200,50,.45)'; ctx.lineWidth = 1.5;
        [[bx, by, 1, 1], [bx + b.w, by, -1, 1], [bx, by + b.h, 1, -1], [bx + b.w, by + b.h, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(cx2, cy2 + sy * cs); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + sx * cs, cy2); ctx.stroke();
        });
        ctx.fillStyle = b.bright ? (isNear ? '#00ff41' : 'rgba(0,255,65,.65)') : 'rgba(0,200,50,.45)';
        ctx.font = `${b.bright ? 11 : 9}px "Share Tech Mono"`; ctx.textAlign = 'center';
        ctx.fillText(b.label, bx + b.w / 2, by + b.h / 2 + 4);
        if (isNear) {
          ctx.fillStyle = gs.blink ? 'rgba(0,255,65,.9)' : 'rgba(0,255,65,.4)';
          ctx.font = '9px "Share Tech Mono"'; ctx.fillText('[E] ENTER', bx + b.w / 2, by - 8);
        }
      }

      // Friendly NPCs
      for (const npc of NPCS) {
        const nx2 = npc.x + ox, ny2 = npc.y + oy;
        if (nx2 < -20 || nx2 > cw + 20 || ny2 < -20 || ny2 > ch + 20) continue;
        const col = NPC_COLORS[npc.type] ?? '#009922';
        ctx.fillStyle = col; ctx.fillRect(nx2 - 3, ny2 - 3, 6, 6);
        const d = Math.hypot(gs.player.x - npc.x, gs.player.y - npc.y);
        if (d < 90) { ctx.fillStyle = 'rgba(0,255,65,.45)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center'; ctx.fillText(npc.name, nx2, ny2 - 8); }
      }

      // Enemies
      for (const e of gs.enemies) {
        if (e.dead) continue;
        const ex = e.x + ox, ey = e.y + oy;
        if (ex < -20 || ex > cw + 20 || ey < -20 || ey > ch + 20) continue;
        const ec = ENEMY_COLORS[e.type];
        const chasing = e.state === 'chase' || e.state === 'attack';
        // Body
        ctx.shadowColor = ec; ctx.shadowBlur = chasing ? 10 : 4;
        ctx.fillStyle = chasing ? ec : `${ec}88`;
        ctx.fillRect(ex - 5, ey - 5, 10, 10);
        ctx.shadowBlur = 0;
        // Health bar
        const hbW = 20, hbH = 3;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(ex - hbW / 2, ey - 12, hbW, hbH);
        ctx.fillStyle = ec; ctx.fillRect(ex - hbW / 2, ey - 12, hbW * (e.health / e.maxHealth), hbH);
        // Name on chase
        if (chasing) {
          ctx.fillStyle = ec; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText(e.type.toUpperCase(), ex, ey - 15);
        }
      }

      // Player
      const px = gs.player.x + ox, py = gs.player.y + oy;
      const playerCol = gs.invincible % 4 < 2 ? '#00ff41' : 'rgba(0,255,65,.3)';
      ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 12;
      ctx.fillStyle = playerCol;
      ctx.beginPath(); ctx.moveTo(px, py - PLAYER_SIZE); ctx.lineTo(px + PLAYER_SIZE * .7, py + PLAYER_SIZE * .5); ctx.lineTo(px - PLAYER_SIZE * .7, py + PLAYER_SIZE * .5); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      if (character) {
        ctx.fillStyle = 'rgba(0,255,65,.7)'; ctx.font = 'bold 9px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText(character.name, px, py - PLAYER_SIZE - 4);
      }

      // ── Mini-map ──
      const mmW = 130, mmH = 90, mmX = cw - mmW - 12, mmY = 50;
      ctx.fillStyle = 'rgba(0,8,0,.9)'; ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeStyle = 'rgba(0,255,65,.3)'; ctx.lineWidth = 1; ctx.strokeRect(mmX, mmY, mmW, mmH);
      ctx.fillStyle = 'rgba(0,255,65,.2)'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'left';
      ctx.fillText('MINIMAP', mmX + 4, mmY + 10);
      // Wasteland line
      const mmWY = mmY + (WASTELAND_Y / WORLD_H) * mmH;
      ctx.strokeStyle = 'rgba(0,255,65,.2)'; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(mmX, mmWY); ctx.lineTo(mmX + mmW, mmWY); ctx.stroke(); ctx.setLineDash([]);
      // Buildings
      for (const b of BUILDINGS) {
        const mx = mmX + (b.x / WORLD_W) * mmW, my = mmY + (b.y / WORLD_H) * mmH;
        ctx.fillStyle = b.bright ? 'rgba(0,255,65,.8)' : 'rgba(0,180,50,.4)';
        ctx.fillRect(mx, my, Math.max(2, (b.w / WORLD_W) * mmW), Math.max(1, (b.h / WORLD_H) * mmH));
      }
      // Enemies on map
      for (const e of gs.enemies) {
        if (e.dead) continue;
        const ex2 = mmX + (e.x / WORLD_W) * mmW, ey2 = mmY + (e.y / WORLD_H) * mmH;
        ctx.fillStyle = ENEMY_COLORS[e.type]; ctx.fillRect(ex2 - 1, ey2 - 1, 2, 2);
      }
      // Player dot
      ctx.fillStyle = '#00ff41'; ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 4;
      ctx.fillRect(mmX + (gs.player.x / WORLD_W) * mmW - 2, mmY + (gs.player.y / WORLD_H) * mmH - 2, 4, 4);
      ctx.shadowBlur = 0;
      // Coords
      ctx.fillStyle = 'rgba(0,255,65,.3)'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'left';
      ctx.fillText(`${Math.floor(gs.player.x)},${Math.floor(gs.player.y)}`, mmX + 4, mmY + mmH - 4);
      // Legend
      ctx.fillStyle = 'rgba(255,68,68,.8)'; ctx.fillRect(mmX + mmW - 28, mmY + 4, 5, 5);
      ctx.fillStyle = 'rgba(255,68,68,.6)'; ctx.font = '6px "Share Tech Mono"'; ctx.textAlign = 'left';
      ctx.fillText('THREAT', mmX + mmW - 21, mmY + 9);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [character, dialog, showUpgrade, showPablo, showOffice, isDead]);

  if (!character) return <CharacterSelect onStart={handleCharacterStart} />;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#030803', position: 'relative', fontFamily: "'Share Tech Mono',monospace" }}>
      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.14) 2px,rgba(0,0,0,.14) 4px)', pointerEvents: 'none', zIndex: 9999 }} />

      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* ── TOP HUD ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '.35rem 1rem', background: 'rgba(0,8,0,.92)', borderBottom: '1px solid rgba(0,255,65,.18)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '1.4rem', color: '#00ff41', textShadow: '0 0 10px rgba(0,255,65,.5)', letterSpacing: '.12em' }}>SALARYMAN</span>
          <span style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.08em' }}>{character.name} [{character.class.toUpperCase()}]</span>
          {gsRef.current.hasDevice && <span style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.6)', border: '1px solid rgba(0,255,65,.3)', padding: '1px 6px' }}>PABLO DEVICE ✓</span>}
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.07em' }}>WASD MOVE · SHIFT SPRINT · E INTERACT · P PABLO</span>
          <button onClick={() => { localStorage.removeItem('salaryman_character'); setCharacter(null); gsRef.current.enemies = spawnEnemies(); setIsDead(false); }} style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', border: '1px solid rgba(0,255,65,.15)', background: 'transparent', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.07em' }}>RESPAWN</button>
          <button onClick={() => navigate('/')} style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.35)', border: '1px solid rgba(0,255,65,.18)', background: 'transparent', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.07em' }}>← EXIT</button>
        </div>
      </div>

      {/* ── BOTTOM HUD ── */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(0,8,0,.9)', borderTop: '1px solid rgba(0,255,65,.18)', padding: '.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {/* Stat rings */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <StatRing value={stats.health} max={stats.maxHealth} color="#00ff41" label="HP" />
          <StatRing value={stats.stamina} max={stats.maxStamina} color="#44aaff" label="STM" size={40} />
        </div>
        {/* Salary */}
        <div style={{ borderLeft: '1px solid rgba(0,255,65,.15)', paddingLeft: '1rem' }}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.5rem', color: '#00ff41', textShadow: '0 0 8px rgba(0,255,65,.4)', letterSpacing: '.08em' }}>${stats.salary.toFixed(0)}</div>
          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em' }}>SALARY</div>
        </div>
        {/* Narration */}
        <div style={{ flex: 1, fontSize: '.72rem', color: 'rgba(0,255,65,.7)', lineHeight: 1.5, letterSpacing: '.04em', borderLeft: '1px solid rgba(0,255,65,.12)', paddingLeft: '1rem' }}>{narration}</div>
        {/* PABLO toggle hint */}
        <div style={{ borderLeft: '1px solid rgba(0,255,65,.15)', paddingLeft: '1rem', textAlign: 'center', cursor: 'pointer' }} onClick={() => setShowPablo(v => !v)}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: showPablo ? '#00ff41' : 'rgba(0,255,65,.4)', textShadow: showPablo ? '0 0 10px rgba(0,255,65,.6)' : 'none', letterSpacing: '.1em' }}>PABLO</div>
          <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.08em' }}>[P] DEVICE</div>
        </div>
      </div>

      {/* ── Dialog box ── */}
      {dialog && (
        <div style={{ position: 'absolute', bottom: '5.5rem', left: '50%', transform: 'translateX(-50%)', width: 600, maxWidth: '90vw', background: 'rgba(0,10,0,.97)', border: '1px solid rgba(0,255,65,.6)', boxShadow: '0 0 30px rgba(0,255,65,.12)', padding: '1.25rem', zIndex: 200, cursor: 'pointer' }} onClick={advanceDialog}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.1em', marginBottom: '.5rem' }}>PABLO CORP. TRANSMISSION</div>
          <div style={{ fontSize: '.85rem', color: '#00ff41', lineHeight: 1.7, letterSpacing: '.04em', minHeight: '2.5rem' }}>{dialog.lines[dialog.idx]}</div>
          <div style={{ marginTop: '.6rem', textAlign: 'right', fontSize: '.55rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em' }}>[{dialog.idx + 1}/{dialog.lines.length}] CLICK OR [SPACE] ▶</div>
        </div>
      )}

      {/* ── PABLO Device Panel ── */}
      {showPablo && (
        <div style={{ position: 'absolute', bottom: '5rem', right: '1rem', width: 360, maxHeight: '55vh', background: 'rgba(0,10,0,.97)', border: '1px solid rgba(0,255,65,.5)', boxShadow: '0 0 30px rgba(0,255,65,.12)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid rgba(0,255,65,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.2rem', color: '#00ff41', letterSpacing: '.12em' }}>PABLO DEVICE</div>
              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.08em' }}>{gsRef.current.hasDevice ? 'ACTIVATED' : 'NOT REGISTERED — VISIT PABLO STORE'}</div>
            </div>
            <button onClick={() => setShowPablo(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.5)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          {!gsRef.current.hasDevice ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.5rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.1em', marginBottom: '.5rem' }}>DEVICE LOCKED</div>
                <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.35)', lineHeight: 1.7 }}>You need a PABLO device to access the AI assistant.</div>
                <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.5)', marginTop: '.75rem', lineHeight: 1.7 }}>Visit the <span style={{ color: '#00ff41' }}>PABLO STORE</span> in the city to register.</div>
                <button onClick={() => { setShowPablo(false); setNarration('> Navigate to the PABLO STORE to activate your device. Look for it near PABLO CORP. HQ.'); }} style={{ marginTop: '1rem', padding: '.4rem .9rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.4)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '1rem', letterSpacing: '.1em', cursor: 'pointer' }}>FIND STORE ▶</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem', minHeight: '120px' }}>
                {pabloMessages.length === 0 && (
                  <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.3)', lineHeight: 1.7 }}>
                    {'> PABLO CORP. AI ASSISTANT — ONLINE\n> Ask me anything about the world, jobs, or your next move.'.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
                {pabloMessages.map((m, i) => (
                  <div key={i} style={{ fontSize: '.7rem', lineHeight: 1.6, color: m.role === 'user' ? 'rgba(0,255,65,.6)' : '#00ff41', paddingLeft: m.role === 'pablo' ? '.5rem' : 0, borderLeft: m.role === 'pablo' ? '2px solid rgba(0,255,65,.3)' : 'none' }}>
                    <span style={{ color: m.role === 'user' ? 'rgba(0,255,65,.4)' : 'rgba(0,255,65,.5)', marginRight: '.4rem', fontFamily: "'VT323',monospace", fontSize: '.8rem' }}>{m.role === 'user' ? `[${character.name}]` : '[PABLO]'}</span>
                    {m.text}
                  </div>
                ))}
                {pabloLoading && <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.4)', fontFamily: "'VT323',monospace" }}>PABLO PROCESSING_</div>}
              </div>
              <div style={{ padding: '.5rem', borderTop: '1px solid rgba(0,255,65,.2)', display: 'flex', gap: '.5rem' }}>
                <input value={pabloInput} onChange={e => setPabloInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendPablo()} placeholder="Message PABLO..." style={{ flex: 1, background: 'rgba(0,15,0,.9)', border: '1px solid rgba(0,255,65,.25)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', padding: '.35rem .5rem', outline: 'none', caretColor: '#00ff41' }} />
                <button onClick={sendPablo} style={{ background: 'rgba(0,255,65,.12)', border: '1px solid rgba(0,255,65,.4)', color: '#00ff41', cursor: 'pointer', padding: '0 .5rem' }}><Send size={12} /></button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Upgrade panel ── */}
      {showUpgrade && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,0,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 480, maxWidth: '90vw', border: '1px solid rgba(0,255,65,.7)', background: 'rgba(0,15,0,.98)', boxShadow: '0 0 40px rgba(0,255,65,.2)', padding: '2rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '2rem', color: '#00ff41', textShadow: '0 0 15px rgba(0,255,65,.5)', letterSpacing: '.15em', marginBottom: '.25rem' }}>PABLO DEVICE</div>
            <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.08em', marginBottom: '1.5rem' }}>PABLO CORP. — EXECUTIVE FIELD UNIT v1.0 — REGISTERED TO {character.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1.5rem' }}>
              {([['FREE', ['PABLO AI chat', 'Basic comms', 'World access', 'ATM access']], ['PRO — $29/mo', ['PABLO AI Pro', 'Live Listen', 'Scan Screen', 'Say This / Hints', 'Presenter Mode', 'Contacts & CRM', 'Workspace']]] as [string, string[]][]).map(([tier, features]) => (
                <div key={tier} style={{ border: tier === 'FREE' ? '1px solid rgba(0,255,65,.2)' : '1px solid rgba(0,255,65,.6)', padding: '1rem', background: tier !== 'FREE' ? 'rgba(0,255,65,.06)' : 'transparent' }}>
                  <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: tier === 'FREE' ? 'rgba(0,255,65,.5)' : '#00ff41', letterSpacing: '.1em', marginBottom: '.5rem' }}>{tier}</div>
                  {features.map(f => <div key={f} style={{ fontSize: '.62rem', color: tier === 'FREE' ? 'rgba(0,255,65,.4)' : 'rgba(0,255,65,.7)', lineHeight: 2, letterSpacing: '.04em' }}>▸ {f}</div>)}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button onClick={() => { setShowUpgrade(false); navigate('/upgrade'); }} style={{ flex: 1, padding: '.75rem', background: 'rgba(0,255,65,.14)', border: '1px solid rgba(0,255,65,.7)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '1.2rem', letterSpacing: '.15em', cursor: 'pointer' }}>UPGRADE TO PRO</button>
              <button onClick={() => { setShowUpgrade(false); setNarration(`> PABLO device activated for ${character.name}. Basic tier registered. Press [P] to open your device.`); }} style={{ padding: '.75rem 1.25rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.45)', fontFamily: "'Share Tech Mono',monospace", fontSize: '.65rem', letterSpacing: '.08em', cursor: 'pointer' }}>TAKE FREE</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Office Tower ── */}
      {showOffice && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,0,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 540, maxWidth: '92vw', border: '1px solid rgba(0,255,65,.6)', background: 'rgba(0,15,0,.98)', boxShadow: '0 0 40px rgba(0,255,65,.15)', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '2rem', color: '#00ff41', textShadow: '0 0 12px rgba(0,255,65,.4)', letterSpacing: '.15em' }}>OFFICE TOWER</div>
                <div style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.08em', marginTop: '.2rem' }}>PUBLIC COMMERCIAL SPACE — CITY SECTOR — PABLO CORP. MANAGED</div>
              </div>
              <button onClick={() => setShowOffice(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontFamily: "'VT323',monospace", fontSize: '1.2rem' }}>[ESC]</button>
            </div>

            {rentedOffice && (
              <div style={{ marginBottom: '1rem', padding: '.6rem .8rem', border: '1px solid rgba(0,255,65,.5)', background: 'rgba(0,255,65,.07)', fontSize: '.65rem', color: '#00ff41', letterSpacing: '.06em' }}>
                ▸ CURRENT LEASE: <span style={{ color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '.85rem' }}>{rentedOffice}</span> — Active until end of session.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '1.5rem' }}>
              {[
                { tier: 'HOT DESK',        price: 50,   period: '/day',  perks: ['Open floor plan', 'Shared comms terminal', 'Coffee + water', 'No lock code'] },
                { tier: 'PRIVATE OFFICE',  price: 200,  period: '/mo',   perks: ['Single room', 'Personal lock code', 'Filing cabinet', 'Window view (alley)'] },
                { tier: 'TEAM SUITE',      price: 500,  period: '/mo',   perks: ['4-desk suite', 'Conference room access', 'Private comms line', 'Secure floor entry'] },
                { tier: 'EXEC FLOOR',      price: 1500, period: '/mo',   perks: ['Full executive suite', 'PABLO Corp. adjacency', 'Rooftop access', 'AI concierge'] },
              ].map(({ tier, price, period, perks }) => {
                const isRented = rentedOffice === tier;
                const canAfford = stats.salary >= price;
                return (
                  <div key={tier} style={{ border: isRented ? '1px solid rgba(0,255,65,.8)' : '1px solid rgba(0,255,65,.2)', padding: '.9rem', background: isRented ? 'rgba(0,255,65,.08)' : 'transparent', position: 'relative' }}>
                    {isRented && <div style={{ position: 'absolute', top: 6, right: 8, fontSize: '.55rem', color: '#00ff41', fontFamily: "'VT323',monospace", letterSpacing: '.1em' }}>LEASED ✓</div>}
                    <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: isRented ? '#00ff41' : 'rgba(0,255,65,.75)', letterSpacing: '.08em', marginBottom: '.2rem' }}>{tier}</div>
                    <div style={{ fontSize: '.75rem', color: isRented ? '#00ff41' : canAfford ? 'rgba(0,255,65,.6)' : 'rgba(255,100,100,.5)', fontFamily: "'VT323',monospace", letterSpacing: '.06em', marginBottom: '.5rem' }}>
                      ${price.toLocaleString()}<span style={{ fontSize: '.6rem' }}>{period}</span>
                    </div>
                    {perks.map(p => <div key={p} style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.8, letterSpacing: '.04em' }}>· {p}</div>)}
                    <button
                      onClick={() => {
                        const gs = gsRef.current;
                        if (isRented) { localStorage.removeItem('salaryman_office'); setRentedOffice(null); setNarration(`> Lease cancelled for ${tier}.`); return; }
                        if (!canAfford) { setNarration(`> OFFICE TOWER — Insufficient funds. ${tier} requires $${price}. Balance: $${Math.floor(stats.salary)}.`); return; }
                        gs.stats.salary -= price;
                        setStats({ ...gs.stats });
                        localStorage.setItem('salaryman_office', tier);
                        setRentedOffice(tier);
                        setNarration(`> OFFICE TOWER — ${tier} leased. $${price} deducted. Access code transmitted to your PABLO device.`);
                      }}
                      style={{ marginTop: '.65rem', width: '100%', padding: '.35rem', background: isRented ? 'rgba(255,50,50,.08)' : canAfford ? 'rgba(0,255,65,.1)' : 'rgba(0,255,65,.03)', border: isRented ? '1px solid rgba(255,80,80,.4)' : canAfford ? '1px solid rgba(0,255,65,.5)' : '1px solid rgba(0,255,65,.15)', color: isRented ? 'rgba(255,80,80,.7)' : canAfford ? '#00ff41' : 'rgba(0,255,65,.25)', fontFamily: "'VT323',monospace", fontSize: '.9rem', letterSpacing: '.1em', cursor: canAfford || isRented ? 'pointer' : 'default' }}
                    >
                      {isRented ? 'CANCEL LEASE' : canAfford ? 'RENT NOW' : 'INSUFFICIENT $'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.2)', lineHeight: 1.8, letterSpacing: '.06em', borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.75rem' }}>
              All leases managed by PABLO Corp. Real Estate Division. Tenant assumes all risk of mutant incursion, gang activity, and infrastructure failure. No refunds after activation.
            </div>
          </div>
        </div>
      )}

      {/* ── Death screen ── */}
      {isDead && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '4rem', color: '#ff2222', textShadow: '0 0 30px rgba(255,0,0,.5)', letterSpacing: '.15em', marginBottom: '1rem' }}>YOU DIED</div>
            <div style={{ fontSize: '.7rem', color: 'rgba(255,50,50,.6)', letterSpacing: '.1em', marginBottom: '2rem' }}>The wasteland doesn't negotiate.</div>
            <button onClick={() => {
              const gs = gsRef.current;
              gs.stats.health = gs.stats.maxHealth; gs.stats.stamina = gs.stats.maxStamina;
              gs.player = { x: character.startX, y: character.startY };
              gs.enemies = spawnEnemies(); gs.invincible = 120;
              setStats({ ...gs.stats }); setIsDead(false);
              setNarration('> Respawned at origin point. Watch your back.');
            }} style={{ padding: '.75rem 2rem', background: 'rgba(255,0,0,.1)', border: '1px solid rgba(255,50,50,.5)', color: '#ff4444', fontFamily: "'VT323',monospace", fontSize: '1.5rem', letterSpacing: '.2em', cursor: 'pointer' }}>RESPAWN</button>
          </div>
        </div>
      )}
    </div>
  );
}
