import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Building2, Users, Radio, Eye, Cctv, UserCog, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
const TeamManagement = lazy(() => import('./TeamManagement'));

interface OfficeBotWorker {
  name: string;
  slug: string;
  category: string;
  tagline: string;
  icon: string;
}

interface OfficeData {
  bots: OfficeBotWorker[];
  orgs: { orgId: number; orgName: string; role: string }[];
  isAdmin: boolean;
  hasOffice: boolean;
}

type BotTask = 'desk' | 'coffee' | 'phone' | 'copier' | 'filing' | 'meeting' | 'presenting' | 'water' | 'walk' | 'idle';

const TASK_LABELS: Record<BotTask, string> = {
  desk: 'WORKING AT DESK', coffee: 'GETTING COFFEE', phone: 'ON THE PHONE',
  copier: 'AT COPIER', filing: 'FILING RECORDS', meeting: 'IN MEETING',
  presenting: 'PRESENTING', water: 'WATER COOLER', walk: 'IN TRANSIT', idle: 'IDLE',
};

const TASK_SPEECH: Record<BotTask, string[]> = {
  desk: [
    'Processing quarterly numbers...', 'Email sent. Waiting on reply.',
    'Report almost done.', 'Updating client records.', 'Spreadsheet looks clean.',
    'Drafting the proposal now.', 'CRM data synced.', 'Running diagnostics...',
  ],
  coffee: ['Third cup. No judgment.', 'Need this.', 'The good beans today.', 'Who emptied the pot?'],
  phone: ['Yes, I can confirm that...', 'Let me check and call back.', 'Numbers look solid.', 'I\'ll forward that.'],
  meeting: ['Good point. Let\'s table that.', 'Action items noted.', 'Let\'s circle back.', 'Slides look good.'],
  presenting: ['As you can see on this slide...', 'Data speaks for itself.', 'Next quarter projections strong.'],
  copier: ['Fifty copies. Double-sided.', 'Paper jam... again.', 'Almost done with this batch.'],
  filing: ['Everything alphabetical.', 'Found the missing invoice.', 'Records updated.'],
  water: ['Taking five.', 'Quick break.', 'Did you hear about the memo?'],
  walk: [],
  idle: ['Awaiting instructions.', 'Standing by.', 'Ready.'],
};

const CAT_COLORS: Record<string, string> = {
  finance: '#4ade80', sales: '#f59e0b', marketing: '#ec4899', creative: '#a78bfa',
  operations: '#38bdf8', legal: '#94a3b8', education: '#06b6d4', medical: '#ef4444',
  'e-commerce': '#fb923c', general: '#6ee7b7', music: '#c084fc', publishing: '#fbbf24',
  design: '#f472b6', logistics: '#2dd4bf', trades: '#78716c', support: '#60a5fa',
};

const HAIR = ['#1a1a1a','#2a1a00','#553322','#8B4513','#1a0a00','#334455'];

interface Worker {
  bot: OfficeBotWorker;
  x: number; y: number;
  tx: number; ty: number;
  task: BotTask;
  timer: number;
  deskX: number; deskY: number;
  phase: number;
  wf: number;
  speech: string | null;
  speechT: number;
  col: string;
  hair: string;
}

const W = 1200, H = 900;

const ZONES = {
  coffee:  { x: 60,  y: 700, w: 45, h: 30 },
  copier:  { x: 1050, y: 700, w: 55, h: 35 },
  conf:    { x: 780, y: 80,  w: 220, h: 130 },
  water:   { x: 160, y: 700, w: 22, h: 25 },
  files:   { x: 1050, y: 350, w: 65, h: 45 },
  recep:   { x: 480, y: 800, w: 110, h: 35 },
  server:  { x: 1100, y: 80,  w: 55, h: 65 },
  couch:   { x: 60,  y: 620, w: 85, h: 35 },
  wb1:     { x: 780, y: 62,  w: 200, h: 12 },
  wb2:     { x: 400, y: 62,  w: 170, h: 12 },
  jcDesk:  { x: 50,  y: 80,  w: 75, h: 35 },
  jcTerm:  { x: 135, y: 80,  w: 55, h: 35 },
};

function deskPos(count: number): { x: number; y: number }[] {
  const d: { x: number; y: number }[] = [];
  const cols = Math.min(count, 6), startX = 80, startY = 220, sx = 150, sy = 95;
  for (let r = 0; r < Math.ceil(count / cols); r++)
    for (let c = 0; c < cols && d.length < count; c++)
      d.push({ x: startX + c * sx, y: startY + r * sy });
  return d;
}

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

type OfficeTab = 'floor' | 'team';

export default function TheOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<OfficeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Worker | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const frameRef = useRef(0);
  const animRef = useRef(0);
  const [, navigate] = useLocation();
  const [camLabel, setCamLabel] = useState('CAM-01');
  const [activeTab, setActiveTab] = useState<OfficeTab>('floor');

  useEffect(() => {
    apiFetch('/api/world/my-office')
      .then(r => { if (!r.ok) throw new Error('Not authenticated'); return r.json(); })
      .then((d: OfficeData) => {
        if (!d || !d.bots) { setData({ bots: [], orgs: [], isAdmin: false, hasOffice: false }); return; }
        setData(d);
        const desks = deskPos(Math.max(d.bots.length, 1));
        workersRef.current = d.bots.map((bot, i) => {
          const dk = desks[i % desks.length];
          return {
            bot, x: dk.x + 30, y: dk.y + 15, tx: dk.x + 30, ty: dk.y + 15,
            task: 'desk', timer: 200 + Math.random() * 300, deskX: dk.x, deskY: dk.y,
            phase: Math.random() * Math.PI * 2, wf: 0,
            speech: null, speechT: 0,
            col: CAT_COLORS[bot.category] || '#6ee7b7',
            hair: pick(HAIR),
          };
        });
        const cams = ['CAM-01','CAM-02','CAM-03','CAM-LOBBY','CAM-HQ'];
        setCamLabel(pick(cams));
      })
      .catch(err => console.error('Office load error:', err))
      .finally(() => setLoading(false));
  }, []);

  const newTask = useCallback((w: Worker) => {
    const tasks: BotTask[] = ['desk','coffee','phone','copier','filing','meeting','presenting','water','walk','idle'];
    const wts = [35, 8, 12, 5, 5, 10, 6, 5, 7, 7];
    let tot = 0; for (const v of wts) tot += v;
    let roll = Math.random() * tot;
    let t: BotTask = 'desk';
    for (let i = 0; i < tasks.length; i++) { roll -= wts[i]; if (roll <= 0) { t = tasks[i]; break; } }
    w.task = t;
    w.timer = 150 + Math.random() * 400;
    const lines = TASK_SPEECH[t];
    if (lines.length && Math.random() < 0.35) { w.speech = pick(lines); w.speechT = 200; }
    else { w.speech = null; w.speechT = 0; }
    switch (t) {
      case 'coffee': w.tx = ZONES.coffee.x + 20; w.ty = ZONES.coffee.y - 10; break;
      case 'copier': w.tx = ZONES.copier.x + 25; w.ty = ZONES.copier.y - 10; break;
      case 'meeting': case 'presenting':
        w.tx = ZONES.conf.x + 20 + Math.random() * 180; w.ty = ZONES.conf.y + 20 + Math.random() * 90; break;
      case 'filing': w.tx = ZONES.files.x + 15; w.ty = ZONES.files.y - 10; break;
      case 'water': w.tx = ZONES.water.x + 10; w.ty = ZONES.water.y - 10; break;
      case 'walk': w.tx = 80 + Math.random() * 1000; w.ty = 150 + Math.random() * 600; break;
      default: w.tx = w.deskX + 30; w.ty = w.deskY + 15; break;
    }
  }, []);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !data) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      frameRef.current++;
      const f = frameRef.current;
      const ws = workersRef.current;
      cvs.width = W; cvs.height = H;

      ctx.fillStyle = '#080c12';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(12,16,24,.97)';
      ctx.fillRect(8, 8, W - 16, H - 16);
      ctx.strokeStyle = 'rgba(56,189,248,.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, W - 16, H - 16);

      for (let gx = 80; gx < W - 10; gx += 150) {
        ctx.strokeStyle = 'rgba(56,189,248,.025)';
        ctx.beginPath(); ctx.moveTo(gx, 8); ctx.lineTo(gx, H - 8); ctx.stroke();
      }
      for (let gy = 80; gy < H - 10; gy += 95) {
        ctx.beginPath(); ctx.moveTo(8, gy); ctx.lineTo(W - 8, gy); ctx.stroke();
      }

      ctx.fillStyle = 'rgba(0,30,80,.22)';
      ctx.fillRect(20, 18, 220, 55); ctx.fillRect(300, 18, 220, 55); ctx.fillRect(W - 240, 18, 220, 55);
      ctx.strokeStyle = 'rgba(56,189,248,.15)';
      ctx.strokeRect(20, 18, 220, 55); ctx.strokeRect(300, 18, 220, 55); ctx.strokeRect(W - 240, 18, 220, 55);

      const drawZone = (z: {x:number;y:number;w:number;h:number}, col: string, lbl: string) => {
        ctx.fillStyle = col; ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = 'rgba(56,189,248,.15)'; ctx.strokeRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '7px "Share Tech Mono",monospace';
        ctx.textAlign = 'center'; ctx.fillText(lbl, z.x + z.w / 2, z.y + z.h + 10);
      };

      drawZone(ZONES.coffee, 'rgba(60,40,20,.55)', 'COFFEE');
      drawZone(ZONES.copier, 'rgba(60,60,65,.5)', 'COPIER');
      drawZone(ZONES.conf, 'rgba(45,55,75,.45)', 'CONFERENCE');
      drawZone(ZONES.water, 'rgba(0,50,70,.4)', 'WATER');
      drawZone(ZONES.files, 'rgba(50,55,65,.45)', 'FILES');
      drawZone(ZONES.recep, 'rgba(50,60,80,.55)', 'RECEPTION');
      drawZone(ZONES.server, 'rgba(20,40,60,.5)', 'SERVER');
      drawZone(ZONES.couch, 'rgba(60,50,70,.35)', 'LOUNGE');
      drawZone(ZONES.jcDesk, 'rgba(80,60,0,.45)', 'JEAN CLAW');
      drawZone(ZONES.jcTerm, 'rgba(0,80,120,.4)', 'ADMIN');

      ctx.fillStyle = 'rgba(200,200,200,.08)';
      ctx.fillRect(ZONES.wb1.x, ZONES.wb1.y, ZONES.wb1.w, ZONES.wb1.h);
      ctx.fillRect(ZONES.wb2.x, ZONES.wb2.y, ZONES.wb2.w, ZONES.wb2.h);

      const svGlow = 0.15 + Math.sin(f * 0.08) * 0.1;
      ctx.fillStyle = `rgba(0,255,100,${svGlow})`; ctx.fillRect(ZONES.server.x + 12, ZONES.server.y + 12, 4, 4);
      ctx.fillRect(ZONES.server.x + 12, ZONES.server.y + 22, 4, 4); ctx.fillRect(ZONES.server.x + 12, ZONES.server.y + 32, 4, 4);
      ctx.fillStyle = `rgba(255,100,0,${svGlow})`; ctx.fillRect(ZONES.server.x + 22, ZONES.server.y + 12, 4, 4);

      const plants = [{x:25,y:60},{x:W-45,y:60},{x:25,y:820},{x:W-45,y:820},{x:250,y:700},{x:700,y:700}];
      for (const p of plants) {
        ctx.fillStyle = 'rgba(30,70,30,.35)'; ctx.beginPath(); ctx.arc(p.x + 8, p.y + 4, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(60,40,20,.4)'; ctx.fillRect(p.x + 4, p.y + 10, 8, 7);
      }

      const desks = deskPos(Math.max(ws.length, 4));
      for (const dk of desks) {
        ctx.fillStyle = 'rgba(50,60,80,.45)'; ctx.fillRect(dk.x, dk.y, 60, 28);
        ctx.strokeStyle = 'rgba(56,189,248,.1)'; ctx.strokeRect(dk.x, dk.y, 60, 28);
        ctx.fillStyle = 'rgba(0,80,120,.35)'; ctx.fillRect(dk.x + 65, dk.y, 40, 22);
        ctx.strokeStyle = 'rgba(0,150,255,.1)'; ctx.strokeRect(dk.x + 65, dk.y, 40, 22);
        ctx.fillStyle = 'rgba(0,200,255,.2)'; ctx.fillRect(dk.x + 69, dk.y + 3, 32, 14);
        ctx.fillStyle = 'rgba(40,50,70,.4)'; ctx.fillRect(dk.x + 22, dk.y + 30, 18, 12);
      }

      const jcBob = Math.sin(f * 0.035) * 0.5;
      const jcX = ZONES.jcDesk.x + 38, jcY = ZONES.jcDesk.y - 12 + jcBob;
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(jcX, jcY + 8, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(jcX - 4, jcY + 5, 3, 5); ctx.fillRect(jcX + 1, jcY + 5, 3, 5);
      ctx.fillStyle = '#3a2a10'; ctx.fillRect(jcX - 5, jcY - 3, 10, 7);
      ctx.fillStyle = '#f0d060'; ctx.fillRect(jcX - 1, jcY - 2, 2, 2);
      ctx.fillStyle = '#aa8020'; ctx.fillRect(jcX, jcY - 1, 1, 4);
      ctx.fillStyle = '#2a1a08'; ctx.fillRect(jcX - 6, jcY - 3, 2, 4); ctx.fillRect(jcX + 4, jcY - 3, 2, 4);
      ctx.fillStyle = '#f0c040'; ctx.fillRect(jcX + 3, jcY - 2, 1, 1);
      ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(jcX, jcY - 9, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1008'; ctx.fillRect(jcX - 4, jcY - 14, 8, 4);
      ctx.fillStyle = '#f0c040'; ctx.fillRect(jcX - 5, jcY - 12, 10, 1);
      ctx.fillStyle = 'rgba(240,192,64,.8)'; ctx.font = '6px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText('JEAN CLAW', jcX, jcY - 17);
      ctx.fillStyle = 'rgba(240,192,64,.35)'; ctx.font = '4px "Share Tech Mono",monospace';
      ctx.fillText('OFFICE MANAGER', jcX, jcY - 13);
      ctx.fillStyle = 'rgba(240,192,64,.1)'; ctx.beginPath(); ctx.arc(jcX, jcY, 10, 0, Math.PI * 2); ctx.fill();

      for (const w of ws) {
        w.timer--;
        if (w.timer <= 0) newTask(w);
        if (w.speechT > 0) w.speechT--;
        if (w.speechT <= 0) w.speech = null;

        const dx = w.tx - w.x, dy = w.ty - w.y, dist = Math.hypot(dx, dy);
        if (dist > 2) { w.x += (dx / dist) * 0.7; w.y += (dy / dist) * 0.7; w.wf++; }
        w.phase += 0.04;
        const bob = Math.sin(w.phase) * 0.5;
        const nx = Math.round(w.x), ny = Math.round(w.y + bob);
        const moving = dist > 2;

        ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(nx, ny + 8, 5, 1.8, 0, 0, Math.PI * 2); ctx.fill();

        const lo = moving ? Math.sin(w.wf * 0.15) * 2 : 0;
        ctx.fillStyle = '#111'; ctx.fillRect(nx - 4, ny + 5, 3, 5 + lo); ctx.fillRect(nx + 1, ny + 5, 3, 5 - lo);

        ctx.fillStyle = w.col + '77'; ctx.fillRect(nx - 5, ny - 3, 10, 7);
        if (w.task === 'desk') { ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(nx - 1, ny - 2, 2, 2); }

        const aw = w.task === 'presenting' ? Math.sin(f * 0.08) * 3 : 0;
        ctx.fillStyle = w.col + '55'; ctx.fillRect(nx - 7, ny - 3 + aw, 2, 5); ctx.fillRect(nx + 5, ny - 3 - aw, 2, 5);

        if (w.task === 'phone') { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(nx + 6, ny - 7, 3, 5); }
        if (w.task === 'coffee') {
          ctx.fillStyle = 'rgba(180,120,60,.55)'; ctx.fillRect(nx + 6, ny - 3, 4, 5);
          if (f % 40 < 20) { ctx.fillStyle = 'rgba(200,200,200,.25)'; ctx.fillRect(nx + 7, ny - 7, 2, 3); }
        }

        ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(nx, ny - 8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = w.hair; ctx.fillRect(nx - 4, ny - 14, 8, 4);

        ctx.fillStyle = w.col; ctx.font = '6px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
        ctx.fillText(w.bot.name.toUpperCase(), nx, ny - 17);
        ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.font = '4.5px "Share Tech Mono",monospace';
        ctx.fillText(TASK_LABELS[w.task], nx, ny - 12.5);

        if (w.task === 'desk' && dist < 5) {
          if (f % 30 < 15) { ctx.fillStyle = 'rgba(0,255,100,.35)'; ctx.fillRect(nx + 69, ny - 9, 2, 7); }
        }

        if (w.speech && w.speechT > 0) {
          const a = Math.min(1, w.speechT / 30);
          ctx.fillStyle = `rgba(15,20,28,${0.88 * a})`;
          const tw2 = ctx.measureText(w.speech).width + 14;
          const bx = nx - tw2 / 2, by = ny - 32;
          ctx.beginPath(); ctx.roundRect(bx, by, tw2, 14, 3); ctx.fill();
          ctx.strokeStyle = `rgba(56,189,248,${0.25 * a})`;
          ctx.beginPath(); ctx.roundRect(bx, by, tw2, 14, 3); ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${0.65 * a})`; ctx.font = '6px "Share Tech Mono",monospace';
          ctx.textAlign = 'center'; ctx.fillText(w.speech, nx, by + 10);
        }
      }

      const orgName = data.orgs[0]?.orgName ?? 'HEADQUARTERS';
      ctx.fillStyle = 'rgba(56,189,248,.5)'; ctx.font = '10px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${orgName.toUpperCase()} — THE OFFICE`, W / 2, H - 12);

      const hr = new Date().getHours(), mn = new Date().getMinutes(), sc = new Date().getSeconds();
      const ts = `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign = 'right';
      ctx.fillText(ts, W - 15, H - 12);
      ctx.textAlign = 'left';
      ctx.fillText(`${ws.length} EMPLOYEE${ws.length !== 1 ? 'S' : ''} ON SHIFT`, 15, H - 12);

      ctx.fillStyle = 'rgba(255,60,60,.6)'; ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign = 'left';
      const recDot = f % 60 < 30 ? '●' : '○';
      ctx.fillText(`${recDot} REC`, 15, 22);
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillText(camLabel, 55, 22);

      ctx.strokeStyle = 'rgba(56,189,248,.03)';
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

      const cornerSize = 20;
      ctx.strokeStyle = 'rgba(56,189,248,.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(12, 12 + cornerSize); ctx.lineTo(12, 12); ctx.lineTo(12 + cornerSize, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - 12 - cornerSize, 12); ctx.lineTo(W - 12, 12); ctx.lineTo(W - 12, 12 + cornerSize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(12, H - 12 - cornerSize); ctx.lineTo(12, H - 12); ctx.lineTo(12 + cornerSize, H - 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - 12 - cornerSize, H - 12); ctx.lineTo(W - 12, H - 12); ctx.lineTo(W - 12, H - 12 - cornerSize); ctx.stroke();

      if (f % 600 < 8) {
        ctx.fillStyle = `rgba(56,189,248,${0.02 * (8 - (f % 600)) / 8})`;
        ctx.fillRect(0, 0, W, H);
      }

      for (let sl = 0; sl < H; sl += 3) {
        ctx.fillStyle = 'rgba(0,0,0,.02)';
        ctx.fillRect(0, sl, W, 1);
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [data, newTask, camLabel]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const my = (e.clientY - r.top) * (H / r.height);
    let best: Worker | null = null, bestD = 30;
    for (const w of workersRef.current) {
      const d = Math.hypot(w.x - mx, w.y - my);
      if (d < bestD) { bestD = d; best = w; }
    }
    setSelected(best);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c12] flex items-center justify-center">
        <div className="text-center">
          <Cctv className="w-10 h-10 text-cyan-500/30 mx-auto mb-3 animate-pulse" />
          <p className="text-cyan-500/50 font-mono text-[10px] tracking-[.25em]">CONNECTING TO OFFICE FEED...</p>
        </div>
      </div>
    );
  }

  if (!data || data.bots.length === 0) {
    const emptyOrg = data?.orgs?.[0];
    return (
      <div className="min-h-screen bg-[#080c12] flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-500/8 bg-[#0a0e14]">
          <div className="flex items-center gap-2.5">
            <Eye className="w-3.5 h-3.5 text-cyan-500/40" />
            <span className="font-mono text-[10px] text-cyan-400/60 tracking-[.2em]">
              {emptyOrg ? `${emptyOrg.orgName.toUpperCase()} — OFFICE` : 'THE OFFICE'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('floor')}
              className={`flex items-center gap-1 font-mono text-[9px] px-2 py-1 rounded transition-colors ${activeTab === 'floor' ? 'bg-cyan-500/15 text-cyan-400/80' : 'text-cyan-500/30 hover:text-cyan-500/50'}`}
            >
              <Cctv className="w-3 h-3" />
              <span>FLOOR</span>
            </button>
            {emptyOrg && (
              <button
                onClick={() => setActiveTab('team')}
                className={`flex items-center gap-1 font-mono text-[9px] px-2 py-1 rounded transition-colors ${activeTab === 'team' ? 'bg-cyan-500/15 text-cyan-400/80' : 'text-cyan-500/30 hover:text-cyan-500/50'}`}
              >
                <UserCog className="w-3 h-3" />
                <span>TEAM</span>
              </button>
            )}
          </div>
        </div>
        {activeTab === 'team' && emptyOrg ? (
          <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
            <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-cyan-500/40 animate-spin" /></div>}>
              <TeamManagement orgId={emptyOrg.orgId} />
            </Suspense>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <Building2 className="w-14 h-14 text-cyan-500/15 mx-auto mb-5" />
              <h2 className="text-cyan-400/70 font-mono text-sm mb-2 tracking-[.2em]">NO OFFICE ESTABLISHED</h2>
              <p className="text-cyan-500/30 font-mono text-[10px] mb-5 leading-relaxed">
                Subscribe to bots from the Bot Factory to staff your office. Each bot becomes a visible worker on the floor.
              </p>
              <div className="flex flex-col gap-2 items-center">
                <button
                  onClick={() => navigate('/bots')}
                  className="px-5 py-1.5 bg-cyan-500/8 border border-cyan-500/25 text-cyan-400/70 font-mono text-[10px] tracking-[.2em] hover:bg-cyan-500/15 transition-colors"
                >
                  VISIT BOT FACTORY
                </button>
                {emptyOrg && (
                  <button
                    onClick={() => setActiveTab('team')}
                    className="px-5 py-1.5 text-cyan-500/40 font-mono text-[10px] tracking-[.2em] hover:text-cyan-500/60 transition-colors"
                  >
                    MANAGE YOUR TEAM
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const primaryOrg = data.orgs?.[0];

  return (
    <div className="min-h-screen bg-[#080c12] flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-500/8 bg-[#0a0e14]">
        <div className="flex items-center gap-2.5">
          <Eye className="w-3.5 h-3.5 text-cyan-500/40" />
          <span className="font-mono text-[10px] text-cyan-400/60 tracking-[.2em]">
            {primaryOrg ? `${primaryOrg.orgName.toUpperCase()} — OFFICE` : 'THE OFFICE'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('floor')}
            className={`flex items-center gap-1 font-mono text-[9px] px-2 py-1 rounded transition-colors ${activeTab === 'floor' ? 'bg-cyan-500/15 text-cyan-400/80' : 'text-cyan-500/30 hover:text-cyan-500/50'}`}
          >
            <Cctv className="w-3 h-3" />
            <span>FLOOR</span>
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-1 font-mono text-[9px] px-2 py-1 rounded transition-colors ${activeTab === 'team' ? 'bg-cyan-500/15 text-cyan-400/80' : 'text-cyan-500/30 hover:text-cyan-500/50'}`}
          >
            <UserCog className="w-3 h-3" />
            <span>TEAM</span>
          </button>
          <div className="flex items-center gap-1 text-cyan-500/25 font-mono text-[9px]">
            <Users className="w-3 h-3" />
            <span>{data.bots.length}</span>
          </div>
        </div>
      </div>

      {activeTab === 'team' && primaryOrg ? (
        <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
          <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-cyan-500/40 animate-spin" /></div>}>
            <TeamManagement orgId={primaryOrg.orgId} />
          </Suspense>
        </div>
      ) : activeTab === 'team' && !primaryOrg ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Building2 className="w-8 h-8 text-cyan-500/20 mx-auto mb-3" />
            <p className="font-mono text-[11px] text-cyan-500/30 mb-1">NO ORGANIZATION</p>
            <p className="font-mono text-[9px] text-cyan-500/20">
              Create or join an organization in the World to manage your team.
            </p>
          </div>
        </div>
      ) : (
      <div className="flex-1 flex">
        <div className="flex-1 flex items-center justify-center p-2">
          <canvas
            ref={canvasRef}
            width={W} height={H}
            onClick={handleClick}
            className="w-full max-w-[1200px] border border-cyan-500/8 cursor-crosshair"
            style={{ imageRendering: 'pixelated', aspectRatio: `${W}/${H}` }}
          />
        </div>

        <div className="w-56 border-l border-cyan-500/8 overflow-y-auto bg-[#0a0e14]/80">
          <div className="px-3 py-2 border-b border-cyan-500/8">
            <h3 className="font-mono text-[9px] text-cyan-500/40 tracking-[.25em]">OFFICE ROSTER</h3>
          </div>
          {data.bots.map((bot, i) => {
            const w = workersRef.current[i];
            const isSel = selected?.bot.slug === bot.slug;
            const cc = CAT_COLORS[bot.category] || '#6ee7b7';
            return (
              <div
                key={bot.slug}
                onClick={() => setSelected(w || null)}
                className={`px-3 py-1.5 border-b border-cyan-500/4 cursor-pointer transition-colors ${isSel ? 'bg-cyan-500/8' : 'hover:bg-cyan-500/4'}`}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cc }} />
                  <span className="font-mono text-[9px] text-cyan-400/70 tracking-wider">{bot.name.toUpperCase()}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="font-mono text-[7px] tracking-wider" style={{ color: cc + '70' }}>{bot.category.toUpperCase()}</span>
                  {w && <span className="font-mono text-[7px] text-cyan-500/25 tracking-wider">{TASK_LABELS[w.task]}</span>}
                </div>
              </div>
            );
          })}

          {selected && (
            <div className="p-3 border-t border-cyan-500/15 bg-cyan-500/4">
              <h4 className="font-mono text-[9px] text-cyan-400/80 tracking-[.2em] mb-0.5">{selected.bot.name.toUpperCase()}</h4>
              <p className="font-mono text-[7px] text-cyan-500/35 mb-1.5">{selected.bot.tagline}</p>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[7px] text-cyan-500/25">STATUS:</span>
                  <span className="font-mono text-[7px] text-green-400/50">{TASK_LABELS[selected.task]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[7px] text-cyan-500/25">DEPT:</span>
                  <span className="font-mono text-[7px]" style={{ color: selected.col }}>{selected.bot.category.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[7px] text-cyan-500/25">POS:</span>
                  <span className="font-mono text-[7px] text-cyan-500/35">{Math.round(selected.x)}, {Math.round(selected.y)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
