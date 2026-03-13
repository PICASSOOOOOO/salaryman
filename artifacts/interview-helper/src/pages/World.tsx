import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';

// ── World constants ──────────────────────────────────────────────────────────
const WORLD_W = 3200;
const WORLD_H = 2400;
const TILE = 32;
const PLAYER_SPEED = 3;
const PLAYER_SIZE = 10;
const INTERACT_RANGE = 60;

// ── Building definitions ─────────────────────────────────────────────────────
const BUILDINGS = [
  // City sector
  { id: 'pablo_hq',    x: 600,  y: 300,  w: 240, h: 160, label: 'PABLO CORP. HQ',      color: '#00ff41', bright: true  },
  { id: 'pablo_store', x: 920,  y: 340,  w: 140, h: 100, label: 'PABLO STORE',          color: '#00ff41', bright: true  },
  { id: 'megabank',    x: 360,  y: 280,  w: 180, h: 140, label: 'MOGUL BANK',           color: '#00cc33', bright: false },
  { id: 'city_hall',   x: 520,  y: 520,  w: 200, h: 120, label: 'CITY HALL',            color: '#00aa28', bright: false },
  { id: 'market',      x: 900,  y: 500,  w: 160, h: 100, label: 'BLACK MARKET',         color: '#008820', bright: false },
  { id: 'hotel',       x: 1120, y: 300,  w: 120, h: 160, label: 'HOTEL NEON',           color: '#00aa28', bright: false },
  { id: 'clinic',      x: 320,  y: 480,  w: 120, h: 80,  label: 'MED CLINIC',           color: '#008820', bright: false },
  { id: 'apt1',        x: 200,  y: 320,  w: 100, h: 120, label: 'APT BLOCK 1A',         color: '#006618', bright: false },
  { id: 'apt2',        x: 200,  y: 470,  w: 100, h: 120, label: 'APT BLOCK 1B',         color: '#006618', bright: false },
  { id: 'factory',     x: 1300, y: 260,  w: 180, h: 140, label: 'FACTORY 7',            color: '#006618', bright: false },
  { id: 'atm',         x: 870,  y: 470,  w: 50,  h: 50,  label: 'ATM',                  color: '#00ff41', bright: true  },

  // Wasteland sector (lower half)
  { id: 'bunker',      x: 500,  y: 1400, w: 160, h: 100, label: 'BUNKER-09',            color: '#446644', bright: false },
  { id: 'scrap',       x: 800,  y: 1350, w: 200, h: 80,  label: 'SCRAP YARD',           color: '#335533', bright: false },
  { id: 'outpost',     x: 300,  y: 1500, w: 120, h: 90,  label: 'OUTPOST DELTA',        color: '#446644', bright: false },
  { id: 'radio',       x: 1100, y: 1420, w: 100, h: 100, label: 'PIRATE RADIO',         color: '#446644', bright: false },
  { id: 'ruins1',      x: 650,  y: 1550, w: 140, h: 80,  label: '[ RUINS ]',            color: '#223322', bright: false },
  { id: 'ruins2',      x: 950,  y: 1600, w: 100, h: 120, label: '[ RUINS ]',            color: '#223322', bright: false },
];

// ── NPC definitions ──────────────────────────────────────────────────────────
const makeNPCs = () => {
  const city = [
    { name: 'WORKER-441', x: 750, y: 470, type: 'corp' },
    { name: 'EXEC-77', x: 840, y: 320, type: 'corp' },
    { name: 'REPLICANT-X', x: 970, y: 480, type: 'android' },
    { name: 'STREET VENDOR', x: 450, y: 580, type: 'human' },
    { name: 'GUARD-02', x: 620, y: 310, type: 'corp' },
    { name: 'BROKER', x: 1050, y: 430, type: 'corp' },
    { name: 'UNIT-88', x: 1150, y: 400, type: 'android' },
    { name: 'MOGUL AGENT', x: 400, y: 350, type: 'corp' },
    { name: 'DRIFTER', x: 280, y: 560, type: 'human' },
    { name: 'COURIER', x: 1200, y: 490, type: 'human' },
  ];
  const wasteland = [
    { name: 'SCAVENGER', x: 420, y: 1460, type: 'human' },
    { name: 'MUTANT-12', x: 700, y: 1480, type: 'mutant' },
    { name: 'RAIDER', x: 860, y: 1520, type: 'human' },
    { name: 'EXILE-003', x: 1050, y: 1380, type: 'android' },
    { name: 'SURVIVOR', x: 550, y: 1600, type: 'human' },
    { name: 'MUTANT-33', x: 1000, y: 1560, type: 'mutant' },
  ];
  // Scatter extra unnamed NPCs
  const extras = Array.from({ length: 30 }, (_, i) => ({
    name: `NPC-${String(i + 100).padStart(3, '0')}`,
    x: 150 + Math.floor(Math.sin(i * 2.4) * 500 + 600),
    y: 150 + Math.floor(Math.cos(i * 1.7) * 300 + 450),
    type: ['corp', 'human', 'android'][i % 3],
  }));
  return [...city, ...wasteland, ...extras];
};

const NPCS = makeNPCs();

// ── Zone border ──────────────────────────────────────────────────────────────
const WASTELAND_Y = 1100;

// ── NPC color by type ────────────────────────────────────────────────────────
const NPC_COLORS: Record<string, string> = {
  corp:    '#00cc33',
  human:   '#009922',
  android: '#33ffaa',
  mutant:  '#88ff44',
};

// ── PABLO store dialog lines ─────────────────────────────────────────────────
const PABLO_INTRO = [
  'PABLO CORP. DEVICE v1.0',
  '> Welcome to the last working store in the city.',
  '> The world outside is collapsing.',
  '> PABLO Corp. is still open for business.',
  '> A device gives you access — comms, intel, job listings.',
  '> Without one, you\'re just another ghost in the wasteland.',
  '> ...',
  '> Press [ACTIVATE] to get your PABLO device.',
];

// ─────────────────────────────────────────────────────────────────────────────

type CharacterClass = 'corporate' | 'outcast' | 'replicant';

interface CharacterData {
  name: string;
  class: CharacterClass;
  startX: number;
  startY: number;
}

// Character Select Screen
function CharacterSelect({ onStart }: { onStart: (c: CharacterData) => void }) {
  const [name, setName] = useState('');
  const [cls, setCls] = useState<CharacterClass>('corporate');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 600);
    return () => clearInterval(id);
  }, []);

  const CLASSES: { id: CharacterClass; label: string; desc: string; start: [number, number] }[] = [
    { id: 'corporate', label: 'CORPORATE',  desc: 'City dweller. High salary. More connections. Weaker in the wasteland.', start: [820, 430] },
    { id: 'outcast',   label: 'OUTCAST',    desc: 'Wasteland survivor. Tough, stealthy. Poor. Dangerous in the city.', start: [600, 1450] },
    { id: 'replicant', label: 'REPLICANT',  desc: 'Android faction. Balanced stats. Distrusted by both sides.', start: [720, 420] },
  ];

  const selected = CLASSES.find(c => c.id === cls)!;

  const handleStart = () => {
    if (!name.trim()) return;
    onStart({ name: name.trim().toUpperCase(), class: cls, startX: selected.start[0], startY: selected.start[1] });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#030803', fontFamily: "'Share Tech Mono', monospace" }}>
      {/* Scan lines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)', pointerEvents: 'none', zIndex: 9999 }} />

      <div style={{ maxWidth: 600, width: '100%', padding: '2rem', position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-8">
          <div style={{ fontFamily: "'VT323', monospace", fontSize: '3rem', color: '#00ff41', textShadow: '0 0 20px rgba(0,255,65,0.6)', letterSpacing: '0.15em' }}>
            SALARYMAN
          </div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.1rem', color: 'rgba(0,255,65,0.4)', letterSpacing: '0.1em' }}>
            PABLO CORP. — WORLD INITIALIZATION
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(0,255,65,0.3)', letterSpacing: '0.08em' }}>
            SELECT OPERATIVE CLASS {tick % 2 === 0 ? '_' : ' '}
          </div>
        </div>

        {/* Class selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {CLASSES.map(c => (
            <button
              key={c.id}
              onClick={() => setCls(c.id)}
              style={{
                padding: '1rem 0.5rem',
                border: cls === c.id ? '1px solid rgba(0,255,65,0.8)' : '1px solid rgba(0,255,65,0.2)',
                background: cls === c.id ? 'rgba(0,255,65,0.12)' : 'rgba(0,255,65,0.03)',
                color: cls === c.id ? '#00ff41' : 'rgba(0,255,65,0.45)',
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: cls === c.id ? '0 0 16px rgba(0,255,65,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.2rem', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>{c.label}</div>
              <div style={{ fontSize: '0.58rem', lineHeight: 1.5, color: cls === c.id ? 'rgba(0,255,65,0.7)' : 'rgba(0,255,65,0.3)' }}>{c.desc}</div>
            </button>
          ))}
        </div>

        {/* Name input */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.65rem', color: 'rgba(0,255,65,0.4)', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>
            OPERATIVE DESIGNATION
          </div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            maxLength={20}
            placeholder="ENTER NAME..."
            style={{
              width: '100%',
              padding: '0.6rem 0.8rem',
              background: 'rgba(0,15,0,0.9)',
              border: '1px solid rgba(0,255,65,0.35)',
              color: '#00ff41',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '1rem',
              letterSpacing: '0.1em',
              outline: 'none',
              caretColor: '#00ff41',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
        </div>

        <button
          onClick={handleStart}
          disabled={!name.trim()}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: name.trim() ? 'rgba(0,255,65,0.15)' : 'rgba(0,255,65,0.04)',
            border: name.trim() ? '1px solid rgba(0,255,65,0.7)' : '1px solid rgba(0,255,65,0.15)',
            color: name.trim() ? '#00ff41' : 'rgba(0,255,65,0.25)',
            fontFamily: "'VT323', monospace",
            fontSize: '1.4rem',
            letterSpacing: '0.2em',
            cursor: name.trim() ? 'pointer' : 'default',
            boxShadow: name.trim() ? '0 0 20px rgba(0,255,65,0.15)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          ENTER THE WORLD {tick % 2 === 0 ? '▶' : '▷'}
        </button>

        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.6rem', color: 'rgba(0,255,65,0.2)', letterSpacing: '0.08em' }}>
          SALARYMAN ALPHA BUILD — PICASSOO.AI / PABLO CORP.
        </div>
      </div>
    </div>
  );
}

// ─── Main World Component ────────────────────────────────────────────────────
export default function World() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    player: { x: 820, y: 430 },
    camera: { x: 0, y: 0 },
    keys: new Set<string>(),
    blink: 0,
    frameCount: 0,
  });
  const animRef = useRef<number>(0);

  const [character, setCharacter] = useState<CharacterData | null>(() => {
    try {
      const s = localStorage.getItem('salaryman_character');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const [dialog, setDialog] = useState<{ lines: string[]; lineIdx: number; building: string } | null>(null);
  const [narration, setNarration] = useState('PABLO CORP. DEVICE v1.0 — Navigate with WASD or arrow keys. Press [E] near a building to enter.');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [nearBuilding, setNearBuilding] = useState<string | null>(null);

  const handleCharacterStart = useCallback((c: CharacterData) => {
    localStorage.setItem('salaryman_character', JSON.stringify(c));
    setCharacter(c);
    stateRef.current.player = { x: c.startX, y: c.startY };
    setTimeout(() => {
      setNarration(`> Designation confirmed: ${c.name} [${c.class.toUpperCase()}]. Welcome to the city. Find the PABLO STORE to get your device.`);
    }, 300);
  }, []);

  // ── Key handlers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!character) return;
    const down = (e: KeyboardEvent) => {
      stateRef.current.keys.add(e.key.toLowerCase());
      if ((e.key === 'e' || e.key === 'E') && nearBuilding) {
        handleEnter(nearBuilding);
      }
      if (e.key === 'Escape') {
        setDialog(null);
        setShowUpgrade(false);
      }
    };
    const up = (e: KeyboardEvent) => stateRef.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [character, nearBuilding]);

  const handleEnter = (buildingId: string) => {
    if (buildingId === 'pablo_store') {
      setDialog({ lines: PABLO_INTRO, lineIdx: 0, building: buildingId });
      setNarration('> PABLO STORE — Press [SPACE] or click to continue.');
    } else if (buildingId === 'megabank') {
      setNarration('> MOGUL BANK — "We hold the wealth of the old world. Access denied without credentials." [CLOSED]');
    } else if (buildingId === 'pablo_hq') {
      setNarration('> PABLO CORP. HQ — Corporate zone. Security androids patrol the perimeter. Entry restricted to employees.');
    } else if (buildingId === 'city_hall') {
      setNarration('> CITY HALL — "Governance collapsed three years ago. The building is occupied by PABLO Corp. now."');
    } else if (buildingId === 'atm') {
      setNarration('> ATM — [OUT OF ORDER] — "MOGUL BANK system offline. Try again when the grid is restored."');
    } else {
      const b = BUILDINGS.find(b => b.id === buildingId);
      setNarration(`> ${b?.label ?? buildingId} — Doors are locked. Come back with better credentials.`);
    }
  };

  // Dialog advance
  const advanceDialog = useCallback(() => {
    if (!dialog) return;
    if (dialog.lineIdx < dialog.lines.length - 1) {
      setDialog(d => d ? { ...d, lineIdx: d.lineIdx + 1 } : null);
    } else {
      if (dialog.building === 'pablo_store') setShowUpgrade(true);
      setDialog(null);
    }
  }, [dialog]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') advanceDialog(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advanceDialog]);

  // ── Game loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!character) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const s = stateRef.current;
      s.frameCount++;
      s.blink = Math.floor(s.frameCount / 30) % 2;

      // ── Movement ──────────────────────────────────────────────────────
      if (!dialog && !showUpgrade) {
        let dx = 0, dy = 0;
        if (s.keys.has('arrowleft')  || s.keys.has('a')) dx -= PLAYER_SPEED;
        if (s.keys.has('arrowright') || s.keys.has('d')) dx += PLAYER_SPEED;
        if (s.keys.has('arrowup')    || s.keys.has('w')) dy -= PLAYER_SPEED;
        if (s.keys.has('arrowdown')  || s.keys.has('s')) dy += PLAYER_SPEED;

        // Normalize diagonal
        if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

        let nx = s.player.x + dx;
        let ny = s.player.y + dy;

        // Collision with buildings
        const collides = (px: number, py: number) =>
          BUILDINGS.some(b => px + PLAYER_SIZE > b.x && px - PLAYER_SIZE < b.x + b.w &&
                              py + PLAYER_SIZE > b.y && py - PLAYER_SIZE < b.y + b.h);
        if (collides(nx, s.player.y)) nx = s.player.x;
        if (collides(s.player.x, ny)) ny = s.player.y;

        s.player.x = Math.max(PLAYER_SIZE, Math.min(WORLD_W - PLAYER_SIZE, nx));
        s.player.y = Math.max(PLAYER_SIZE, Math.min(WORLD_H - PLAYER_SIZE, ny));
      }

      // ── Camera ────────────────────────────────────────────────────────
      const cw = canvas.width, ch = canvas.height;
      s.camera.x = Math.max(0, Math.min(WORLD_W - cw, s.player.x - cw / 2));
      s.camera.y = Math.max(0, Math.min(WORLD_H - ch, s.player.y - ch / 2));

      // ── Proximity check ───────────────────────────────────────────────
      let near: string | null = null;
      for (const b of BUILDINGS) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const dist = Math.hypot(s.player.x - cx, s.player.y - cy);
        if (dist < INTERACT_RANGE) { near = b.id; break; }
      }
      setNearBuilding(prev => {
        if (prev !== near) {
          if (near) {
            const b = BUILDINGS.find(bb => bb.id === near);
            if (b && !dialog) setNarration(`> Approaching ${b.label} — Press [E] to interact.`);
          }
          return near;
        }
        return prev;
      });

      // ── Draw ──────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#030803';
      ctx.fillRect(0, 0, cw, ch);

      const ox = -s.camera.x, oy = -s.camera.y;

      // Grid
      ctx.strokeStyle = 'rgba(0,255,65,0.04)';
      ctx.lineWidth = 1;
      const startX = Math.floor(s.camera.x / TILE) * TILE;
      const startY = Math.floor(s.camera.y / TILE) * TILE;
      for (let gx = startX; gx < s.camera.x + cw + TILE; gx += TILE) {
        ctx.beginPath(); ctx.moveTo(gx + ox, 0); ctx.lineTo(gx + ox, ch); ctx.stroke();
      }
      for (let gy = startY; gy < s.camera.y + ch + TILE; gy += TILE) {
        ctx.beginPath(); ctx.moveTo(0, gy + oy); ctx.lineTo(cw, gy + oy); ctx.stroke();
      }

      // Wasteland border
      const wbY = WASTELAND_Y + oy;
      if (wbY > 0 && wbY < ch) {
        ctx.strokeStyle = 'rgba(0,255,65,0.15)';
        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, wbY); ctx.lineTo(cw, wbY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,255,65,0.25)';
        ctx.font = '10px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.fillText('── WASTELAND BORDER ──', cw / 2, wbY - 6);
        // Zone labels
        if (wbY > 30) { ctx.fillStyle = 'rgba(0,255,65,0.12)'; ctx.font = '48px "VT323"'; ctx.fillText('CITY SECTOR', cw / 2, Math.min(wbY - 40, ch / 3)); }
        if (wbY < ch - 30) { ctx.fillStyle = 'rgba(0,255,65,0.08)'; ctx.font = '48px "VT323"'; ctx.fillText('WASTELAND', cw / 2, Math.max(wbY + 60, ch * 0.7)); }
      } else if (s.camera.y < WASTELAND_Y) {
        ctx.fillStyle = 'rgba(0,255,65,0.04)'; ctx.font = '64px "VT323"'; ctx.textAlign = 'center';
        ctx.fillText('CITY SECTOR', cw / 2, ch / 2);
      } else {
        ctx.fillStyle = 'rgba(0,255,65,0.04)'; ctx.font = '64px "VT323"'; ctx.textAlign = 'center';
        ctx.fillText('WASTELAND', cw / 2, ch / 2);
      }

      // Roads
      ctx.strokeStyle = 'rgba(0,255,65,0.1)';
      ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(0, 700 + oy); ctx.lineTo(WORLD_W + ox, 700 + oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(800 + ox, 0); ctx.lineTo(800 + ox, WORLD_H + oy); ctx.stroke();
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, 250 + oy); ctx.lineTo(WORLD_W + ox, 250 + oy); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,255,65,0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([16, 8]);
      ctx.beginPath(); ctx.moveTo(0, 700 + oy); ctx.lineTo(WORLD_W + ox, 700 + oy); ctx.stroke();
      ctx.setLineDash([]);

      // Buildings
      for (const b of BUILDINGS) {
        const bx = b.x + ox, by = b.y + oy;
        if (bx + b.w < 0 || bx > cw || by + b.h < 0 || by > ch) continue;

        const isNear = near === b.id;
        const alpha = isNear ? (s.blink ? 0.9 : 0.7) : 0.4;

        ctx.strokeStyle = b.bright ? `rgba(0,255,65,${isNear ? 0.9 : 0.6})` : `rgba(0,180,50,${alpha})`;
        ctx.lineWidth = isNear ? 2 : 1;
        ctx.strokeRect(bx, by, b.w, b.h);

        // Fill
        ctx.fillStyle = `rgba(0,${b.bright ? 255 : 180},${b.bright ? 65 : 50},0.05)`;
        ctx.fillRect(bx, by, b.w, b.h);

        // Corner brackets
        const cs = 8;
        ctx.strokeStyle = b.bright ? 'rgba(0,255,65,0.8)' : 'rgba(0,200,50,0.5)';
        ctx.lineWidth = 1.5;
        [[bx, by], [bx + b.w, by], [bx, by + b.h], [bx + b.w, by + b.h]].forEach(([cx2, cy2], i) => {
          const sx = i % 2 === 0 ? 1 : -1, sy = i < 2 ? 1 : -1;
          ctx.beginPath(); ctx.moveTo(cx2, cy2 + sy * cs); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + sx * cs, cy2); ctx.stroke();
        });

        // Label
        ctx.fillStyle = b.bright ? (isNear ? '#00ff41' : 'rgba(0,255,65,0.7)') : 'rgba(0,200,50,0.5)';
        ctx.font = `${b.bright ? 11 : 9}px "Share Tech Mono"`;
        ctx.textAlign = 'center';
        ctx.fillText(b.label, bx + b.w / 2, by + b.h / 2 + 4);

        // [E] prompt
        if (isNear) {
          ctx.fillStyle = s.blink ? 'rgba(0,255,65,0.9)' : 'rgba(0,255,65,0.5)';
          ctx.font = '10px "Share Tech Mono"';
          ctx.fillText('[E] ENTER', bx + b.w / 2, by - 8);
        }
      }

      // NPCs
      for (const npc of NPCS) {
        const nx2 = npc.x + ox, ny2 = npc.y + oy;
        if (nx2 < -20 || nx2 > cw + 20 || ny2 < -20 || ny2 > ch + 20) continue;
        const col = NPC_COLORS[npc.type] ?? '#00aa28';
        const dist = Math.hypot(s.player.x - npc.x, s.player.y - npc.y);
        const showLabel = dist < 100;
        ctx.fillStyle = col;
        ctx.fillRect(nx2 - 4, ny2 - 4, 8, 8);
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(nx2 - 5, ny2 - 5, 10, 10);
        if (showLabel) {
          ctx.fillStyle = 'rgba(0,255,65,0.5)';
          ctx.font = '8px "Share Tech Mono"';
          ctx.textAlign = 'center';
          ctx.fillText(npc.name, nx2, ny2 - 9);
        }
      }

      // Player
      const px = s.player.x + ox, py = s.player.y + oy;
      const pCol = s.blink ? '#00ff41' : '#00dd38';

      // Shadow glow
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 10;
      ctx.fillStyle = pCol;
      ctx.beginPath();
      ctx.moveTo(px, py - PLAYER_SIZE);
      ctx.lineTo(px + PLAYER_SIZE * 0.7, py + PLAYER_SIZE * 0.5);
      ctx.lineTo(px - PLAYER_SIZE * 0.7, py + PLAYER_SIZE * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Player label
      if (character) {
        ctx.fillStyle = 'rgba(0,255,65,0.8)';
        ctx.font = 'bold 9px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(character.name, px, py - PLAYER_SIZE - 4);
      }

      // Mini-map
      const mmW = 120, mmH = 80, mmX = cw - mmW - 12, mmY = 12;
      ctx.fillStyle = 'rgba(0,10,0,0.85)';
      ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeStyle = 'rgba(0,255,65,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mmX, mmY, mmW, mmH);
      ctx.fillStyle = 'rgba(0,255,65,0.2)';
      ctx.font = '7px "Share Tech Mono"';
      ctx.textAlign = 'left';
      ctx.fillText('MINIMAP', mmX + 4, mmY + 10);
      // Buildings on minimap
      for (const b of BUILDINGS) {
        const mx = mmX + (b.x / WORLD_W) * mmW;
        const my = mmY + (b.y / WORLD_H) * mmH;
        ctx.fillStyle = b.bright ? 'rgba(0,255,65,0.7)' : 'rgba(0,180,50,0.4)';
        ctx.fillRect(mx, my, Math.max(2, (b.w / WORLD_W) * mmW), Math.max(2, (b.h / WORLD_H) * mmH));
      }
      // Player on minimap
      const mpx = mmX + (s.player.x / WORLD_W) * mmW;
      const mpy = mmY + (s.player.y / WORLD_H) * mmH;
      ctx.fillStyle = '#00ff41';
      ctx.fillRect(mpx - 2, mpy - 2, 4, 4);
      // Wasteland line on minimap
      const mwY = mmY + (WASTELAND_Y / WORLD_H) * mmH;
      ctx.strokeStyle = 'rgba(0,255,65,0.3)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(mmX, mwY); ctx.lineTo(mmX + mmW, mwY); ctx.stroke();
      ctx.setLineDash([]);

      // Coords
      ctx.fillStyle = 'rgba(0,255,65,0.3)';
      ctx.font = '8px "Share Tech Mono"';
      ctx.textAlign = 'left';
      ctx.fillText(`X:${Math.floor(s.player.x)} Y:${Math.floor(s.player.y)}`, mmX + 4, mmY + mmH - 4);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [character, dialog, showUpgrade]);

  // ── Character select ─────────────────────────────────────────────────────
  if (!character) {
    return <CharacterSelect onStart={handleCharacterStart} />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#030803', position: 'relative', fontFamily: "'Share Tech Mono', monospace" }}>
      {/* Scan lines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)', pointerEvents: 'none', zIndex: 9999 }} />

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* Top HUD */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '0.4rem 1rem',
        background: 'rgba(0,10,0,0.9)',
        borderBottom: '1px solid rgba(0,255,65,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{ fontFamily: "'VT323', monospace", fontSize: '1.3rem', color: '#00ff41', textShadow: '0 0 10px rgba(0,255,65,0.5)', letterSpacing: '0.1em' }}>SALARYMAN</span>
          <span style={{ fontSize: '0.65rem', color: 'rgba(0,255,65,0.4)', letterSpacing: '0.08em' }}>
            {character.name} [{character.class.toUpperCase()}]
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,65,0.35)', letterSpacing: '0.08em' }}>WASD/ARROWS — MOVE</span>
          <span style={{ fontSize: '0.6rem', color: 'rgba(0,255,65,0.35)', letterSpacing: '0.08em' }}>[E] — INTERACT</span>
          <button
            onClick={() => navigate('/')}
            style={{ fontSize: '0.6rem', color: 'rgba(0,255,65,0.4)', border: '1px solid rgba(0,255,65,0.2)', background: 'transparent', padding: '0.2rem 0.5rem', cursor: 'pointer', letterSpacing: '0.08em' }}
          >
            ← EXIT WORLD
          </button>
        </div>
      </div>

      {/* Narration bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0.75rem 1.25rem',
        background: 'rgba(0,10,0,0.92)',
        borderTop: '1px solid rgba(0,255,65,0.2)',
        zIndex: 100,
        minHeight: '3rem',
      }}>
        <div style={{ fontSize: '0.75rem', color: 'rgba(0,255,65,0.7)', letterSpacing: '0.06em', lineHeight: 1.6 }}>
          {narration}
        </div>
      </div>

      {/* Dialog box */}
      {dialog && (
        <div
          style={{
            position: 'absolute', bottom: '4rem', left: '50%', transform: 'translateX(-50%)',
            width: '600px', maxWidth: '90vw',
            background: 'rgba(0,10,0,0.97)',
            border: '1px solid rgba(0,255,65,0.6)',
            boxShadow: '0 0 30px rgba(0,255,65,0.15)',
            padding: '1.25rem',
            zIndex: 200,
            cursor: 'pointer',
          }}
          onClick={advanceDialog}
        >
          <div style={{ fontFamily: "'VT323', monospace", fontSize: '1rem', color: 'rgba(0,255,65,0.45)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            PABLO CORP. TRANSMISSION
          </div>
          <div style={{ fontSize: '0.85rem', color: '#00ff41', lineHeight: 1.7, letterSpacing: '0.05em', minHeight: '2rem' }}>
            {dialog.lines[dialog.lineIdx]}
          </div>
          <div style={{ marginTop: '0.75rem', textAlign: 'right', fontSize: '0.6rem', color: 'rgba(0,255,65,0.4)', letterSpacing: '0.1em' }}>
            [{dialog.lineIdx + 1}/{dialog.lines.length}] CLICK OR [SPACE] TO CONTINUE ▶
          </div>
        </div>
      )}

      {/* Upgrade panel */}
      {showUpgrade && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,5,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300,
        }}>
          <div style={{
            width: '480px', maxWidth: '90vw',
            border: '1px solid rgba(0,255,65,0.7)',
            background: 'rgba(0,15,0,0.98)',
            boxShadow: '0 0 40px rgba(0,255,65,0.2)',
            padding: '2rem',
          }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: '2rem', color: '#00ff41', textShadow: '0 0 15px rgba(0,255,65,0.5)', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
              PABLO DEVICE
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(0,255,65,0.5)', letterSpacing: '0.08em', marginBottom: '1.5rem' }}>
              PABLO CORP. — EXECUTIVE FIELD UNIT v1.0
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {[
                ['FREE', ['PABLO AI chat', 'Basic comms', 'World access']],
                ['PRO — $29/mo', ['PABLO AI Pro', 'Live Listen', 'Scan Screen', 'Say This / Hints', 'Presenter Mode', 'Contacts & CRM', 'Workspace']],
              ].map(([tier, features]) => (
                <div key={String(tier)} style={{ border: tier === 'FREE' ? '1px solid rgba(0,255,65,0.2)' : '1px solid rgba(0,255,65,0.6)', padding: '1rem', background: tier === 'FREE' ? 'transparent' : 'rgba(0,255,65,0.06)' }}>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.1rem', color: tier === 'FREE' ? 'rgba(0,255,65,0.5)' : '#00ff41', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{String(tier)}</div>
                  {(features as string[]).map(f => (
                    <div key={f} style={{ fontSize: '0.65rem', color: tier === 'FREE' ? 'rgba(0,255,65,0.4)' : 'rgba(0,255,65,0.7)', letterSpacing: '0.05em', lineHeight: 2 }}>▸ {f}</div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { setShowUpgrade(false); navigate('/upgrade'); }}
                style={{ flex: 1, padding: '0.75rem', background: 'rgba(0,255,65,0.15)', border: '1px solid rgba(0,255,65,0.7)', color: '#00ff41', fontFamily: "'VT323', monospace", fontSize: '1.2rem', letterSpacing: '0.15em', cursor: 'pointer' }}
              >
                UPGRADE TO PRO
              </button>
              <button
                onClick={() => setShowUpgrade(false)}
                style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1px solid rgba(0,255,65,0.2)', color: 'rgba(0,255,65,0.4)', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.08em', cursor: 'pointer' }}
              >
                TAKE FREE
              </button>
            </div>

            <button
              onClick={() => setShowUpgrade(false)}
              style={{ marginTop: '0.75rem', width: '100%', background: 'transparent', border: 'none', color: 'rgba(0,255,65,0.25)', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'pointer', fontFamily: "'Share Tech Mono', monospace" }}
            >
              [ESC] LEAVE STORE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
