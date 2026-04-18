import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { usePresence } from '@/hooks/use-presence';
import { apiFetch } from '@/lib/api-client';
import { Building2, Users, Eye, Cctv, UserCog, Loader2, MapPin, DollarSign, Maximize2, Info, PanelRightOpen, PanelRightClose, Play, Pause, Plug, Settings, ExternalLink, Zap, Megaphone } from 'lucide-react';
import { useLocation } from 'wouter';
const TeamManagement = lazy(() => import('./TeamManagement'));
const BotCommandPanel = lazy(() => import('./BotCommandPanel'));

const MANAGER_ROLES = new Set(['owner', 'ceo', 'executive', 'director', 'manager']);

interface BotControlData {
  id: number;
  name: string;
  status: string;
  permissions: string[];
  connections: { platform: string }[];
  marketplaceItemId: number | null;
}

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

type BotTask = 'desk' | 'coffee' | 'phone' | 'copier' | 'filing' | 'meeting' | 'presenting' | 'water' | 'walk' | 'idle' | 'server' | 'reception' | 'exec' | 'lounge';

const TASK_LABELS: Record<BotTask, string> = {
  desk: 'WORKING AT DESK', coffee: 'GETTING COFFEE', phone: 'ON THE PHONE',
  copier: 'AT COPIER', filing: 'FILING RECORDS', meeting: 'IN MEETING',
  presenting: 'PRESENTING', water: 'WATER COOLER', walk: 'IN TRANSIT', idle: 'IDLE',
  server: 'SERVER ROOM', reception: 'AT RECEPTION', exec: 'EXECUTIVE OFFICE', lounge: 'IN LOUNGE',
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
  server: ['Checking rack temps...', 'All green.', 'Patch applied.'],
  reception: ['Welcome! How can I help?', 'Visitor badge issued.', 'Conference room B is free.'],
  exec: ['Reviewing quarterly figures.', 'Board meeting prep.', 'Signing off on this.'],
  lounge: ['Nice couch.', 'Quick power nap.', 'Recharging.'],
};

const CAT_COLORS: Record<string, string> = {
  finance: '#2d8a56', sales: '#c47d10', marketing: '#c44080', creative: '#7a5fc4',
  operations: '#2888c4', legal: '#6a7888', education: '#0898a8', medical: '#c83030',
  'e-commerce': '#d07020', general: '#3aaa7a', music: '#9060c0', publishing: '#c89820',
  design: '#d06090', logistics: '#20a898', trades: '#6a6050', support: '#3878c0',
};

const HAIR_STYLES = ['buzz', 'short', 'swept', 'curly', 'long', 'bun', 'mohawk', 'parted'] as const;
type HairStyle = typeof HAIR_STYLES[number];
const HAIR_COLORS = ['#1a1a1a','#3a2010','#6a4a2a','#8B4513','#2a1508','#4a3a2a','#c0903a','#884422','#d4a040','#8a2020','#f0e0c0'];
const SKIN_TONES = ['#f5dcc0','#e8c4a0','#d4a878','#c4956a','#a07848','#7a5a3a'];
const SHIRT_PATTERNS = ['solid', 'striped', 'checkered'] as const;
type ShirtPattern = typeof SHIRT_PATTERNS[number];
const ACCESSORY_TYPES = ['none', 'glasses', 'tie', 'bowtie', 'lanyard', 'headset'] as const;
type Accessory = typeof ACCESSORY_TYPES[number];

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
  activityLine: string;
  col: string;
  hair: string;
  skin: string;
  facing: 'left' | 'right' | 'down' | 'up';
  hairStyle: HairStyle;
  shirtPattern: ShirtPattern;
  accessory: Accessory;
  height: number;
  bodyWidth: number;
}

const TASK_DETAILS: Record<BotTask, string[]> = {
  desk: [
    'Updating CRM records for Q2 pipeline',
    'Writing follow-up emails to 12 leads',
    'Building revenue forecast spreadsheet',
    'Reviewing contract terms for renewal',
    'Syncing data between platforms',
    'Analyzing customer churn metrics',
    'Preparing onboarding docs for new client',
    'Debugging automation workflow',
    'Compiling weekly performance report',
    'Cross-referencing invoices with payments',
  ],
  coffee: ['Brewing a fresh pot — dark roast', 'Refilling the mug for round three', 'Waiting for the espresso machine', 'Adding cream, debating sugar'],
  phone: ['Confirming appointment with client', 'Following up on invoice #4782', 'Transferring call to sales team', 'Discussing contract amendments', 'Walking through pricing options', 'Scheduling a product demo'],
  meeting: ['Reviewing quarterly targets with team', 'Brainstorming campaign concepts', 'Going through the sprint backlog', 'Presenting client feedback analysis', 'Discussing hiring plan for next month', 'Aligning on product roadmap priorities'],
  presenting: ['Showing revenue data on projector', 'Walking through competitive analysis', 'Demonstrating new feature prototype', 'Presenting monthly KPI dashboard'],
  copier: ['Printing 30 copies of the proposal', 'Scanning signed contracts to PDF', 'Collating materials for client deck', 'Fixing paper jam — tray 2 again'],
  filing: ['Organizing invoices by date', 'Archiving completed project files', 'Pulling records for compliance audit', 'Labeling folders for new accounts'],
  water: ['Quick hydration break', 'Chatting about the weekend', 'Refilling the water bottle'],
  walk: ['Heading to the next meeting', 'Walking to check on a colleague', 'Moving between departments'],
  idle: ['Waiting for next assignment', 'Reviewing task queue', 'Standing by for instructions'],
  server: ['Checking server rack temperatures', 'Applying security patch to Node 3', 'Reviewing system uptime logs', 'Rebooting secondary DNS server'],
  reception: ['Greeting a walk-in visitor', 'Issuing temporary access badge', 'Directing delivery to loading dock', 'Answering the front desk phone'],
  exec: ['Reviewing board meeting agenda', 'Signing off on budget proposal', 'Reviewing executive summary', 'Approving vendor contract'],
  lounge: ['Taking a quick break on the couch', 'Scrolling through news on phone', 'Resting before afternoon meetings', 'Catching up with a coworker'],
};

const TASK_ICONS: Record<BotTask, string> = {
  desk: '💻', coffee: '☕', phone: '📞', copier: '🖨️', filing: '📁',
  meeting: '🤝', presenting: '📊', water: '💧', walk: '🚶', idle: '⏳',
  server: '🖥️', reception: '🛎️', exec: '📋', lounge: '🛋️',
};

const WW = 3600, WH = 2400;

interface Room {
  x: number; y: number; w: number; h: number;
  label: string;
  floorColor: string;
  wallColor: string;
  doors: { side: 'top' | 'bottom' | 'left' | 'right'; pos: number; width: number }[];
  isGlass?: boolean;
}

const WALL = 10;

const ROOMS: Room[] = [
  { x: 0, y: 0, w: 3600, h: 2400, label: '', floorColor: '#1a1d24', wallColor: '#2a2e38', doors: [] },
  { x: 40, y: 40, w: 600, h: 500, label: 'JEAN CLAW — OFFICE MANAGER', floorColor: '#1e2128', wallColor: '#3a3e48', doors: [{ side: 'right', pos: 200, width: 80 }] },
  { x: 40, y: 600, w: 600, h: 420, label: 'KITCHEN & BREAK ROOM', floorColor: '#1c1f26', wallColor: '#34383f', doors: [{ side: 'right', pos: 150, width: 90 }] },
  { x: 40, y: 1080, w: 600, h: 500, label: 'STORAGE & FILES', floorColor: '#191c22', wallColor: '#34383f', doors: [{ side: 'right', pos: 200, width: 80 }] },
  { x: 700, y: 40, w: 1200, h: 700, label: 'OPEN OFFICE — WORKSTATIONS', floorColor: '#1e222a', wallColor: '#2a2e38', doors: [{ side: 'bottom', pos: 500, width: 120 }] },
  { x: 1960, y: 40, w: 700, h: 500, label: 'CONFERENCE ROOM A', floorColor: '#1c2028', wallColor: '#2a4050', doors: [{ side: 'bottom', pos: 300, width: 80 }], isGlass: true },
  { x: 2720, y: 40, w: 840, h: 500, label: 'EXECUTIVE SUITE', floorColor: '#1a1e24', wallColor: '#2a2418', doors: [{ side: 'left', pos: 200, width: 80 }] },
  { x: 1960, y: 600, w: 700, h: 420, label: 'CONFERENCE ROOM B', floorColor: '#1c2028', wallColor: '#2a4050', doors: [{ side: 'left', pos: 180, width: 80 }], isGlass: true },
  { x: 2720, y: 600, w: 840, h: 420, label: 'SERVER ROOM', floorColor: '#141820', wallColor: '#1a2030', doors: [{ side: 'left', pos: 180, width: 70 }] },
  { x: 700, y: 800, w: 1200, h: 600, label: 'OPEN OFFICE — WORKSTATIONS B', floorColor: '#1e222a', wallColor: '#2a2e38', doors: [{ side: 'top', pos: 500, width: 120 }, { side: 'bottom', pos: 500, width: 120 }] },
  { x: 40, y: 1640, w: 600, h: 380, label: 'LOUNGE', floorColor: '#1c1e24', wallColor: '#34383f', doors: [{ side: 'right', pos: 150, width: 90 }] },
  { x: 700, y: 1460, w: 1200, h: 460, label: 'RECEPTION & LOBBY', floorColor: '#1e2230', wallColor: '#2a2e38', doors: [{ side: 'bottom', pos: 500, width: 160 }] },
  { x: 1960, y: 1080, w: 1600, h: 500, label: 'TRAINING CENTER', floorColor: '#1c2026', wallColor: '#34383f', doors: [{ side: 'left', pos: 200, width: 90 }] },
  { x: 1960, y: 1640, w: 800, h: 380, label: 'PHONE BANK', floorColor: '#1a1e24', wallColor: '#34383f', doors: [{ side: 'left', pos: 150, width: 80 }] },
  { x: 2820, y: 1640, w: 740, h: 380, label: 'SUPPLY CLOSET', floorColor: '#191c22', wallColor: '#34383f', doors: [{ side: 'left', pos: 150, width: 70 }] },
  { x: 40, y: 2080, w: 1860, h: 280, label: 'PARKING GARAGE — LEVEL P1', floorColor: '#16181e', wallColor: '#282c34', doors: [{ side: 'top', pos: 400, width: 200 }] },
  { x: 1960, y: 2080, w: 1600, h: 280, label: 'LOADING DOCK', floorColor: '#14161c', wallColor: '#282c34', doors: [{ side: 'top', pos: 600, width: 180 }] },
];

function drawRoom(ctx: CanvasRenderingContext2D, room: Room) {
  ctx.fillStyle = room.floorColor;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  if (room.label === '') return;

  const tileSize = 40;
  ctx.strokeStyle = 'rgba(255,255,255,.03)';
  ctx.lineWidth = 0.5;
  for (let tx = room.x; tx < room.x + room.w; tx += tileSize) {
    ctx.beginPath(); ctx.moveTo(tx, room.y); ctx.lineTo(tx, room.y + room.h); ctx.stroke();
  }
  for (let ty = room.y; ty < room.y + room.h; ty += tileSize) {
    ctx.beginPath(); ctx.moveTo(room.x, ty); ctx.lineTo(room.x + room.w, ty); ctx.stroke();
  }

  const wallAlpha = room.isGlass ? 0.5 : 1;
  const wc = room.wallColor;

  const drawWallSegments = (x1: number, y1: number, x2: number, y2: number, side: 'top'|'bottom'|'left'|'right') => {
    const sideDoors = room.doors.filter(d => d.side === side);
    const fillCol = `rgba(${hexToRgb(wc)},${wallAlpha})`;
    ctx.fillStyle = fillCol;
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;

    if (sideDoors.length === 0) {
      if (side === 'top' || side === 'bottom') { ctx.fillRect(x1, y1, x2 - x1, WALL); ctx.strokeRect(x1, y1, x2 - x1, WALL); }
      else { ctx.fillRect(x1, y1, WALL, y2 - y1); ctx.strokeRect(x1, y1, WALL, y2 - y1); }
      return;
    }
    for (const door of sideDoors) {
      if (side === 'top' || side === 'bottom') {
        const ds = room.x + door.pos, de = ds + door.width;
        if (ds > x1) { ctx.fillRect(x1, y1, ds - x1, WALL); }
        if (de < x2) { ctx.fillRect(de, y1, x2 - de, WALL); }
        ctx.fillStyle = room.floorColor; ctx.fillRect(ds, y1, door.width, WALL);
        ctx.strokeStyle = 'rgba(56,189,248,.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ds, y1); ctx.lineTo(ds, y1 + WALL); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(de, y1); ctx.lineTo(de, y1 + WALL); ctx.stroke();
      } else {
        const ds = room.y + door.pos, de = ds + door.width;
        if (ds > y1) { ctx.fillRect(x1, y1, WALL, ds - y1); }
        if (de < y2) { ctx.fillRect(x1, de, WALL, y2 - de); }
        ctx.fillStyle = room.floorColor; ctx.fillRect(x1, ds, WALL, door.width);
        ctx.strokeStyle = 'rgba(56,189,248,.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, ds); ctx.lineTo(x1 + WALL, ds); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, de); ctx.lineTo(x1 + WALL, de); ctx.stroke();
      }
      ctx.fillStyle = fillCol;
    }
  };

  drawWallSegments(room.x, room.y, room.x + room.w, room.y, 'top');
  drawWallSegments(room.x, room.y + room.h - WALL, room.x + room.w, room.y + room.h, 'bottom');
  drawWallSegments(room.x, room.y, room.x, room.y + room.h, 'left');
  drawWallSegments(room.x + room.w - WALL, room.y, room.x + room.w, room.y + room.h, 'right');

  if (room.isGlass) {
    ctx.strokeStyle = 'rgba(56,189,248,.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(room.x + 2, room.y + 2, room.w - 4, room.h - 4);
    ctx.setLineDash([]);
  }

  ctx.fillStyle = 'rgba(56,189,248,.25)';
  ctx.font = 'bold 13px "Inter","Segoe UI",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(room.label, room.x + 20, room.y + 28);
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, f: number) {
  ctx.fillStyle = '#3a3428';
  ctx.fillRect(x, y, 90, 50);
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 90, 50);
  ctx.fillStyle = '#2e2820';
  ctx.fillRect(x + 2, y + 2, 86, 46);
  ctx.fillStyle = '#3a3428';
  ctx.fillRect(x + 4, y + 4, 82, 42);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 10, y + 5, 45, 30);
  const screenGlow = 0.5 + Math.sin(f * 0.03) * 0.15;
  ctx.fillStyle = `rgba(56,189,248,${screenGlow * 0.2})`;
  ctx.fillRect(x + 12, y + 7, 41, 24);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 30, y + 35, 5, 6);
  ctx.fillRect(x + 25, y + 41, 15, 3);
  ctx.fillStyle = '#222228';
  ctx.fillRect(x + 62, y + 28, 22, 12);
  ctx.fillStyle = 'rgba(56,189,248,.15)';
  for (let kx = 0; kx < 5; kx++) for (let ky = 0; ky < 3; ky++) {
    ctx.fillRect(x + 64 + kx * 4, y + 30 + ky * 3, 2, 1.5);
  }
  ctx.fillStyle = '#222228';
  ctx.fillRect(x + 63, y + 15, 10, 8);
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath(); ctx.arc(x + 12, y + 20, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222228';
  ctx.fillRect(x + 6, y + 12, 12, 4);
  ctx.fillStyle = '#1e1e24';
  ctx.beginPath(); ctx.arc(x + 12, y + 20, 3, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(x + 12 + Math.cos(a) * 8 - 1, y + 20 + Math.sin(a) * 8 - 1, 3, 3);
  }
}

function drawConfTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#2e2818';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.stroke();
  ctx.fillStyle = '#252010';
  ctx.beginPath(); ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 8); ctx.fill();
}

function drawConfChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#1e1e24';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
}

function drawServerRack(ctx: CanvasRenderingContext2D, x: number, y: number, f: number) {
  ctx.fillStyle = '#1a1e28';
  ctx.fillRect(x, y, 40, 80);
  ctx.strokeStyle = '#141820'; ctx.lineWidth = 1; ctx.strokeRect(x, y, 40, 80);
  for (let row = 0; row < 6; row++) {
    ctx.fillStyle = '#141820';
    ctx.fillRect(x + 4, y + 6 + row * 12, 32, 9);
    const glow = Math.sin(f * 0.06 + row * 1.2) > 0;
    ctx.fillStyle = glow ? '#40d060' : '#103010';
    ctx.fillRect(x + 8, y + 9 + row * 12, 3, 3);
    ctx.fillStyle = (f + row * 50) % 120 < 60 ? '#d0a020' : '#302008';
    ctx.fillRect(x + 14, y + 9 + row * 12, 3, 3);
    ctx.fillStyle = 'rgba(56,189,248,.08)';
    for (let v = 0; v < 4; v++) ctx.fillRect(x + 22 + v * 4, y + 8 + row * 12, 2, 5);
  }
}

function drawFileCabinet(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(x, y, 30, 60);
  ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.strokeRect(x, y, 30, 60);
  for (let d = 0; d < 3; d++) {
    ctx.fillStyle = '#242830';
    ctx.fillRect(x + 3, y + 4 + d * 19, 24, 16);
    ctx.fillStyle = 'rgba(56,189,248,.15)';
    ctx.fillRect(x + 12, y + 10 + d * 19, 6, 3);
  }
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number, f: number) {
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(x, y, 35, 45);
  ctx.fillStyle = '#222228';
  ctx.fillRect(x + 3, y + 3, 29, 20);
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(x + 8, y + 26, 18, 14);
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(x + 12, y + 30, 10, 8);
  if (f % 80 < 40) { ctx.fillStyle = 'rgba(200,200,200,.1)'; ctx.fillRect(x + 14, y + 22, 6, 6); }
  ctx.fillStyle = '#c04020';
  ctx.beginPath(); ctx.arc(x + 28, y + 8, 3, 0, Math.PI * 2); ctx.fill();
}

function drawCouch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = '#2a2440';
  ctx.beginPath(); ctx.roundRect(x, y, w, 40, 6); ctx.fill();
  ctx.fillStyle = '#342e4a';
  ctx.beginPath(); ctx.roundRect(x + 4, y + 4, w - 8, 32, 4); ctx.fill();
  ctx.fillStyle = '#221c38';
  ctx.fillRect(x, y, 20, 40);
  ctx.fillRect(x + w - 20, y, 20, 40);
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(x - size * 0.3, y, size * 0.6, size * 0.5);
  ctx.fillStyle = '#1a4a20';
  ctx.beginPath(); ctx.arc(x, y - size * 0.2, size * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#206828';
  ctx.beginPath(); ctx.arc(x - size * 0.15, y - size * 0.35, size * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + size * 0.2, y - size * 0.3, size * 0.25, 0, Math.PI * 2); ctx.fill();
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(56,189,248,.1)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 15, y + 15); ctx.lineTo(x + w * 0.6, y + 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 15, y + 30); ctx.lineTo(x + w * 0.5, y + 35); ctx.stroke();
  ctx.strokeStyle = 'rgba(248,56,100,.08)';
  ctx.beginPath(); ctx.moveTo(x + w * 0.6, y + 10); ctx.lineTo(x + w * 0.8, y + h * 0.6); ctx.stroke();
  ctx.fillStyle = '#222228';
  ctx.fillRect(x + 10, y + h + 2, w - 20, 4);
}

function drawReceptionDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2e2818';
  ctx.beginPath(); ctx.roundRect(x, y, 200, 60, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.roundRect(x, y, 200, 60, 8); ctx.stroke();
  ctx.fillStyle = '#252010';
  ctx.fillRect(x + 10, y + 5, 180, 50);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 20, y + 12, 55, 32);
  ctx.fillStyle = `rgba(56,189,248,.15)`;
  ctx.fillRect(x + 22, y + 14, 51, 26);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 140, y + 12, 40, 32);
  ctx.fillStyle = `rgba(56,189,248,.12)`;
  ctx.fillRect(x + 142, y + 14, 36, 26);
}

function drawCeilingLight(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 100);
  grad.addColorStop(0, 'rgba(56,189,248,.06)');
  grad.addColorStop(0.5, 'rgba(56,189,248,.02)');
  grad.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 100, y - 100, 200, 200);
  ctx.fillStyle = 'rgba(56,189,248,.12)';
  ctx.fillRect(x - 15, y - 2, 30, 4);
}

function drawPhoneBooth(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(x, y, 50, 50);
  ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.strokeRect(x, y, 50, 50);
  ctx.fillStyle = '#1e222a';
  ctx.fillRect(x + 5, y + 5, 40, 40);
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(x + 10, y + 8, 30, 20);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 15, y + 10, 18, 12);
  ctx.fillStyle = `rgba(56,189,248,.1)`;
  ctx.fillRect(x + 16, y + 11, 16, 10);
  ctx.fillStyle = '#222228';
  ctx.fillRect(x + 15, y + 30, 18, 8);
}

function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(x, y + 15, 20, 25);
  ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.strokeRect(x, y + 15, 20, 25);
  ctx.fillStyle = 'rgba(56,140,200,.2)';
  ctx.beginPath(); ctx.arc(x + 10, y + 8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(56,140,200,.15)';
  ctx.beginPath(); ctx.arc(x + 10, y + 8, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#2060a0';
  ctx.fillRect(x + 6, y + 28, 3, 5);
  ctx.fillStyle = '#a03030';
  ctx.fillRect(x + 11, y + 28, 3, 5);
}

function drawPrinter(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(x, y, 50, 35);
  ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.strokeRect(x, y, 50, 35);
  ctx.fillStyle = '#242830';
  ctx.fillRect(x + 5, y - 5, 40, 8);
  ctx.fillStyle = '#222228';
  ctx.fillRect(x + 5, y + 30, 40, 8);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 8, y + 8, 20, 10);
  ctx.fillStyle = 'rgba(56,189,248,.1)';
  ctx.fillRect(x + 9, y + 9, 18, 8);
  ctx.fillStyle = '#40d060';
  ctx.beginPath(); ctx.arc(x + 40, y + 12, 2, 0, Math.PI * 2); ctx.fill();
}

function drawFurniture(ctx: CanvasRenderingContext2D, f: number) {
  const deskPositions = getDeskPositions(24);
  for (const dp of deskPositions) { drawDesk(ctx, dp.x, dp.y, f); drawChair(ctx, dp.x + 30, dp.y + 52); }
  drawConfTable(ctx, 2060, 120, 500, 120);
  const confChairPositions = [
    { x: 2110, y: 100 }, { x: 2210, y: 100 }, { x: 2310, y: 100 }, { x: 2410, y: 100 },
    { x: 2110, y: 260 }, { x: 2210, y: 260 }, { x: 2310, y: 260 }, { x: 2410, y: 260 },
  ];
  for (const cp of confChairPositions) drawConfChair(ctx, cp.x, cp.y);
  drawConfTable(ctx, 2060, 680, 400, 100);
  for (const cp of [{ x: 2110, y: 660 }, { x: 2210, y: 660 }, { x: 2310, y: 660 }, { x: 2110, y: 800 }, { x: 2210, y: 800 }, { x: 2310, y: 800 }]) drawConfChair(ctx, cp.x, cp.y);
  drawDesk(ctx, 120, 120, f); drawChair(ctx, 150, 175); drawDesk(ctx, 350, 120, f); drawChair(ctx, 380, 175);
  drawFileCabinet(ctx, 120, 300); drawFileCabinet(ctx, 160, 300);
  drawPlant(ctx, 560, 100, 18); drawWhiteboard(ctx, 100, 380, 200, 80);
  drawCoffeeMachine(ctx, 100, 660, f); drawCoffeeMachine(ctx, 160, 660, f); drawWaterCooler(ctx, 250, 660);
  ctx.fillStyle = '#3a3428'; ctx.fillRect(100, 740, 120, 50); ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.strokeRect(100, 740, 120, 50);
  drawPlant(ctx, 500, 700, 14);
  for (let fc = 0; fc < 8; fc++) drawFileCabinet(ctx, 80 + fc * 50, 1140);
  for (let fc = 0; fc < 8; fc++) drawFileCabinet(ctx, 80 + fc * 50, 1300);
  ctx.fillStyle = '#2a2e34'; ctx.fillRect(80, 1220, 400, 60);
  for (let sr = 0; sr < 8; sr++) drawServerRack(ctx, 2780 + (sr % 4) * 60, 660 + Math.floor(sr / 4) * 100, f);
  for (let sr = 0; sr < 4; sr++) drawServerRack(ctx, 3200 + sr * 60, 660, f);
  drawWhiteboard(ctx, 2780, 100, 250, 80);
  drawDesk(ctx, 2800, 250, f); drawChair(ctx, 2830, 305); drawDesk(ctx, 3000, 250, f); drawChair(ctx, 3030, 305);
  drawFileCabinet(ctx, 3400, 100); drawPlant(ctx, 3480, 100, 20); drawCouch(ctx, 2800, 400, 160);
  drawCouch(ctx, 100, 1700, 180); drawCouch(ctx, 100, 1800, 180);
  ctx.fillStyle = '#2e2818'; ctx.fillRect(340, 1720, 80, 80); ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.strokeRect(340, 1720, 80, 80);
  drawPlant(ctx, 540, 1700, 16); drawPlant(ctx, 540, 1850, 16);
  drawReceptionDesk(ctx, 1100, 1600); drawPlant(ctx, 1080, 1600, 18); drawPlant(ctx, 1320, 1600, 18);
  drawCouch(ctx, 900, 1750, 140); drawCouch(ctx, 1300, 1750, 140);
  for (let i = 0; i < 6; i++) { drawDesk(ctx, 2020 + (i % 3) * 200, 1140 + Math.floor(i / 3) * 160, f); drawChair(ctx, 2050 + (i % 3) * 200, 1195 + Math.floor(i / 3) * 160); }
  drawWhiteboard(ctx, 2100, 1080, 300, 40);
  for (let pb = 0; pb < 6; pb++) drawPhoneBooth(ctx, 2020 + pb * 100, 1700);
  for (let pb = 0; pb < 6; pb++) drawPhoneBooth(ctx, 2020 + pb * 100, 1800);
  drawPrinter(ctx, 950, 850); drawPrinter(ctx, 1020, 850); drawWaterCooler(ctx, 1100, 850);
  const lightPositions = [
    { x: 1000, y: 200 }, { x: 1300, y: 200 }, { x: 1000, y: 500 }, { x: 1300, y: 500 },
    { x: 1000, y: 1000 }, { x: 1300, y: 1000 }, { x: 1000, y: 1200 }, { x: 1300, y: 1200 },
    { x: 300, y: 200 }, { x: 300, y: 800 }, { x: 300, y: 1300 }, { x: 300, y: 1800 },
    { x: 2300, y: 200 }, { x: 2300, y: 800 }, { x: 3100, y: 200 }, { x: 3100, y: 800 },
    { x: 2300, y: 1300 }, { x: 3100, y: 1300 }, { x: 2300, y: 1800 }, { x: 3100, y: 1800 },
    { x: 1300, y: 1600 },
  ];
  for (const lp of lightPositions) drawCeilingLight(ctx, lp.x, lp.y);
}

function getDeskPositions(count: number): { x: number; y: number; room: string }[] {
  const positions: { x: number; y: number; room: string }[] = [];
  const zones = [
    { sx: 760, sy: 100, cols: 4, rows: 4, dx: 140, dy: 130, room: 'open-a' },
    { sx: 760, sy: 860, cols: 4, rows: 4, dx: 140, dy: 130, room: 'open-b' },
    { sx: 2040, sy: 1140, cols: 3, rows: 3, dx: 200, dy: 140, room: 'training' },
    { sx: 2040, sy: 1700, cols: 4, rows: 2, dx: 130, dy: 80, room: 'phone-bank' },
    { sx: 160, sy: 1720, cols: 2, rows: 2, dx: 140, dy: 100, room: 'lounge' },
  ];
  for (const z of zones) for (let r = 0; r < z.rows; r++) for (let c = 0; c < z.cols; c++) {
    if (positions.length >= count) return positions;
    positions.push({ x: z.sx + c * z.dx, y: z.sy + r * z.dy, room: z.room });
  }
  let overflow = 0;
  while (positions.length < count) {
    positions.push({ x: 760 + (overflow % 6) * 140, y: 1500 + Math.floor(overflow / 6) * 130, room: 'overflow' });
    overflow++;
  }
  return positions;
}

function drawHair(ctx: CanvasRenderingContext2D, nx: number, ny: number, style: HairStyle, color: string, headR: number) {
  ctx.fillStyle = color;
  const r = headR;
  switch (style) {
    case 'buzz':
      ctx.beginPath(); ctx.arc(nx, ny - r * 0.2, r + 1, Math.PI, 0); ctx.fill();
      break;
    case 'short':
      ctx.beginPath(); ctx.arc(nx, ny - r * 0.1, r + 2, Math.PI * 1.1, -0.1 * Math.PI); ctx.fill();
      ctx.fillRect(nx - r - 1, ny - r * 0.8, 3, r * 0.6);
      ctx.fillRect(nx + r - 2, ny - r * 0.8, 3, r * 0.6);
      break;
    case 'swept':
      ctx.beginPath(); ctx.arc(nx, ny - r * 0.1, r + 2, Math.PI * 1.05, -0.05 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(nx + r * 0.8, ny - r * 0.8, r * 0.6, r * 0.3, -0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'curly':
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        ctx.beginPath(); ctx.arc(nx + Math.cos(a) * (r + 1), ny - r * 0.1 + Math.sin(a) * (r + 1), r * 0.4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'long':
      ctx.beginPath(); ctx.arc(nx, ny - r * 0.1, r + 2, Math.PI * 1.1, -0.1 * Math.PI); ctx.fill();
      ctx.fillRect(nx - r - 2, ny - r * 0.5, 4, r * 2);
      ctx.fillRect(nx + r - 2, ny - r * 0.5, 4, r * 2);
      break;
    case 'bun':
      ctx.beginPath(); ctx.arc(nx, ny - r * 0.1, r + 1, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(nx, ny - r * 1.5, r * 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'mohawk':
      ctx.fillRect(nx - 2, ny - r * 2, 4, r * 1.2);
      ctx.beginPath(); ctx.arc(nx, ny - r * 2, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'parted':
      ctx.beginPath(); ctx.arc(nx, ny - r * 0.1, r + 2, Math.PI * 1.05, -0.05 * Math.PI); ctx.fill();
      ctx.fillStyle = darken(color, 20);
      ctx.fillRect(nx - 1, ny - r * 1.3, 2, r * 0.6);
      break;
  }
}

function darken(hex: string, amt: number): string {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - amt);
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - amt);
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - amt);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function drawWorker(ctx: CanvasRenderingContext2D, w: Worker, f: number, isSelected: boolean) {
  const moving = Math.hypot(w.tx - w.x, w.ty - w.y) > 2;
  const bob = Math.sin(w.phase) * (moving ? 2 : 0.6);
  const nx = Math.round(w.x), ny = Math.round(w.y + bob);
  const bw = w.bodyWidth;
  const headR = bw * 0.65;

  if (isSelected) {
    ctx.strokeStyle = 'rgba(56,189,248,.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(nx, ny, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const pulse = 0.06 + Math.sin(f * 0.04) * 0.03;
    const selGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, 36);
    selGrad.addColorStop(0, `rgba(56,189,248,${pulse})`);
    selGrad.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = selGrad;
    ctx.fillRect(nx - 36, ny - 36, 72, 72);
  }

  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(nx, ny + 24, 10, 4, 0, 0, Math.PI * 2); ctx.fill();

  const legSwing = moving ? Math.sin(w.wf * 0.12) * 4 : 0;
  ctx.fillStyle = '#1a1a2a';
  ctx.beginPath(); ctx.roundRect(nx - bw * 0.4, ny + 14, bw * 0.35, 10 + legSwing, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(nx + bw * 0.05, ny + 14, bw * 0.35, 10 - legSwing, 2); ctx.fill();
  ctx.fillStyle = '#1a1820';
  ctx.beginPath(); ctx.roundRect(nx - bw * 0.45, ny + 23 + legSwing, bw * 0.4, 4, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(nx + bw * 0.05, ny + 23 - legSwing, bw * 0.4, 4, 2); ctx.fill();

  ctx.fillStyle = '#28283a';
  ctx.fillRect(nx - bw * 0.15, ny + 10, bw * 0.3, 6);

  ctx.fillStyle = w.col;
  ctx.beginPath(); ctx.roundRect(nx - bw, ny - 4, bw * 2, 18, 4); ctx.fill();
  ctx.fillStyle = darken(w.col, 15);
  ctx.beginPath(); ctx.roundRect(nx - bw + 1, ny - 3, bw * 2 - 2, 16, 3); ctx.fill();
  ctx.fillStyle = w.col;
  ctx.beginPath(); ctx.roundRect(nx - bw + 2, ny - 2, bw * 2 - 4, 14, 2); ctx.fill();

  if (w.shirtPattern === 'striped') {
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let sy = 0; sy < 4; sy++) ctx.fillRect(nx - bw + 3, ny - 1 + sy * 3.5, bw * 2 - 6, 1);
  }
  if (w.shirtPattern === 'checkered') {
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      if ((sy + sx) % 2 === 0) ctx.fillRect(nx - bw + 3 + sx * 5, ny - 1 + sy * 4, 4, 3);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(nx - 1, ny - 2, 2, 13);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath(); ctx.roundRect(nx - bw * 0.6, ny - 5, bw * 1.2, 3, 1.5); ctx.fill();

  const armSwing = moving ? Math.sin(w.wf * 0.12) * 3 : 0;
  ctx.fillStyle = w.col;
  ctx.beginPath(); ctx.roundRect(nx - bw - 4, ny - 2 + armSwing, 5, 12, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(nx + bw - 1, ny - 2 - armSwing, 5, 12, 2); ctx.fill();
  ctx.fillStyle = w.skin;
  ctx.beginPath(); ctx.arc(nx - bw - 1.5, ny + 10 + armSwing, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + bw + 1.5, ny + 10 - armSwing, 3, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = w.skin;
  ctx.beginPath(); ctx.arc(nx, ny - 12, headR, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = darken(w.skin, 20);
  ctx.beginPath(); ctx.arc(nx, ny - 10, headR * 0.75, 0, Math.PI, false); ctx.fill();
  ctx.fillStyle = w.skin;
  ctx.beginPath(); ctx.arc(nx, ny - 10.5, headR * 0.7, 0, Math.PI, false); ctx.fill();

  drawHair(ctx, nx, ny - 12, w.hairStyle, w.hair, headR);

  ctx.fillStyle = '#f8f8f8';
  ctx.beginPath(); ctx.arc(nx - 3, ny - 13, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 3, ny - 13, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(nx - 3, ny - 13, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 3, ny - 13, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(nx - 3.5, ny - 13.5, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 2.5, ny - 13.5, 0.5, 0, Math.PI * 2); ctx.fill();

  const mouthOpen = Math.sin(f * 0.08) > 0.7 && w.speech && w.speechT > 0;
  if (mouthOpen) {
    ctx.fillStyle = '#2a1010';
    ctx.beginPath(); ctx.ellipse(nx, ny - 8, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = darken(w.skin, 40);
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(nx, ny - 8.5, 2, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  ctx.fillStyle = darken(w.skin, 8);
  ctx.beginPath(); ctx.ellipse(nx, ny - 10, 1, 0.6, 0, 0, Math.PI * 2); ctx.fill();

  if (w.accessory === 'glasses') {
    ctx.strokeStyle = 'rgba(200,200,220,.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(nx - 3, ny - 13, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(nx + 3, ny - 13, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx, ny - 13); ctx.lineTo(nx, ny - 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx - 6, ny - 13); ctx.lineTo(nx - headR, ny - 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx + 6, ny - 13); ctx.lineTo(nx + headR, ny - 13); ctx.stroke();
  }
  if (w.accessory === 'tie') {
    ctx.fillStyle = '#c03030';
    ctx.beginPath();
    ctx.moveTo(nx, ny - 4); ctx.lineTo(nx - 2.5, ny + 2); ctx.lineTo(nx, ny + 10);
    ctx.lineTo(nx + 2.5, ny + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a02020';
    ctx.beginPath(); ctx.moveTo(nx - 2.5, ny - 4); ctx.lineTo(nx + 2.5, ny - 4);
    ctx.lineTo(nx + 1.5, ny - 2); ctx.lineTo(nx - 1.5, ny - 2); ctx.closePath(); ctx.fill();
  }
  if (w.accessory === 'bowtie') {
    ctx.fillStyle = '#a03050';
    ctx.beginPath(); ctx.moveTo(nx, ny - 3); ctx.lineTo(nx - 5, ny - 6);
    ctx.lineTo(nx - 5, ny); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx, ny - 3); ctx.lineTo(nx + 5, ny - 6);
    ctx.lineTo(nx + 5, ny); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c04060';
    ctx.beginPath(); ctx.arc(nx, ny - 3, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  if (w.accessory === 'lanyard') {
    ctx.strokeStyle = 'rgba(56,189,248,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(nx - 2, ny - 5); ctx.quadraticCurveTo(nx - 4, ny + 6, nx - 3, ny + 14); ctx.stroke();
    ctx.fillStyle = 'rgba(56,189,248,.3)';
    ctx.beginPath(); ctx.roundRect(nx - 5, ny + 12, 6, 8, 1); ctx.fill();
  }
  if (w.accessory === 'headset') {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(nx, ny - 16, headR + 2, Math.PI * 1.15, -0.15 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(nx - headR - 1, ny - 12, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(nx + headR + 1, ny - 12, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(nx - headR - 2, ny - 9); ctx.quadraticCurveTo(nx - headR - 6, ny - 4, nx - headR - 3, ny); ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(nx - headR - 3, ny, 2, 0, Math.PI * 2); ctx.fill();
  }

  if (w.task === 'phone' && w.accessory !== 'headset') {
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.roundRect(nx + headR - 1, ny - 18, 4, 10, 2); ctx.fill();
    const wave = Math.sin(f * 0.15) * 2;
    ctx.strokeStyle = 'rgba(56,189,248,.3)';
    ctx.lineWidth = 1;
    for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.arc(nx + headR + 4, ny - 14, 4 + r * 3 + wave, -0.8, 0.8); ctx.stroke(); }
  }
  if (w.task === 'coffee') {
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath(); ctx.roundRect(nx + bw + 2, ny + 2, 6, 7, 1); ctx.fill();
    ctx.fillStyle = '#5a3018';
    ctx.fillRect(nx + bw + 3, ny + 3, 4, 5);
    ctx.fillStyle = '#c8a060';
    ctx.beginPath(); ctx.arc(nx + bw + 8, ny + 5, 2, 0, Math.PI * 2); ctx.fill();
    for (let s = 0; s < 3; s++) {
      const steamY = ny - 2 - s * 6 - ((f * 0.5 + s * 10) % 18);
      const steamX = nx + bw + 5 + Math.sin(f * 0.04 + s) * 2;
      const steamA = 0.2 - s * 0.06;
      if (steamA > 0) { ctx.fillStyle = `rgba(180,180,200,${steamA})`; ctx.beginPath(); ctx.arc(steamX, steamY, 2.5, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  if (w.task === 'presenting') {
    const armUp = Math.sin(f * 0.05) * 5;
    ctx.fillStyle = w.col;
    ctx.beginPath(); ctx.roundRect(nx + bw - 1, ny - 8 + armUp, 5, 8, 2); ctx.fill();
    ctx.fillStyle = w.skin;
    ctx.beginPath(); ctx.arc(nx + bw + 1.5, ny - 8 + armUp, 3, 0, Math.PI * 2); ctx.fill();
  }
  if (w.task === 'desk' && !moving) {
    const dotPhase = Math.floor(f * 0.05) % 4;
    ctx.fillStyle = 'rgba(56,189,248,.5)';
    for (let d = 0; d < Math.min(dotPhase, 3); d++) ctx.fillRect(nx + bw + 8 + d * 4, ny - 6, 2, 2);
  }
  if (w.task === 'filing' && !moving) {
    ctx.fillStyle = 'rgba(200,180,140,.4)';
    ctx.beginPath(); ctx.roundRect(nx + bw + 2, ny, 7, 10, 1); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(nx + bw + 3, ny + 2, 5, 1);
    ctx.fillRect(nx + bw + 3, ny + 4, 5, 1);
    ctx.fillRect(nx + bw + 3, ny + 6, 5, 1);
  }
  if (w.task === 'meeting' && !moving) {
    ctx.fillStyle = 'rgba(56,100,200,.25)';
    ctx.beginPath(); ctx.roundRect(nx + bw + 2, ny, 6, 8, 1); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(nx + bw + 3, ny + 2, 4, 1);
    ctx.fillRect(nx + bw + 3, ny + 4, 4, 1);
  }

  const icon = TASK_ICONS[w.task];
  const cardW = 180;
  const cardX = nx - cardW / 2;
  const cardY = ny - 85;

  ctx.fillStyle = 'rgba(18,22,30,.92)';
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, 46, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(56,189,248,.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, 46, 6); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(nx - 5, cardY + 46);
  ctx.lineTo(nx, cardY + 52);
  ctx.lineTo(nx + 5, cardY + 46);
  ctx.fillStyle = 'rgba(18,22,30,.92)';
  ctx.fill();

  ctx.font = '12px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(icon, cardX + 6, cardY + 18);

  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = 'bold 11px "Inter","Segoe UI",sans-serif';
  ctx.fillText(w.bot.name.toUpperCase(), cardX + 22, cardY + 16);

  ctx.font = 'bold 8px "Inter","Segoe UI",sans-serif';
  const catText = w.bot.category.toUpperCase();
  const nameW = ctx.measureText(w.bot.name.toUpperCase()).width;
  ctx.font = 'bold 11px "Inter","Segoe UI",sans-serif';
  const nmW = ctx.measureText(w.bot.name.toUpperCase()).width;
  ctx.font = 'bold 8px "Inter","Segoe UI",sans-serif';
  const catMW = ctx.measureText(catText).width + 8;
  const tagX = cardX + 22 + nmW + 6;
  if (tagX + catMW < cardX + cardW - 4) {
    ctx.fillStyle = w.col + '30';
    ctx.beginPath(); ctx.roundRect(tagX, cardY + 7, catMW, 13, 3); ctx.fill();
    ctx.fillStyle = w.col;
    ctx.fillText(catText, tagX + 4, cardY + 16);
  }

  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.font = '10px "Inter","Segoe UI",sans-serif';
  const actLine = w.activityLine || TASK_LABELS[w.task];
  const maxChars = 28;
  ctx.fillText(actLine.length > maxChars ? actLine.slice(0, maxChars - 1) + '…' : actLine, cardX + 8, cardY + 36);

  if (w.task === 'desk' && !moving) {
    const progress = Math.min(1, (w.timer > 0 ? 1 - w.timer / 700 : 1));
    const barW = cardW - 16;
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.beginPath(); ctx.roundRect(cardX + 8, cardY + 40, barW, 3, 1.5); ctx.fill();
    ctx.fillStyle = 'rgba(56,189,248,.4)';
    ctx.beginPath(); ctx.roundRect(cardX + 8, cardY + 40, barW * progress, 3, 1.5); ctx.fill();
  }

  if (w.speech && w.speechT > 0) {
    const alpha = Math.min(1, w.speechT / 40);
    ctx.font = '10px "Inter","Segoe UI",sans-serif';
    const speechW = ctx.measureText(`"${w.speech}"`).width + 20;
    const sbx = nx - speechW / 2, sby = cardY - 26;
    ctx.fillStyle = `rgba(12,16,24,${0.9 * alpha})`;
    ctx.beginPath(); ctx.roundRect(sbx, sby, speechW, 20, 5); ctx.fill();
    ctx.strokeStyle = `rgba(56,189,248,${0.2 * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(sbx, sby, speechW, 20, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx - 4, sby + 20); ctx.lineTo(nx, sby + 24); ctx.lineTo(nx + 4, sby + 20);
    ctx.fillStyle = `rgba(12,16,24,${0.9 * alpha})`; ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.6 * alpha})`;
    ctx.font = `italic 10px "Inter","Segoe UI",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`"${w.speech}"`, nx, sby + 14);
  }
}

function drawJeanClaw(ctx: CanvasRenderingContext2D, f: number) {
  const jcX = 180, jcY = 160;
  const bob = Math.sin(f * 0.025) * 0.8;
  const nx = jcX, ny = Math.round(jcY + bob);

  const glowR = 50 + Math.sin(f * 0.02) * 5;
  const auraGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR);
  auraGrad.addColorStop(0, 'rgba(240,192,64,.08)');
  auraGrad.addColorStop(0.6, 'rgba(240,192,64,.03)');
  auraGrad.addColorStop(1, 'rgba(240,192,64,0)');
  ctx.fillStyle = auraGrad;
  ctx.fillRect(nx - glowR, ny - glowR, glowR * 2, glowR * 2);

  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(nx, ny + 26, 12, 4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#1a1a2a';
  ctx.beginPath(); ctx.roundRect(nx - 6, ny + 14, 5, 12, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(nx + 1, ny + 14, 5, 12, 2); ctx.fill();
  ctx.fillStyle = '#12121a';
  ctx.beginPath(); ctx.roundRect(nx - 7, ny + 25, 6, 4, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(nx + 1, ny + 25, 6, 4, 2); ctx.fill();

  ctx.fillStyle = '#28283a';
  ctx.fillRect(nx - 3, ny + 10, 6, 6);

  ctx.fillStyle = '#2a1a0a';
  ctx.beginPath(); ctx.roundRect(nx - 10, ny - 4, 20, 18, 4); ctx.fill();
  ctx.fillStyle = '#1e140a';
  ctx.beginPath(); ctx.roundRect(nx - 9, ny - 3, 18, 16, 3); ctx.fill();
  ctx.fillStyle = '#2a1a0a';
  ctx.beginPath(); ctx.roundRect(nx - 8, ny - 2, 16, 14, 2); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fillRect(nx - 1, ny - 2, 2, 13);

  ctx.fillStyle = '#e0a830';
  ctx.beginPath();
  ctx.moveTo(nx, ny - 3); ctx.lineTo(nx - 3, ny + 4); ctx.lineTo(nx, ny + 12);
  ctx.lineTo(nx + 3, ny + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c09020';
  ctx.beginPath(); ctx.moveTo(nx - 3, ny - 3); ctx.lineTo(nx + 3, ny - 3);
  ctx.lineTo(nx + 2, ny - 1); ctx.lineTo(nx - 2, ny - 1); ctx.closePath(); ctx.fill();

  const armSwingL = Math.sin(f * 0.015) * 2;
  ctx.fillStyle = '#2a1a0a';
  ctx.beginPath(); ctx.roundRect(nx - 14, ny - 2 + armSwingL, 5, 14, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(nx + 9, ny - 2 - armSwingL, 5, 14, 2); ctx.fill();
  ctx.fillStyle = '#d4a06a';
  ctx.beginPath(); ctx.arc(nx - 11.5, ny + 12 + armSwingL, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 11.5, ny + 12 - armSwingL, 3.5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#e0a870';
  ctx.beginPath(); ctx.arc(nx, ny - 14, 9, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#c89060';
  ctx.beginPath(); ctx.arc(nx, ny - 12, 7, 0, Math.PI, false); ctx.fill();
  ctx.fillStyle = '#e0a870';
  ctx.beginPath(); ctx.arc(nx, ny - 12.5, 6.5, 0, Math.PI, false); ctx.fill();

  ctx.fillStyle = '#f8f8f8';
  ctx.beginPath(); ctx.arc(nx - 3.5, ny - 15, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 3.5, ny - 15, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(nx - 3.5, ny - 15, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 3.5, ny - 15, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(nx - 4, ny - 15.5, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 3, ny - 15.5, 0.6, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(nx - 3.5, ny - 15, 3.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(nx + 3.5, ny - 15, 3.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nx, ny - 15); ctx.lineTo(nx, ny - 15); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nx - 7, ny - 15); ctx.lineTo(nx - 9, ny - 16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nx + 7, ny - 15); ctx.lineTo(nx + 9, ny - 16); ctx.stroke();

  ctx.fillStyle = '#e0a870';
  ctx.beginPath(); ctx.ellipse(nx, ny - 12, 1.2, 0.8, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#3a2010';
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(nx - 5, ny - 10); ctx.quadraticCurveTo(nx - 3, ny - 11.5, nx - 1, ny - 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nx + 1, ny - 10); ctx.quadraticCurveTo(nx + 3, ny - 11.5, nx + 5, ny - 10); ctx.stroke();
  ctx.fillStyle = '#3a2010';
  ctx.beginPath(); ctx.arc(nx - 2, ny - 10.5, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 2, ny - 10.5, 0.8, 0, Math.PI * 2); ctx.fill();

  const smileBob = Math.sin(f * 0.03) * 0.3;
  ctx.strokeStyle = '#8a5a30';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(nx, ny - 9 + smileBob, 2.5, 0.3, Math.PI - 0.3); ctx.stroke();

  ctx.fillStyle = '#1a0a00';
  ctx.beginPath();
  ctx.ellipse(nx, ny - 23, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(nx - 10, ny - 27, 20, 4);
  ctx.beginPath(); ctx.arc(nx, ny - 27, 10, Math.PI, 0); ctx.fill();

  ctx.fillStyle = '#c09020';
  ctx.fillRect(nx - 4, ny - 24, 8, 2);

  const cardW = 180, cardX = nx - cardW / 2, cardY = ny - 95;
  ctx.fillStyle = 'rgba(18,16,10,.92)';
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, 36, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(240,192,64,.2)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, 36, 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nx - 5, cardY + 36); ctx.lineTo(nx, cardY + 41); ctx.lineTo(nx + 5, cardY + 36);
  ctx.fillStyle = 'rgba(18,16,10,.92)'; ctx.fill();

  ctx.fillStyle = '#e0c060';
  ctx.font = 'bold 12px "Inter","Segoe UI",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('JEAN CLAW', nx, cardY + 16);
  ctx.fillStyle = 'rgba(240,192,64,.45)';
  ctx.font = '9px "Inter","Segoe UI",sans-serif';
  ctx.fillText('OFFICE MANAGER', nx, cardY + 28);
}

const OFFICE_INFO = {
  name: 'SALARYMAN HEADQUARTERS',
  address: '1200 Commerce Tower, 48th Floor',
  district: 'Tower Quarter, Minx City',
  rent: '$14,500 / mo',
  purchasePrice: '$2,850,000',
  sqft: '8,640 sq ft',
  capacity: '48 employees',
  floor: 'Level 48',
  lease: 'Month-to-month',
  amenities: ['High-speed fiber', 'Parking garage', 'Loading dock', '24/7 security', 'Server room', 'Training center'],
  status: 'ACTIVE LEASE',
};

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function seededIndex(seed: string, len: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % len;
}

type OfficeTab = 'floor' | 'team' | 'command' | 'info';

export default function TheOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<OfficeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Worker | null>(null);
  const selectedRef = useRef<Worker | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const frameRef = useRef(0);
  const animRef = useRef(0);
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<OfficeTab>('floor');
  const [panelOpen, setPanelOpen] = useState(false);
  const [botControls, setBotControls] = useState<BotControlData[]>([]);

  const [selectedOrgId, setSelectedOrgIdState] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem('office:selectedOrgId');
    return stored ? Number(stored) || null : null;
  });
  const setSelectedOrgId = useCallback((id: number | null) => {
    setSelectedOrgIdState(id);
    if (typeof window !== 'undefined') {
      if (id == null) window.localStorage.removeItem('office:selectedOrgId');
      else window.localStorage.setItem('office:selectedOrgId', String(id));
    }
  }, []);
  const activeOrg = useMemo(() => {
    const orgs = data?.orgs ?? [];
    if (orgs.length === 0) return null;
    return orgs.find(o => o.orgId === selectedOrgId) ?? orgs[0];
  }, [data?.orgs, selectedOrgId]);
  // Auto-correct selection if stored id no longer valid
  useEffect(() => {
    if (!data?.orgs || data.orgs.length === 0) return;
    if (selectedOrgId && !data.orgs.some(o => o.orgId === selectedOrgId)) {
      setSelectedOrgId(data.orgs[0].orgId);
    }
  }, [data?.orgs, selectedOrgId, setSelectedOrgId]);

  const activeOrgId = activeOrg?.orgId ?? null;
  const { data: presence } = usePresence(activeOrgId);
  const onlineUserIds = useMemo(
    () => new Set((presence?.members ?? []).filter(m => m.online).map(m => m.userId)),
    [presence]
  );

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const camRef = useRef({ x: 400, y: 200 });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const canvasSizeRef = useRef({ w: 1200, h: 800 });
  const zoomRef = useRef(1);
  const pinchRef = useRef<number | null>(null);

  const loadBotControls = useCallback(async () => {
    try {
      const res = await apiFetch('/api/bots');
      if (res.ok) { const d = await res.json(); setBotControls(d.bots ?? []); }
    } catch {}
  }, []);

  useEffect(() => {
    loadBotControls();
    apiFetch('/api/world/my-office')
      .then(r => { if (!r.ok) throw new Error('Not authenticated'); return r.json(); })
      .then((d: OfficeData) => {
        if (!d || !d.bots) { setData({ bots: [], orgs: [], isAdmin: false, hasOffice: false }); return; }
        setData(d);
        const desks = getDeskPositions(Math.max(d.bots.length, 1));
        workersRef.current = d.bots.map((bot, i) => {
          const dk = desks[i % desks.length];
          const slug = bot.slug || bot.name;
          return {
            bot, x: dk.x + 45, y: dk.y + 30, tx: dk.x + 45, ty: dk.y + 30,
            task: 'desk' as BotTask, timer: 200 + Math.random() * 300,
            deskX: dk.x, deskY: dk.y,
            phase: Math.random() * Math.PI * 2, wf: 0,
            speech: null, speechT: 0,
            activityLine: pick(TASK_DETAILS['desk']),
            col: CAT_COLORS[bot.category] || '#3aaa7a',
            hair: HAIR_COLORS[seededIndex(slug + 'h', HAIR_COLORS.length)],
            skin: SKIN_TONES[seededIndex(slug + 's', SKIN_TONES.length)],
            facing: 'down' as const,
            hairStyle: HAIR_STYLES[seededIndex(slug + 'hs', HAIR_STYLES.length)],
            shirtPattern: SHIRT_PATTERNS[seededIndex(slug + 'sp', SHIRT_PATTERNS.length)],
            accessory: ACCESSORY_TYPES[seededIndex(slug + 'a', ACCESSORY_TYPES.length)],
            height: 0.9 + (seededIndex(slug + 'ht', 5) / 10),
            bodyWidth: 8 + seededIndex(slug + 'bw', 4),
          };
        });
      })
      .catch(err => console.error('Office load error:', err))
      .finally(() => setLoading(false));
  }, []);

  const getTaskTarget = useCallback((w: Worker): { x: number; y: number } => {
    switch (w.task) {
      case 'coffee': return { x: 130 + Math.random() * 40, y: 700 + Math.random() * 30 };
      case 'copier': return { x: 960 + Math.random() * 20, y: 870 + Math.random() * 20 };
      case 'meeting': return { x: 2100 + Math.random() * 400, y: 140 + Math.random() * 80 };
      case 'presenting': return { x: 2250, y: 160 };
      case 'filing': return { x: 120 + Math.random() * 300, y: 1180 + Math.random() * 100 };
      case 'water': return { x: 260, y: 680 };
      case 'phone': return { x: 2040 + Math.floor(Math.random() * 6) * 100, y: 1720 };
      case 'server': return { x: 2850 + Math.random() * 200, y: 720 + Math.random() * 100 };
      case 'reception': return { x: 1200 + Math.random() * 100, y: 1620 };
      case 'exec': return { x: 2850 + Math.random() * 100, y: 280 };
      case 'lounge': return { x: 150 + Math.random() * 100, y: 1740 + Math.random() * 60 };
      case 'walk': return { x: 200 + Math.random() * 2800, y: 200 + Math.random() * 1600 };
      default: return { x: w.deskX + 45, y: w.deskY + 30 };
    }
  }, []);

  const newTask = useCallback((w: Worker) => {
    const tasks: BotTask[] = ['desk','coffee','phone','copier','filing','meeting','presenting','water','walk','idle','server','reception','exec','lounge'];
    const wts = [30, 8, 10, 4, 4, 10, 5, 4, 6, 4, 3, 4, 4, 4];
    let tot = 0; for (const v of wts) tot += v;
    let roll = Math.random() * tot;
    let t: BotTask = 'desk';
    for (let i = 0; i < tasks.length; i++) { roll -= wts[i]; if (roll <= 0) { t = tasks[i]; break; } }
    w.task = t;
    w.timer = 200 + Math.random() * 500;
    w.activityLine = pick(TASK_DETAILS[t]);
    const lines = TASK_SPEECH[t];
    if (lines && lines.length && Math.random() < 0.6) { w.speech = pick(lines); w.speechT = 350; }
    else { w.speech = null; w.speechT = 0; }
    const target = getTaskTarget(w);
    w.tx = target.x; w.ty = target.y;
  }, [getTaskTarget]);

  useEffect(() => {
    if (activeTab !== 'floor') return;
    const cvs = canvasRef.current;
    if (!cvs || !data) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const updateCanvasSize = () => {
      const container = cvs.parentElement;
      if (container) { canvasSizeRef.current.w = container.clientWidth; canvasSizeRef.current.h = container.clientHeight; }
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    const loop = () => {
      frameRef.current++;
      const f = frameRef.current;
      const ws = workersRef.current;
      const { w: cw, h: ch } = canvasSizeRef.current;
      cvs.width = cw; cvs.height = ch;

      const cam = camRef.current;
      const zoom = zoomRef.current;
      const viewW = cw / zoom, viewH = ch / zoom;
      cam.x = Math.max(0, Math.min(WW - viewW, cam.x));
      cam.y = Math.max(0, Math.min(WH - viewH, cam.y));

      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-cam.x, -cam.y);
      ctx.fillStyle = '#0e1018';
      ctx.fillRect(0, 0, WW, WH);

      for (let i = 1; i < ROOMS.length; i++) drawRoom(ctx, ROOMS[i]);
      drawFurniture(ctx, f);
      drawJeanClaw(ctx, f);

      for (const w of ws) {
        w.timer--;
        if (w.timer <= 0) newTask(w);
        if (w.speechT > 0) w.speechT--;
        if (w.speechT <= 0) w.speech = null;
        const dx = w.tx - w.x, dy = w.ty - w.y, dist = Math.hypot(dx, dy);
        if (dist > 3) {
          w.x += (dx / dist) * 1.2; w.y += (dy / dist) * 1.2; w.wf++;
          w.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        }
        w.phase += 0.04;
        const sel = selectedRef.current;
        drawWorker(ctx, w, f, sel != null && w.bot.slug === sel.bot.slug);
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(56,189,248,.7)';
      ctx.font = 'bold 12px "Inter","Segoe UI",sans-serif';
      ctx.textAlign = 'left';
      const orgName = activeOrg?.orgName ?? 'HEADQUARTERS';
      ctx.fillText(`${orgName.toUpperCase()} — THE OFFICE`, 14, 22);
      ctx.fillStyle = 'rgba(56,189,248,.3)';
      ctx.font = '10px "Inter","Segoe UI",sans-serif';
      ctx.fillText(`${ws.length} employees on floor`, 14, 36);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(56,189,248,.25)';
      const hr = new Date().getHours(), mn = new Date().getMinutes();
      ctx.fillText(`${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')} — ${Math.round(zoom * 100)}% — Pinch/Scroll to zoom`, cw - 14, 22);

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', updateCanvasSize); };
  }, [data, newTask, activeTab]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => { dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }; }, []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    const zoom = zoomRef.current;
    camRef.current.x -= (e.clientX - dragRef.current.lastX) / zoom;
    camRef.current.y -= (e.clientY - dragRef.current.lastY) / zoom;
    dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY;
  }, []);
  const handleMouseUp = useCallback(() => { dragRef.current.dragging = false; }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cvs = canvasRef.current; if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const worldX = camRef.current.x + mx / zoomRef.current;
    const worldY = camRef.current.y + my / zoomRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.35, Math.min(2.5, zoomRef.current * delta));
    zoomRef.current = newZoom;
    camRef.current.x = worldX - mx / newZoom;
    camRef.current.y = worldY - my / newZoom;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = Math.hypot(dx, dy);
      dragRef.current.dragging = false;
    } else if (e.touches.length === 1) {
      pinchRef.current = null;
      const t = e.touches[0];
      dragRef.current = { dragging: true, lastX: t.clientX, lastY: t.clientY };
    }
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchRef.current;
      const newZoom = Math.max(0.35, Math.min(2.5, zoomRef.current * ratio));
      const cvs = canvasRef.current;
      if (cvs) {
        const r = cvs.getBoundingClientRect();
        const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - r.left;
        const midY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - r.top;
        const worldX = camRef.current.x + midX / zoomRef.current;
        const worldY = camRef.current.y + midY / zoomRef.current;
        zoomRef.current = newZoom;
        camRef.current.x = worldX - midX / newZoom;
        camRef.current.y = worldY - midY / newZoom;
      } else {
        zoomRef.current = newZoom;
      }
      pinchRef.current = dist;
      return;
    }
    if (!dragRef.current.dragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    const zoom = zoomRef.current;
    camRef.current.x -= (t.clientX - dragRef.current.lastX) / zoom;
    camRef.current.y -= (t.clientY - dragRef.current.lastY) / zoom;
    dragRef.current.lastX = t.clientX; dragRef.current.lastY = t.clientY;
  }, []);
  const handleTouchEnd = useCallback(() => { dragRef.current.dragging = false; pinchRef.current = null; }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.dragging) return;
    const cvs = canvasRef.current; if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    const zoom = zoomRef.current;
    const mx = (e.clientX - r.left) / zoom + camRef.current.x;
    const my = (e.clientY - r.top) / zoom + camRef.current.y;
    let best: Worker | null = null, bestD = 40 / zoom;
    for (const w of workersRef.current) { const d = Math.hypot(w.x - mx, w.y - my); if (d < bestD) { bestD = d; best = w; } }
    setSelected(best);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e1018] flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-10 h-10 text-sky-400/30 mx-auto mb-3 animate-pulse" />
          <p className="text-sky-300/40 font-sans text-xs tracking-widest">CONNECTING TO OFFICE...</p>
        </div>
      </div>
    );
  }

  if (!data || data.bots.length === 0) {
    const emptyOrg = activeOrg;
    return (
      <div className="min-h-screen bg-[#0e1018] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-sky-400/10 bg-[#12151e]/80">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-sky-400/40" />
            <span className="font-sans text-xs text-sky-300/50 tracking-widest font-medium">
              {emptyOrg ? `${emptyOrg.orgName.toUpperCase()} — OFFICE` : 'THE OFFICE'}
            </span>
            {data && data.orgs.length > 1 && (
              <select
                value={activeOrgId ?? ''}
                onChange={(e) => setSelectedOrgId(Number(e.target.value))}
                className="ml-2 bg-[#0c1018] border border-sky-400/20 text-sky-300/80 text-[10px] font-sans tracking-widest px-2 py-1 rounded outline-none hover:border-sky-400/40 cursor-pointer"
                title="Switch office"
              >
                {data.orgs.map(o => (
                  <option key={o.orgId} value={o.orgId}>{o.orgName.toUpperCase()} — {o.role.toUpperCase()}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3">
            {(['floor', 'team', ...(emptyOrg && MANAGER_ROLES.has(emptyOrg.role) ? ['command'] : []), 'info'] as OfficeTab[]).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`font-sans text-xs px-2 py-1 rounded tracking-widest transition-colors ${activeTab === t ? 'bg-sky-400/15 text-sky-300' : 'text-sky-400/30 hover:text-sky-400/50'}`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'team' && emptyOrg ? (
          <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
            <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-sky-400/40 animate-spin" /></div>}>
              <TeamManagement orgId={emptyOrg.orgId} onlineUserIds={onlineUserIds} />
            </Suspense>
          </div>
        ) : activeTab === 'command' && emptyOrg && MANAGER_ROLES.has(emptyOrg.role) ? (
          <div className="flex-1 overflow-y-auto">
            <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-amber-400/40 animate-spin" /></div>}>
              <BotCommandPanel orgId={emptyOrg.orgId} />
            </Suspense>
          </div>
        ) : activeTab === 'info' ? (
          <OfficeInfoPanel />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <Building2 className="w-14 h-14 text-sky-400/10 mx-auto mb-5" />
              <h2 className="text-sky-300/60 font-sans text-sm mb-2 tracking-widest font-medium">NO OFFICE ESTABLISHED</h2>
              <p className="text-sky-400/30 font-sans text-xs mb-5 leading-relaxed">
                Subscribe to bots from the Bot Factory to staff your office. Each bot becomes a visible worker on the floor.
              </p>
              <div className="flex flex-col gap-2 items-center">
                <button onClick={() => navigate('/bots')}
                  className="px-5 py-2 bg-sky-400/10 border border-sky-400/25 text-sky-300 font-sans text-xs tracking-widest hover:bg-sky-400/15 transition-colors rounded">
                  VISIT BOT FACTORY
                </button>
                {emptyOrg && (
                  <button onClick={() => setActiveTab('team')}
                    className="px-5 py-1.5 text-sky-400/30 font-sans text-xs tracking-widest hover:text-sky-400/50 transition-colors">
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

  const primaryOrg = activeOrg;

  return (
    <div className="h-screen bg-[#0e1018] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-emerald-400/10 bg-[#12151e]/80 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <Building2 className="w-4 h-4 text-emerald-400/40" />
          <span className="font-sans text-xs text-emerald-300/50 tracking-widest font-medium">
            {primaryOrg ? `${primaryOrg.orgName.toUpperCase()} — OFFICE` : 'THE OFFICE'}
          </span>
          {data.orgs.length > 1 ? (
            <select
              value={activeOrgId ?? ''}
              onChange={(e) => setSelectedOrgId(Number(e.target.value))}
              className="bg-[#0c1018] border border-emerald-400/20 text-emerald-300/80 text-[10px] font-sans tracking-widest px-2 py-1 rounded outline-none hover:border-emerald-400/40 cursor-pointer"
              title="Switch office"
            >
              {data.orgs.map(o => (
                <option key={o.orgId} value={o.orgId}>{o.orgName.toUpperCase()} — {o.role.toUpperCase()}</option>
              ))}
            </select>
          ) : primaryOrg && (
            <span className="font-sans text-[10px] text-sky-400/60 tracking-widest uppercase px-1.5 py-0.5 border border-sky-400/20 rounded bg-sky-400/5">
              {primaryOrg.role}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(['floor', 'team', ...(primaryOrg && MANAGER_ROLES.has(primaryOrg.role) ? ['command'] : []), 'info'] as OfficeTab[]).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1 font-sans text-xs px-2 py-1 rounded tracking-widest transition-colors ${activeTab === t ? 'bg-emerald-400/15 text-emerald-300' : 'text-emerald-400/30 hover:text-emerald-400/50'}`}>
              {t === 'floor' && <Cctv className="w-3.5 h-3.5" />}
              {t === 'team' && <UserCog className="w-3.5 h-3.5" />}
              {t === 'command' && <Megaphone className="w-3.5 h-3.5" />}
              {t === 'info' && <Info className="w-3.5 h-3.5" />}
              <span>{t.toUpperCase()}</span>
            </button>
          ))}
          <div className="flex items-center gap-1 text-emerald-400/25 font-sans text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{data.bots.length}</span>
          </div>
          {activeTab === 'floor' && (
            <button onClick={() => setPanelOpen(!panelOpen)} className="text-emerald-400/30 hover:text-emerald-400/50 transition-colors p-1">
              {panelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'team' && primaryOrg ? (
        <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
          <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-sky-400/40 animate-spin" /></div>}>
            <TeamManagement orgId={primaryOrg.orgId} onlineUserIds={onlineUserIds} />
          </Suspense>
        </div>
      ) : activeTab === 'command' && primaryOrg && MANAGER_ROLES.has(primaryOrg.role) ? (
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-amber-400/40 animate-spin" /></div>}>
            <BotCommandPanel orgId={primaryOrg.orgId} />
          </Suspense>
        </div>
      ) : activeTab === 'team' && !primaryOrg ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Building2 className="w-8 h-8 text-sky-400/15 mx-auto mb-3" />
            <p className="font-sans text-xs text-sky-400/30 mb-1">NO ORGANIZATION</p>
            <p className="font-sans text-xs text-sky-400/20">Create or join an organization in the World to manage your team.</p>
          </div>
        </div>
      ) : activeTab === 'info' ? (
        <OfficeInfoPanel />
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 relative">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              onClick={handleClick}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
              style={{ imageRendering: 'auto', touchAction: 'none' }}
            />
          </div>

          {panelOpen && (
            <ActivityFeed
              bots={data.bots}
              workersRef={workersRef}
              selected={selected}
              botControls={botControls}
              onSelect={(w) => {
                setSelected(w);
                if (w) { const z = zoomRef.current; camRef.current.x = w.x - canvasSizeRef.current.w / (2 * z); camRef.current.y = w.y - canvasSizeRef.current.h / (2 * z); }
              }}
              onClose={() => setPanelOpen(false)}
              onToggleBot={async (bc) => {
                const newStatus = bc.status === 'active' ? 'paused' : 'active';
                try {
                  const res = await apiFetch(`/api/bots/${bc.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
                  if (res.ok) loadBotControls();
                } catch {}
              }}
              onNavigateBot={(bc) => navigate(`/bots?bot=${bc.id}`)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ActivityFeed({ bots, workersRef, selected, botControls, onSelect, onClose, onToggleBot, onNavigateBot }: {
  bots: OfficeBotWorker[];
  workersRef: React.RefObject<Worker[]>;
  selected: Worker | null;
  botControls: BotControlData[];
  onSelect: (w: Worker | null) => void;
  onClose: () => void;
  onToggleBot: (bc: BotControlData) => void;
  onNavigateBot: (bc: BotControlData) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);
  const workers = workersRef.current ?? [];

  const findBotControl = (botName: string): BotControlData | null => {
    return botControls.find(bc => bc.name.toLowerCase() === botName.toLowerCase()) ?? null;
  };

  return (
    <div className="w-64 md:w-72 border-l border-emerald-400/8 overflow-y-auto bg-[#12151e]/95 backdrop-blur-sm shrink-0 flex flex-col absolute right-0 top-0 bottom-0 z-20 md:relative">
      <div className="px-3 py-2 border-b border-emerald-400/8 shrink-0 flex items-center justify-between">
        <div>
          <h3 className="font-sans text-xs text-emerald-300/40 tracking-widest font-medium">ACTIVITY FEED</h3>
          <p className="font-sans text-xs text-emerald-400/20 mt-0.5">{workers.length} active</p>
        </div>
        <button onClick={onClose} className="text-emerald-400/25 hover:text-emerald-400/40 p-1 md:hidden">
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {bots.map((bot, i) => {
          const w = workers[i]; if (!w) return null;
          const isSel = selected?.bot.slug === bot.slug;
          const cc = CAT_COLORS[bot.category] || '#3aaa7a';
          const icon = TASK_ICONS[w.task];
          const bc = isSel ? findBotControl(bot.name) : null;
          return (
            <div key={bot.slug} onClick={() => onSelect(isSel ? null : w)}
              className={`px-3 py-2.5 border-b border-emerald-400/4 cursor-pointer transition-all ${isSel ? 'bg-emerald-400/8 border-l-2 border-l-emerald-400' : 'hover:bg-emerald-400/5'}`}>
              <div className="flex items-start gap-2">
                <span className="text-sm mt-0.5 shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-sans text-xs text-sky-100/80 font-semibold truncate">{bot.name.toUpperCase()}</span>
                    <span className="font-sans text-[8px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: cc + '20', color: cc }}>{bot.category.toUpperCase()}</span>
                  </div>
                  <div className="font-sans text-xs text-sky-200/50 mt-0.5 font-medium">{TASK_LABELS[w.task]}</div>
                  <div className="font-sans text-xs text-sky-300/35 mt-0.5 leading-relaxed">{w.activityLine}</div>
                  {w.speech && w.speechT > 0 && <div className="font-sans text-xs text-sky-200/40 mt-1 italic">&ldquo;{w.speech}&rdquo;</div>}
                </div>
              </div>
              {isSel && (
                <div className="mt-2 pt-2 border-t border-emerald-400/10 space-y-2">
                  <p className="font-sans text-xs text-sky-300/30 italic">{bot.tagline}</p>

                  {bc ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${bc.status === 'active' ? 'bg-emerald-400' : bc.status === 'paused' ? 'bg-amber-400' : 'bg-red-400'}`} />
                        <span className="font-sans text-xs text-sky-200/50 font-medium">{bc.status.toUpperCase()}</span>
                        {bc.connections.length > 0 && (
                          <span className="font-sans text-xs text-sky-400/30 flex items-center gap-1">
                            <Plug className="w-3 h-3" /> {bc.connections.length}
                          </span>
                        )}
                        {bc.permissions.length > 0 && (
                          <span className="font-sans text-xs text-sky-400/30 flex items-center gap-1">
                            <Zap className="w-3 h-3" /> {bc.permissions.length}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleBot(bc); }}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-sans font-medium transition-colors ${
                            bc.status === 'active'
                              ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 border border-amber-400/20'
                              : 'bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20 border border-emerald-400/20'
                          }`}
                        >
                          {bc.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          {bc.status === 'active' ? 'PAUSE' : 'ACTIVATE'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateBot(bc); }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-sans font-medium bg-sky-400/10 text-sky-300 hover:bg-sky-400/20 border border-sky-400/20 transition-colors"
                        >
                          <Settings className="w-3 h-3" />
                          MANAGE
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-sans text-xs text-sky-400/25">LOC: <span className="text-sky-200/40 font-medium">{Math.round(w.x)}, {Math.round(w.y)}</span></span>
                      <span className="font-sans text-xs"><span className="text-emerald-400/60">●</span> ACTIVE</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OfficeInfoPanel() {
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      <div className="space-y-6">
        <div className="bg-[#12151e]/80 rounded-lg border border-sky-400/10 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-sans text-lg text-sky-100/80 font-semibold tracking-wide">{OFFICE_INFO.name}</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-sky-400/40" />
                <span className="font-sans text-xs text-sky-300/50">{OFFICE_INFO.address}</span>
              </div>
              <span className="font-sans text-xs text-sky-400/30 tracking-wider">{OFFICE_INFO.district}</span>
            </div>
            <span className="px-3 py-1 bg-emerald-500/15 text-emerald-400 font-sans text-xs font-medium rounded tracking-wider">{OFFICE_INFO.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <InfoField icon={<DollarSign className="w-4 h-4" />} label="MONTHLY RENT" value={OFFICE_INFO.rent} />
            <InfoField icon={<DollarSign className="w-4 h-4" />} label="PURCHASE PRICE" value={OFFICE_INFO.purchasePrice} />
            <InfoField icon={<Maximize2 className="w-4 h-4" />} label="TOTAL AREA" value={OFFICE_INFO.sqft} />
            <InfoField icon={<Users className="w-4 h-4" />} label="CAPACITY" value={OFFICE_INFO.capacity} />
            <InfoField icon={<Building2 className="w-4 h-4" />} label="FLOOR" value={OFFICE_INFO.floor} />
            <InfoField icon={<Eye className="w-4 h-4" />} label="LEASE TYPE" value={OFFICE_INFO.lease} />
          </div>
        </div>
        <div className="bg-[#12151e]/80 rounded-lg border border-sky-400/10 p-6">
          <h3 className="font-sans text-sm text-sky-100/60 font-semibold tracking-wider mb-3">AMENITIES</h3>
          <div className="grid grid-cols-2 gap-2">
            {OFFICE_INFO.amenities.map(a => (
              <div key={a} className="flex items-center gap-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/50" />
                <span className="font-sans text-xs text-sky-200/50">{a}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#12151e]/80 rounded-lg border border-sky-400/10 p-6">
          <h3 className="font-sans text-sm text-sky-100/60 font-semibold tracking-wider mb-3">FLOOR PLAN</h3>
          <div className="grid grid-cols-3 gap-2 text-xs font-sans">
            {ROOMS.filter(r => r.label).map(r => (
              <div key={r.label} className="px-2 py-1.5 bg-sky-400/5 rounded border border-sky-400/8">
                <span className="text-sky-300/40 tracking-wider">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-sky-400/5 rounded-lg">
      <div className="text-sky-400/30 mt-0.5">{icon}</div>
      <div>
        <span className="font-sans text-xs text-sky-400/30 tracking-widest block">{label}</span>
        <span className="font-sans text-sm text-sky-100/60 font-medium">{value}</span>
      </div>
    </div>
  );
}
