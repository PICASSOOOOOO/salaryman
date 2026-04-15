import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Building2, Users, Eye, Cctv, UserCog, Loader2, MapPin, DollarSign, Maximize2, Info } from 'lucide-react';
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

const HAIR = ['#1a1a1a','#3a2010','#6a4a2a','#8B4513','#2a1508','#4a3a2a','#c0903a','#884422'];
const SKIN = ['#e8c4a0','#d4a878','#c4956a','#a07848','#7a5a3a','#f0d4b8'];

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
  coffee: [
    'Brewing a fresh pot — dark roast',
    'Refilling the mug for round three',
    'Waiting for the espresso machine',
    'Adding cream, debating sugar',
  ],
  phone: [
    'Confirming appointment with client',
    'Following up on invoice #4782',
    'Transferring call to sales team',
    'Discussing contract amendments',
    'Walking through pricing options',
    'Scheduling a product demo',
  ],
  meeting: [
    'Reviewing quarterly targets with team',
    'Brainstorming campaign concepts',
    'Going through the sprint backlog',
    'Presenting client feedback analysis',
    'Discussing hiring plan for next month',
    'Aligning on product roadmap priorities',
  ],
  presenting: [
    'Showing revenue data on projector',
    'Walking through competitive analysis',
    'Demonstrating new feature prototype',
    'Presenting monthly KPI dashboard',
  ],
  copier: [
    'Printing 30 copies of the proposal',
    'Scanning signed contracts to PDF',
    'Collating materials for client deck',
    'Fixing paper jam — tray 2 again',
  ],
  filing: [
    'Organizing invoices by date',
    'Archiving completed project files',
    'Pulling records for compliance audit',
    'Labeling folders for new accounts',
  ],
  water: [
    'Quick hydration break',
    'Chatting about the weekend',
    'Refilling the water bottle',
  ],
  walk: [
    'Heading to the next meeting',
    'Walking to check on a colleague',
    'Moving between departments',
  ],
  idle: [
    'Waiting for next assignment',
    'Reviewing task queue',
    'Standing by for instructions',
  ],
  server: [
    'Checking server rack temperatures',
    'Applying security patch to Node 3',
    'Reviewing system uptime logs',
    'Rebooting secondary DNS server',
  ],
  reception: [
    'Greeting a walk-in visitor',
    'Issuing temporary access badge',
    'Directing delivery to loading dock',
    'Answering the front desk phone',
  ],
  exec: [
    'Reviewing board meeting agenda',
    'Signing off on budget proposal',
    'Reviewing executive summary',
    'Approving vendor contract',
  ],
  lounge: [
    'Taking a quick break on the couch',
    'Scrolling through news on phone',
    'Resting before afternoon meetings',
    'Catching up with a coworker',
  ],
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
  { x: 0, y: 0, w: 3600, h: 2400, label: '', floorColor: '#e8e0d4', wallColor: '#8a8078', doors: [] },

  { x: 40, y: 40, w: 600, h: 500, label: 'JEAN CLAW — OFFICE MANAGER', floorColor: '#d8cfc0', wallColor: '#6a6258',
    doors: [{ side: 'right', pos: 200, width: 80 }] },

  { x: 40, y: 600, w: 600, h: 420, label: 'KITCHEN & BREAK ROOM', floorColor: '#e0d8cc', wallColor: '#7a7268',
    doors: [{ side: 'right', pos: 150, width: 90 }] },

  { x: 40, y: 1080, w: 600, h: 500, label: 'STORAGE & FILES', floorColor: '#d4cec4', wallColor: '#7a7268',
    doors: [{ side: 'right', pos: 200, width: 80 }] },

  { x: 700, y: 40, w: 1200, h: 700, label: 'OPEN OFFICE — WORKSTATIONS', floorColor: '#ece6da', wallColor: '#8a8078',
    doors: [{ side: 'bottom', pos: 500, width: 120 }] },

  { x: 1960, y: 40, w: 700, h: 500, label: 'CONFERENCE ROOM A', floorColor: '#e0dcd4', wallColor: '#7090a0',
    doors: [{ side: 'bottom', pos: 300, width: 80 }], isGlass: true },

  { x: 2720, y: 40, w: 840, h: 500, label: 'EXECUTIVE SUITE', floorColor: '#d4c8b4', wallColor: '#6a5a48',
    doors: [{ side: 'left', pos: 200, width: 80 }] },

  { x: 1960, y: 600, w: 700, h: 420, label: 'CONFERENCE ROOM B', floorColor: '#e0dcd4', wallColor: '#7090a0',
    doors: [{ side: 'left', pos: 180, width: 80 }], isGlass: true },

  { x: 2720, y: 600, w: 840, h: 420, label: 'SERVER ROOM', floorColor: '#c8d0d8', wallColor: '#506068',
    doors: [{ side: 'left', pos: 180, width: 70 }] },

  { x: 700, y: 800, w: 1200, h: 600, label: 'OPEN OFFICE — WORKSTATIONS B', floorColor: '#ece6da', wallColor: '#8a8078',
    doors: [{ side: 'top', pos: 500, width: 120 }, { side: 'bottom', pos: 500, width: 120 }] },

  { x: 40, y: 1640, w: 600, h: 380, label: 'LOUNGE', floorColor: '#dcd4c8', wallColor: '#7a7268',
    doors: [{ side: 'right', pos: 150, width: 90 }] },

  { x: 700, y: 1460, w: 1200, h: 460, label: 'RECEPTION & LOBBY', floorColor: '#f0e8dc', wallColor: '#8a8078',
    doors: [{ side: 'bottom', pos: 500, width: 160 }] },

  { x: 1960, y: 1080, w: 1600, h: 500, label: 'TRAINING CENTER', floorColor: '#e4dcd0', wallColor: '#7a7268',
    doors: [{ side: 'left', pos: 200, width: 90 }] },

  { x: 1960, y: 1640, w: 800, h: 380, label: 'PHONE BANK', floorColor: '#dcd8d0', wallColor: '#7a7268',
    doors: [{ side: 'left', pos: 150, width: 80 }] },

  { x: 2820, y: 1640, w: 740, h: 380, label: 'SUPPLY CLOSET', floorColor: '#d4cec4', wallColor: '#7a7268',
    doors: [{ side: 'left', pos: 150, width: 70 }] },

  { x: 40, y: 2080, w: 1860, h: 280, label: 'PARKING GARAGE — LEVEL P1', floorColor: '#c0bab0', wallColor: '#6a6258',
    doors: [{ side: 'top', pos: 400, width: 200 }] },

  { x: 1960, y: 2080, w: 1600, h: 280, label: 'LOADING DOCK', floorColor: '#b8b4aa', wallColor: '#6a6258',
    doors: [{ side: 'top', pos: 600, width: 180 }] },
];

function drawRoom(ctx: CanvasRenderingContext2D, room: Room, f: number) {
  ctx.fillStyle = room.floorColor;
  ctx.fillRect(room.x, room.y, room.w, room.h);

  if (room.label === '') return;

  const tileSize = 40;
  ctx.strokeStyle = 'rgba(0,0,0,.04)';
  ctx.lineWidth = 0.5;
  for (let tx = room.x; tx < room.x + room.w; tx += tileSize) {
    ctx.beginPath(); ctx.moveTo(tx, room.y); ctx.lineTo(tx, room.y + room.h); ctx.stroke();
  }
  for (let ty = room.y; ty < room.y + room.h; ty += tileSize) {
    ctx.beginPath(); ctx.moveTo(room.x, ty); ctx.lineTo(room.x + room.w, ty); ctx.stroke();
  }

  const wallAlpha = room.isGlass ? 0.35 : 1;
  const wc = room.wallColor;

  const drawWallSegments = (x1: number, y1: number, x2: number, y2: number, side: 'top'|'bottom'|'left'|'right') => {
    const sideDoors = room.doors.filter(d => d.side === side);
    if (sideDoors.length === 0) {
      ctx.fillStyle = side === 'top' || side === 'bottom'
        ? `rgba(${hexToRgb(wc)},${wallAlpha})`
        : `rgba(${hexToRgb(wc)},${wallAlpha * 0.85})`;
      if (side === 'top' || side === 'bottom') {
        ctx.fillRect(x1, y1, x2 - x1, WALL);
      } else {
        ctx.fillRect(x1, y1, WALL, y2 - y1);
      }
      ctx.strokeStyle = `rgba(0,0,0,.15)`;
      ctx.lineWidth = 1;
      if (side === 'top' || side === 'bottom') {
        ctx.strokeRect(x1, y1, x2 - x1, WALL);
      } else {
        ctx.strokeRect(x1, y1, WALL, y2 - y1);
      }
      return;
    }

    for (const door of sideDoors) {
      const fillCol = side === 'top' || side === 'bottom'
        ? `rgba(${hexToRgb(wc)},${wallAlpha})`
        : `rgba(${hexToRgb(wc)},${wallAlpha * 0.85})`;
      ctx.fillStyle = fillCol;
      ctx.strokeStyle = 'rgba(0,0,0,.15)';
      ctx.lineWidth = 1;

      if (side === 'top' || side === 'bottom') {
        const doorStart = room.x + door.pos;
        const doorEnd = doorStart + door.width;
        if (doorStart > x1) { ctx.fillRect(x1, y1, doorStart - x1, WALL); ctx.strokeRect(x1, y1, doorStart - x1, WALL); }
        if (doorEnd < x2) { ctx.fillRect(doorEnd, y1, x2 - doorEnd, WALL); ctx.strokeRect(doorEnd, y1, x2 - doorEnd, WALL); }

        ctx.fillStyle = room.floorColor;
        ctx.fillRect(doorStart, y1, door.width, WALL);
        ctx.strokeStyle = 'rgba(139,115,85,.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(doorStart, y1); ctx.lineTo(doorStart, y1 + WALL); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(doorEnd, y1); ctx.lineTo(doorEnd, y1 + WALL); ctx.stroke();
      } else {
        const doorStart = room.y + door.pos;
        const doorEnd = doorStart + door.width;
        if (doorStart > y1) { ctx.fillRect(x1, y1, WALL, doorStart - y1); ctx.strokeRect(x1, y1, WALL, doorStart - y1); }
        if (doorEnd < y2) { ctx.fillRect(x1, doorEnd, WALL, y2 - doorEnd); ctx.strokeRect(x1, doorEnd, WALL, y2 - doorEnd); }

        ctx.fillStyle = room.floorColor;
        ctx.fillRect(x1, doorStart, WALL, door.width);
        ctx.strokeStyle = 'rgba(139,115,85,.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, doorStart); ctx.lineTo(x1 + WALL, doorStart); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, doorEnd); ctx.lineTo(x1 + WALL, doorEnd); ctx.stroke();
      }
    }
  };

  drawWallSegments(room.x, room.y, room.x + room.w, room.y, 'top');
  drawWallSegments(room.x, room.y + room.h - WALL, room.x + room.w, room.y + room.h, 'bottom');
  drawWallSegments(room.x, room.y, room.x, room.y + room.h, 'left');
  drawWallSegments(room.x + room.w - WALL, room.y, room.x + room.w, room.y + room.h, 'right');

  if (room.isGlass) {
    ctx.strokeStyle = 'rgba(100,160,200,.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(room.x + 2, room.y + 2, room.w - 4, room.h - 4);
    ctx.setLineDash([]);
  }

  ctx.fillStyle = 'rgba(80,70,60,.5)';
  ctx.font = 'bold 14px "Inter","Segoe UI",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(room.label, room.x + 20, room.y + 30);
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, f: number) {
  ctx.fillStyle = '#8a7a64';
  ctx.fillRect(x, y, 90, 50);
  ctx.strokeStyle = 'rgba(0,0,0,.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 90, 50);

  ctx.fillStyle = '#70624e';
  ctx.fillRect(x + 2, y + 2, 86, 46);
  ctx.fillStyle = '#8a7a64';
  ctx.fillRect(x + 4, y + 4, 82, 42);

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 10, y + 5, 45, 30);
  ctx.fillStyle = '#1a3048';
  ctx.fillRect(x + 12, y + 7, 41, 24);
  const screenGlow = 0.7 + Math.sin(f * 0.03) * 0.1;
  ctx.fillStyle = `rgba(180,210,240,${screenGlow * 0.15})`;
  ctx.fillRect(x + 12, y + 7, 41, 24);

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 30, y + 35, 5, 6);
  ctx.fillRect(x + 25, y + 41, 15, 3);

  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + 62, y + 28, 22, 12);
  ctx.fillStyle = '#444';
  for (let kx = 0; kx < 5; kx++) for (let ky = 0; ky < 3; ky++) {
    ctx.fillRect(x + 64 + kx * 4, y + 30 + ky * 3, 2, 1.5);
  }

  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + 63, y + 15, 10, 8);
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath(); ctx.arc(x + 12, y + 20, 10, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 6, y + 12, 12, 4);

  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(x + 12, y + 20, 3, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.fillStyle = '#444';
    ctx.fillRect(x + 12 + Math.cos(a) * 8 - 1, y + 20 + Math.sin(a) * 8 - 1, 3, 3);
  }
}

function drawConfTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#6a5840';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.stroke();

  ctx.fillStyle = '#5a4830';
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 8);
  ctx.fill();
  ctx.fillStyle = '#6a5840';
  ctx.beginPath();
  ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 6);
  ctx.fill();
}

function drawConfChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#444';
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
}

function drawServerRack(ctx: CanvasRenderingContext2D, x: number, y: number, f: number) {
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(x, y, 40, 80);
  ctx.strokeStyle = '#1a1e22';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 40, 80);

  for (let row = 0; row < 6; row++) {
    ctx.fillStyle = '#222428';
    ctx.fillRect(x + 4, y + 6 + row * 12, 32, 9);

    const glow = Math.sin(f * 0.06 + row * 1.2) > 0;
    ctx.fillStyle = glow ? '#40d060' : '#204020';
    ctx.fillRect(x + 8, y + 9 + row * 12, 3, 3);
    ctx.fillStyle = (f + row * 50) % 120 < 60 ? '#d0a020' : '#403008';
    ctx.fillRect(x + 14, y + 9 + row * 12, 3, 3);

    ctx.fillStyle = 'rgba(100,140,180,.15)';
    for (let v = 0; v < 4; v++) {
      ctx.fillRect(x + 22 + v * 4, y + 8 + row * 12, 2, 5);
    }
  }
}

function drawFileCabinet(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#8a8a88';
  ctx.fillRect(x, y, 30, 60);
  ctx.strokeStyle = 'rgba(0,0,0,.2)';
  ctx.strokeRect(x, y, 30, 60);

  for (let d = 0; d < 3; d++) {
    ctx.fillStyle = '#7a7a78';
    ctx.fillRect(x + 3, y + 4 + d * 19, 24, 16);
    ctx.strokeStyle = 'rgba(0,0,0,.15)';
    ctx.strokeRect(x + 3, y + 4 + d * 19, 24, 16);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(x + 12, y + 10 + d * 19, 6, 3);
  }
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number, f: number) {
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y, 35, 45);
  ctx.fillStyle = '#555';
  ctx.fillRect(x + 3, y + 3, 29, 20);
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 8, y + 26, 18, 14);

  ctx.fillStyle = '#6a3a18';
  ctx.fillRect(x + 12, y + 30, 10, 8);

  if (f % 80 < 40) {
    ctx.fillStyle = 'rgba(200,200,200,.2)';
    ctx.fillRect(x + 14, y + 22, 6, 6);
  }

  ctx.fillStyle = '#c04020';
  ctx.beginPath(); ctx.arc(x + 28, y + 8, 3, 0, Math.PI * 2); ctx.fill();
}

function drawCouch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = '#5a4a6a';
  ctx.beginPath(); ctx.roundRect(x, y, w, 40, 6); ctx.fill();
  ctx.fillStyle = '#6a5a7a';
  ctx.beginPath(); ctx.roundRect(x + 4, y + 4, w - 8, 32, 4); ctx.fill();

  ctx.fillStyle = '#4a3a5a';
  ctx.fillRect(x, y, 20, 40);
  ctx.fillRect(x + w - 20, y, 20, 40);
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(x - size * 0.3, y, size * 0.6, size * 0.5);

  ctx.fillStyle = '#3a7a3a';
  ctx.beginPath(); ctx.arc(x, y - size * 0.2, size * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a8a4a';
  ctx.beginPath(); ctx.arc(x - size * 0.15, y - size * 0.35, size * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + size * 0.2, y - size * 0.3, size * 0.25, 0, Math.PI * 2); ctx.fill();
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(40,80,200,.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 15, y + 15); ctx.lineTo(x + w * 0.6, y + 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 15, y + 30); ctx.lineTo(x + w * 0.5, y + 35); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,50,50,.12)';
  ctx.beginPath(); ctx.moveTo(x + w * 0.6, y + 10); ctx.lineTo(x + w * 0.8, y + h * 0.6); ctx.stroke();

  ctx.fillStyle = '#666';
  ctx.fillRect(x + 10, y + h + 2, w - 20, 4);
}

function drawReceptionDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#6a5a48';
  ctx.beginPath(); ctx.roundRect(x, y, 200, 60, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.roundRect(x, y, 200, 60, 8); ctx.stroke();

  ctx.fillStyle = '#5a4a38';
  ctx.fillRect(x + 10, y + 5, 180, 50);
  ctx.fillStyle = '#6a5a48';
  ctx.fillRect(x + 15, y + 8, 170, 44);

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 20, y + 12, 55, 32);
  ctx.fillStyle = '#1a3048';
  ctx.fillRect(x + 22, y + 14, 51, 26);

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 140, y + 12, 40, 32);
  ctx.fillStyle = '#1a3048';
  ctx.fillRect(x + 142, y + 14, 36, 26);
}

function drawCeilingLight(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 80);
  grad.addColorStop(0, 'rgba(255,248,230,.08)');
  grad.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 80, y - 80, 160, 160);

  ctx.fillStyle = 'rgba(200,195,180,.25)';
  ctx.fillRect(x - 15, y - 2, 30, 4);
}

function drawPhoneBooth(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#7a7068';
  ctx.fillRect(x, y, 50, 50);
  ctx.strokeStyle = 'rgba(0,0,0,.2)';
  ctx.strokeRect(x, y, 50, 50);

  ctx.fillStyle = '#e0d8cc';
  ctx.fillRect(x + 5, y + 5, 40, 40);

  ctx.fillStyle = '#8a7a68';
  ctx.fillRect(x + 10, y + 8, 30, 20);

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x + 15, y + 10, 18, 12);
  ctx.fillStyle = '#1a3048';
  ctx.fillRect(x + 16, y + 11, 16, 10);

  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + 15, y + 30, 18, 8);
}

function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#ccc';
  ctx.fillRect(x, y + 15, 20, 25);
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.strokeRect(x, y + 15, 20, 25);

  ctx.fillStyle = 'rgba(100,160,220,.3)';
  ctx.beginPath(); ctx.arc(x + 10, y + 8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,140,200,.3)';
  ctx.beginPath(); ctx.arc(x + 10, y + 8, 8, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = '#4080c0';
  ctx.fillRect(x + 6, y + 28, 3, 5);
  ctx.fillStyle = '#c04040';
  ctx.fillRect(x + 11, y + 28, 3, 5);
}

function drawPrinter(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(x, y, 50, 35);
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.strokeRect(x, y, 50, 35);

  ctx.fillStyle = '#ddd8d0';
  ctx.fillRect(x + 5, y - 5, 40, 8);

  ctx.fillStyle = '#bbb8b0';
  ctx.fillRect(x + 5, y + 30, 40, 8);

  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(x + 8, y + 8, 20, 10);
  ctx.fillStyle = '#3a5a4a';
  ctx.fillRect(x + 9, y + 9, 18, 8);

  ctx.fillStyle = '#666';
  ctx.beginPath(); ctx.arc(x + 40, y + 12, 3, 0, Math.PI * 2); ctx.fill();
}

function drawFurniture(ctx: CanvasRenderingContext2D, f: number) {
  const deskPositions = getDeskPositions(24);
  for (const dp of deskPositions) {
    drawDesk(ctx, dp.x, dp.y, f);
    drawChair(ctx, dp.x + 30, dp.y + 52);
  }

  drawConfTable(ctx, 2060, 120, 500, 120);
  const confChairPositions = [
    { x: 2110, y: 100 }, { x: 2210, y: 100 }, { x: 2310, y: 100 }, { x: 2410, y: 100 },
    { x: 2110, y: 260 }, { x: 2210, y: 260 }, { x: 2310, y: 260 }, { x: 2410, y: 260 },
  ];
  for (const cp of confChairPositions) drawConfChair(ctx, cp.x, cp.y);

  drawConfTable(ctx, 2060, 680, 400, 100);
  for (const cp of [{ x: 2110, y: 660 }, { x: 2210, y: 660 }, { x: 2310, y: 660 },
                     { x: 2110, y: 800 }, { x: 2210, y: 800 }, { x: 2310, y: 800 }]) {
    drawConfChair(ctx, cp.x, cp.y);
  }

  drawDesk(ctx, 120, 120, f);
  drawChair(ctx, 150, 175);
  drawDesk(ctx, 350, 120, f);
  drawChair(ctx, 380, 175);
  drawFileCabinet(ctx, 120, 300);
  drawFileCabinet(ctx, 160, 300);
  drawPlant(ctx, 560, 100, 18);
  drawWhiteboard(ctx, 100, 380, 200, 80);

  drawCoffeeMachine(ctx, 100, 660, f);
  drawCoffeeMachine(ctx, 160, 660, f);
  drawWaterCooler(ctx, 250, 660);
  ctx.fillStyle = '#8a7a64';
  ctx.fillRect(100, 740, 120, 50);
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.strokeRect(100, 740, 120, 50);
  drawPlant(ctx, 500, 700, 14);

  for (let fc = 0; fc < 8; fc++) {
    drawFileCabinet(ctx, 80 + fc * 50, 1140);
  }
  for (let fc = 0; fc < 8; fc++) {
    drawFileCabinet(ctx, 80 + fc * 50, 1300);
  }
  ctx.fillStyle = '#7a7068';
  ctx.fillRect(80, 1220, 400, 60);

  for (let sr = 0; sr < 8; sr++) {
    drawServerRack(ctx, 2780 + (sr % 4) * 60, 660 + Math.floor(sr / 4) * 100, f);
  }
  for (let sr = 0; sr < 4; sr++) {
    drawServerRack(ctx, 3200 + sr * 60, 660, f);
  }

  drawWhiteboard(ctx, 2780, 100, 250, 80);
  drawDesk(ctx, 2800, 250, f);
  drawChair(ctx, 2830, 305);
  drawDesk(ctx, 3000, 250, f);
  drawChair(ctx, 3030, 305);
  drawFileCabinet(ctx, 3400, 100);
  drawPlant(ctx, 3480, 100, 20);
  drawCouch(ctx, 2800, 400, 160);

  drawCouch(ctx, 100, 1700, 180);
  drawCouch(ctx, 100, 1800, 180);
  ctx.fillStyle = '#6a5a48';
  ctx.fillRect(340, 1720, 80, 80);
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.strokeRect(340, 1720, 80, 80);
  drawPlant(ctx, 540, 1700, 16);
  drawPlant(ctx, 540, 1850, 16);

  drawReceptionDesk(ctx, 1100, 1600);
  drawPlant(ctx, 1080, 1600, 18);
  drawPlant(ctx, 1320, 1600, 18);
  drawCouch(ctx, 900, 1750, 140);
  drawCouch(ctx, 1300, 1750, 140);

  for (let i = 0; i < 6; i++) {
    drawDesk(ctx, 2020 + (i % 3) * 200, 1140 + Math.floor(i / 3) * 160, f);
    drawChair(ctx, 2050 + (i % 3) * 200, 1195 + Math.floor(i / 3) * 160);
  }
  drawWhiteboard(ctx, 2100, 1080, 300, 40);

  for (let pb = 0; pb < 6; pb++) {
    drawPhoneBooth(ctx, 2020 + pb * 100, 1700);
  }
  for (let pb = 0; pb < 6; pb++) {
    drawPhoneBooth(ctx, 2020 + pb * 100, 1800);
  }

  drawPrinter(ctx, 950, 850);
  drawPrinter(ctx, 1020, 850);
  drawWaterCooler(ctx, 1100, 850);

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

  const zones: { sx: number; sy: number; cols: number; rows: number; dx: number; dy: number; room: string }[] = [
    { sx: 760, sy: 100, cols: 4, rows: 4, dx: 140, dy: 130, room: 'open-a' },
    { sx: 760, sy: 860, cols: 4, rows: 4, dx: 140, dy: 130, room: 'open-b' },
    { sx: 2040, sy: 1140, cols: 3, rows: 3, dx: 200, dy: 140, room: 'training' },
    { sx: 2040, sy: 1700, cols: 4, rows: 2, dx: 130, dy: 80, room: 'phone-bank' },
    { sx: 160, sy: 1720, cols: 2, rows: 2, dx: 140, dy: 100, room: 'lounge' },
  ];

  for (const z of zones) {
    for (let r = 0; r < z.rows; r++) {
      for (let c = 0; c < z.cols; c++) {
        if (positions.length >= count) return positions;
        positions.push({ x: z.sx + c * z.dx, y: z.sy + r * z.dy, room: z.room });
      }
    }
  }

  let overflow = 0;
  while (positions.length < count) {
    const ox = 760 + (overflow % 6) * 140;
    const oy = 1500 + Math.floor(overflow / 6) * 130;
    positions.push({ x: ox, y: oy, room: 'overflow' });
    overflow++;
  }

  return positions;
}

function drawWorker(ctx: CanvasRenderingContext2D, w: Worker, f: number, isSelected: boolean) {
  const moving = Math.hypot(w.tx - w.x, w.ty - w.y) > 2;
  const bob = Math.sin(w.phase) * (moving ? 1.5 : 0.5);
  const nx = Math.round(w.x), ny = Math.round(w.y + bob);

  if (isSelected) {
    ctx.strokeStyle = 'rgba(200,160,60,.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(nx, ny, 24, 0, Math.PI * 2); ctx.stroke();
    const pulse = 0.08 + Math.sin(f * 0.04) * 0.04;
    const selGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, 28);
    selGrad.addColorStop(0, `rgba(200,160,60,${pulse})`);
    selGrad.addColorStop(1, 'rgba(200,160,60,0)');
    ctx.fillStyle = selGrad;
    ctx.fillRect(nx - 28, ny - 28, 56, 56);
  }

  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.beginPath(); ctx.ellipse(nx, ny + 18, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

  const legSwing = moving ? Math.sin(w.wf * 0.12) * 3 : 0;
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(nx - 5, ny + 10, 4, 8 + legSwing);
  ctx.fillRect(nx + 1, ny + 10, 4, 8 - legSwing);
  ctx.fillStyle = '#333';
  ctx.fillRect(nx - 6, ny + 17 + legSwing, 5, 3);
  ctx.fillRect(nx, ny + 17 - legSwing, 5, 3);

  ctx.fillStyle = w.col;
  ctx.fillRect(nx - 7, ny - 2, 14, 12);
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(nx - 2, ny - 1, 4, 8);

  const armSwing = moving ? Math.sin(w.wf * 0.12) * 2 : 0;
  ctx.fillStyle = w.col;
  ctx.fillRect(nx - 10, ny - 1 + armSwing, 4, 8);
  ctx.fillRect(nx + 6, ny - 1 - armSwing, 4, 8);
  ctx.fillStyle = w.skin;
  ctx.fillRect(nx - 10, ny + 6 + armSwing, 4, 3);
  ctx.fillRect(nx + 6, ny + 6 - armSwing, 4, 3);

  ctx.fillStyle = w.skin;
  ctx.beginPath(); ctx.arc(nx, ny - 8, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(nx - 2, ny - 9, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(nx + 2, ny - 9, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = w.hair;
  ctx.fillRect(nx - 6, ny - 15, 12, 5);
  ctx.fillRect(nx - 7, ny - 12, 2, 4);
  ctx.fillRect(nx + 5, ny - 12, 2, 4);

  if (w.task === 'phone') {
    ctx.fillStyle = '#555';
    ctx.fillRect(nx + 7, ny - 12, 4, 8);
    const wave = Math.sin(f * 0.15) * 2;
    ctx.strokeStyle = 'rgba(80,180,80,.4)';
    ctx.lineWidth = 1;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath(); ctx.arc(nx + 12, ny - 10, 4 + r * 3 + wave, -0.8, 0.8); ctx.stroke();
    }
  }
  if (w.task === 'coffee') {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(nx + 7, ny + 2, 5, 6);
    ctx.fillStyle = '#6a3a18';
    ctx.fillRect(nx + 8, ny + 3, 3, 4);
    for (let s = 0; s < 3; s++) {
      const steamY = ny - 2 - s * 5 - ((f * 0.5 + s * 10) % 15);
      const steamX = nx + 9 + Math.sin(f * 0.04 + s) * 2;
      const steamA = 0.25 - s * 0.07;
      if (steamA > 0) {
        ctx.fillStyle = `rgba(200,200,200,${steamA})`;
        ctx.beginPath(); ctx.arc(steamX, steamY, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (w.task === 'presenting') {
    const armUp = Math.sin(f * 0.05) * 4;
    ctx.fillStyle = w.col;
    ctx.fillRect(nx + 6, ny - 6 + armUp, 4, 6);
  }
  if (w.task === 'desk' && !moving) {
    const dotPhase = Math.floor(f * 0.05) % 4;
    ctx.fillStyle = 'rgba(80,160,80,.5)';
    for (let d = 0; d < Math.min(dotPhase, 3); d++) {
      ctx.fillRect(nx + 14 + d * 4, ny - 4, 2, 2);
    }
  }
  if (w.task === 'filing' && !moving) {
    ctx.fillStyle = 'rgba(180,160,120,.5)';
    ctx.fillRect(nx + 7, ny + 0, 6, 8);
    ctx.fillRect(nx + 8, ny + 1, 4, 1);
    ctx.fillRect(nx + 8, ny + 3, 4, 1);
    ctx.fillRect(nx + 8, ny + 5, 4, 1);
  }
  if (w.task === 'copier' && !moving) {
    if (f % 40 < 20) {
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.fillRect(nx - 15, ny + 5, 30, 2);
    }
  }
  if (w.task === 'meeting' && !moving) {
    ctx.fillStyle = 'rgba(60,100,180,.3)';
    ctx.fillRect(nx + 7, ny + 0, 5, 7);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(nx + 8, ny + 1, 3, 1);
    ctx.fillRect(nx + 8, ny + 3, 3, 1);
  }

  const icon = TASK_ICONS[w.task];
  const cardW = 200;
  const cardX = nx - cardW / 2;
  const cardY = ny - 78;

  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, 48, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(160,140,110,.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, 48, 6); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(nx - 5, cardY + 48);
  ctx.lineTo(nx, cardY + 54);
  ctx.lineTo(nx + 5, cardY + 48);
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(nx - 5, cardY + 48);
  ctx.lineTo(nx, cardY + 54);
  ctx.lineTo(nx + 5, cardY + 48);
  ctx.strokeStyle = 'rgba(160,140,110,.3)';
  ctx.stroke();

  ctx.font = '13px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(icon, cardX + 6, cardY + 18);

  ctx.fillStyle = 'rgba(40,35,30,.9)';
  ctx.font = 'bold 11px "Inter","Segoe UI",sans-serif';
  ctx.fillText(w.bot.name.toUpperCase(), cardX + 24, cardY + 16);

  ctx.fillStyle = w.col;
  ctx.font = 'bold 8px "Inter","Segoe UI",sans-serif';
  const catText = w.bot.category.toUpperCase();
  const catW = ctx.measureText(catText).width + 8;
  ctx.fillStyle = w.col + '18';
  ctx.beginPath(); ctx.roundRect(cardX + 24 + ctx.measureText(w.bot.name.toUpperCase()).width + 6, cardY + 7, catW, 13, 3); ctx.fill();
  ctx.fillStyle = w.col;
  ctx.fillText(catText, cardX + 28 + ctx.measureText(w.bot.name.toUpperCase()).width + 6, cardY + 16);

  ctx.fillStyle = 'rgba(80,70,55,.7)';
  ctx.font = '10px "Inter","Segoe UI",sans-serif';
  const actLine = w.activityLine || TASK_LABELS[w.task];
  const maxChars = 30;
  const displayLine = actLine.length > maxChars ? actLine.slice(0, maxChars - 1) + '…' : actLine;
  ctx.fillText(displayLine, cardX + 8, cardY + 36);

  if (w.task === 'desk' && !moving) {
    const progress = Math.min(1, (w.timer > 0 ? 1 - w.timer / 700 : 1));
    const barW = cardW - 16;
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    ctx.beginPath(); ctx.roundRect(cardX + 8, cardY + 41, barW, 3, 1.5); ctx.fill();
    ctx.fillStyle = 'rgba(60,160,80,.4)';
    ctx.beginPath(); ctx.roundRect(cardX + 8, cardY + 41, barW * progress, 3, 1.5); ctx.fill();
  }

  if (w.speech && w.speechT > 0) {
    const alpha = Math.min(1, w.speechT / 40);
    ctx.font = '10px "Inter","Segoe UI",sans-serif';
    const speechW = ctx.measureText(`"${w.speech}"`).width + 20;
    const sbx = nx - speechW / 2, sby = cardY - 28;

    ctx.fillStyle = `rgba(245,240,230,${0.95 * alpha})`;
    ctx.beginPath(); ctx.roundRect(sbx, sby, speechW, 22, 5); ctx.fill();
    ctx.strokeStyle = `rgba(180,160,120,${0.4 * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(sbx, sby, speechW, 22, 5); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(nx - 4, sby + 22);
    ctx.lineTo(nx, sby + 27);
    ctx.lineTo(nx + 4, sby + 22);
    ctx.fillStyle = `rgba(245,240,230,${0.95 * alpha})`;
    ctx.fill();

    ctx.fillStyle = `rgba(60,50,35,${0.8 * alpha})`;
    ctx.font = `italic 10px "Inter","Segoe UI",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`"${w.speech}"`, nx, sby + 15);
  }
}

function drawJeanClaw(ctx: CanvasRenderingContext2D, f: number) {
  const jcX = 180, jcY = 160;
  const bob = Math.sin(f * 0.025) * 0.8;
  const nx = jcX, ny = Math.round(jcY + bob);

  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.beginPath(); ctx.ellipse(nx, ny + 20, 9, 3, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(nx - 5, ny + 12, 4, 8); ctx.fillRect(nx + 1, ny + 12, 4, 8);
  ctx.fillStyle = '#222';
  ctx.fillRect(nx - 6, ny + 19, 5, 3); ctx.fillRect(nx, ny + 19, 5, 3);

  ctx.fillStyle = '#3a2a10';
  ctx.fillRect(nx - 8, ny - 2, 16, 14);
  ctx.fillStyle = '#f0c040';
  ctx.fillRect(nx - 3, ny, 6, 10);

  ctx.fillStyle = '#3a2a10';
  ctx.fillRect(nx - 11, ny + armSwingJC(f, 1), 4, 9);
  ctx.fillRect(nx + 7, ny + armSwingJC(f, -1), 4, 9);

  ctx.fillStyle = '#d4a06a';
  ctx.beginPath(); ctx.arc(nx, ny - 9, 7, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#1a1008';
  ctx.fillRect(nx - 3, ny - 11, 1.5, 1.5);
  ctx.fillRect(nx + 1.5, ny - 11, 1.5, 1.5);

  ctx.fillStyle = '#c09030';
  ctx.fillRect(nx - 3, ny - 7, 6, 1);

  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(nx - 7, ny - 17, 14, 6);
  ctx.fillRect(nx - 8, ny - 14, 2, 5);
  ctx.fillRect(nx + 6, ny - 14, 2, 5);

  ctx.fillStyle = '#f0c040';
  ctx.fillRect(nx - 9, ny - 14, 18, 2);
  ctx.fillStyle = 'rgba(240,192,64,.6)';
  ctx.fillRect(nx - 10, ny - 13, 1, 8);
  ctx.fillRect(nx + 9, ny - 13, 1, 8);

  ctx.fillStyle = 'rgba(80,60,20,.9)';
  ctx.font = 'bold 11px "Inter","Segoe UI",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('JEAN CLAW', nx, ny - 22);
  ctx.fillStyle = 'rgba(160,130,60,.6)';
  ctx.font = '8px "Inter","Segoe UI",sans-serif';
  ctx.fillText('OFFICE MANAGER', nx, ny - 32);

  const aura = 0.04 + Math.sin(f * 0.02) * 0.02;
  const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, 40);
  grad.addColorStop(0, `rgba(240,192,64,${aura})`);
  grad.addColorStop(1, 'rgba(240,192,64,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(nx - 40, ny - 40, 80, 80);
}

function armSwingJC(f: number, dir: number): number {
  return Math.sin(f * 0.015) * 1.5 * dir;
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

type OfficeTab = 'floor' | 'team' | 'info';

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

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const camRef = useRef({ x: 400, y: 200 });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const canvasSizeRef = useRef({ w: 1200, h: 800 });

  useEffect(() => {
    apiFetch('/api/world/my-office')
      .then(r => { if (!r.ok) throw new Error('Not authenticated'); return r.json(); })
      .then((d: OfficeData) => {
        if (!d || !d.bots) { setData({ bots: [], orgs: [], isAdmin: false, hasOffice: false }); return; }
        setData(d);
        const desks = getDeskPositions(Math.max(d.bots.length, 1));
        workersRef.current = d.bots.map((bot, i) => {
          const dk = desks[i % desks.length];
          return {
            bot, x: dk.x + 45, y: dk.y + 30, tx: dk.x + 45, ty: dk.y + 30,
            task: 'desk' as BotTask, timer: 200 + Math.random() * 300,
            deskX: dk.x, deskY: dk.y,
            phase: Math.random() * Math.PI * 2, wf: 0,
            speech: null, speechT: 0,
            activityLine: pick(TASK_DETAILS['desk']),
            col: CAT_COLORS[bot.category] || '#3aaa7a',
            hair: pick(HAIR),
            skin: pick(SKIN),
            facing: 'down' as const,
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
    w.tx = target.x;
    w.ty = target.y;
  }, [getTaskTarget]);

  useEffect(() => {
    if (activeTab !== 'floor') return;
    const cvs = canvasRef.current;
    if (!cvs || !data) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const updateCanvasSize = () => {
      const container = cvs.parentElement;
      if (container) {
        canvasSizeRef.current.w = container.clientWidth;
        canvasSizeRef.current.h = container.clientHeight;
      }
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    const loop = () => {
      frameRef.current++;
      const f = frameRef.current;
      const ws = workersRef.current;
      const { w: cw, h: ch } = canvasSizeRef.current;
      cvs.width = cw;
      cvs.height = ch;

      const cam = camRef.current;
      cam.x = Math.max(0, Math.min(WW - cw, cam.x));
      cam.y = Math.max(0, Math.min(WH - ch, cam.y));

      ctx.save();
      ctx.translate(-cam.x, -cam.y);

      ctx.fillStyle = '#d0c8b8';
      ctx.fillRect(0, 0, WW, WH);

      for (let i = 1; i < ROOMS.length; i++) drawRoom(ctx, ROOMS[i], f);

      drawFurniture(ctx, f);

      drawJeanClaw(ctx, f);

      for (const w of ws) {
        w.timer--;
        if (w.timer <= 0) newTask(w);
        if (w.speechT > 0) w.speechT--;
        if (w.speechT <= 0) w.speech = null;

        const dx = w.tx - w.x, dy = w.ty - w.y, dist = Math.hypot(dx, dy);
        if (dist > 3) {
          const speed = 1.2;
          w.x += (dx / dist) * speed;
          w.y += (dy / dist) * speed;
          w.wf++;
          w.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        }
        w.phase += 0.04;

        const sel = selectedRef.current;
        const isSel = sel != null && w.bot.slug === sel.bot.slug;
        drawWorker(ctx, w, f, isSel);
      }

      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = 'bold 11px "Inter","Segoe UI",sans-serif';
      ctx.textAlign = 'left';
      const orgName = data.orgs[0]?.orgName ?? 'HEADQUARTERS';
      ctx.fillText(`${orgName.toUpperCase()} — THE OFFICE`, 12, 20);

      ctx.fillStyle = 'rgba(120,110,100,.5)';
      ctx.font = '9px "Inter","Segoe UI",sans-serif';
      ctx.fillText(`${ws.length} employees on floor`, 12, 34);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(120,110,100,.4)';
      ctx.font = '9px "Inter","Segoe UI",sans-serif';
      const hr = new Date().getHours(), mn = new Date().getMinutes();
      ctx.fillText(`${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')} — Drag to pan`, cw - 12, 20);

      const zoomStr = `${Math.round((cw / WW) * 100)}% view`;
      ctx.fillText(zoomStr, cw - 12, 34);

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [data, newTask, activeTab]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    camRef.current.x -= dx;
    camRef.current.y -= dy;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.dragging) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    const mx = (e.clientX - r.left) + camRef.current.x;
    const my = (e.clientY - r.top) + camRef.current.y;
    let best: Worker | null = null, bestD = 40;
    for (const w of workersRef.current) {
      const d = Math.hypot(w.x - mx, w.y - my);
      if (d < bestD) { bestD = d; best = w; }
    }
    setSelected(best);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f0ea] flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-10 h-10 text-amber-700/30 mx-auto mb-3 animate-pulse" />
          <p className="text-amber-800/50 font-sans text-xs tracking-widest">CONNECTING TO OFFICE...</p>
        </div>
      </div>
    );
  }

  if (!data || data.bots.length === 0) {
    const emptyOrg = data?.orgs?.[0];
    return (
      <div className="min-h-screen bg-[#f4f0ea] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-900/10 bg-white/60">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-amber-700/50" />
            <span className="font-sans text-xs text-amber-800/70 tracking-widest font-medium">
              {emptyOrg ? `${emptyOrg.orgName.toUpperCase()} — OFFICE` : 'THE OFFICE'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {['floor', 'team', 'info'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as OfficeTab)}
                className={`font-sans text-[10px] px-2 py-1 rounded tracking-widest transition-colors ${activeTab === t ? 'bg-amber-100 text-amber-800' : 'text-amber-700/40 hover:text-amber-700/60'}`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'team' && emptyOrg ? (
          <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
            <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-amber-600/40 animate-spin" /></div>}>
              <TeamManagement orgId={emptyOrg.orgId} />
            </Suspense>
          </div>
        ) : activeTab === 'info' ? (
          <OfficeInfoPanel />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <Building2 className="w-14 h-14 text-amber-700/15 mx-auto mb-5" />
              <h2 className="text-amber-800/70 font-sans text-sm mb-2 tracking-widest font-medium">NO OFFICE ESTABLISHED</h2>
              <p className="text-amber-700/40 font-sans text-xs mb-5 leading-relaxed">
                Subscribe to bots from the Bot Factory to staff your office. Each bot becomes a visible worker on the floor.
              </p>
              <div className="flex flex-col gap-2 items-center">
                <button onClick={() => navigate('/bots')}
                  className="px-5 py-2 bg-amber-100 border border-amber-300/50 text-amber-800 font-sans text-xs tracking-widest hover:bg-amber-200/60 transition-colors rounded">
                  VISIT BOT FACTORY
                </button>
                {emptyOrg && (
                  <button onClick={() => setActiveTab('team')}
                    className="px-5 py-1.5 text-amber-700/50 font-sans text-xs tracking-widest hover:text-amber-700/70 transition-colors">
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
    <div className="h-screen bg-[#f4f0ea] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-amber-900/10 bg-white/70 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <Building2 className="w-4 h-4 text-amber-700/50" />
          <span className="font-sans text-xs text-amber-800/70 tracking-widest font-medium">
            {primaryOrg ? `${primaryOrg.orgName.toUpperCase()} — OFFICE` : 'THE OFFICE'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {['floor', 'team', 'info'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as OfficeTab)}
              className={`flex items-center gap-1 font-sans text-[10px] px-2 py-1 rounded tracking-widest transition-colors ${activeTab === t ? 'bg-amber-100 text-amber-800' : 'text-amber-700/40 hover:text-amber-700/60'}`}>
              {t === 'floor' && <Cctv className="w-3 h-3" />}
              {t === 'team' && <UserCog className="w-3 h-3" />}
              {t === 'info' && <Info className="w-3 h-3" />}
              <span>{t.toUpperCase()}</span>
            </button>
          ))}
          <div className="flex items-center gap-1 text-amber-700/30 font-sans text-[10px]">
            <Users className="w-3 h-3" />
            <span>{data.bots.length}</span>
          </div>
        </div>
      </div>

      {activeTab === 'team' && primaryOrg ? (
        <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
          <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-5 h-5 text-amber-600/40 animate-spin" /></div>}>
            <TeamManagement orgId={primaryOrg.orgId} />
          </Suspense>
        </div>
      ) : activeTab === 'team' && !primaryOrg ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Building2 className="w-8 h-8 text-amber-700/20 mx-auto mb-3" />
            <p className="font-sans text-xs text-amber-700/40 mb-1">NO ORGANIZATION</p>
            <p className="font-sans text-[10px] text-amber-700/25">
              Create or join an organization in the World to manage your team.
            </p>
          </div>
        </div>
      ) : activeTab === 'info' ? (
        <OfficeInfoPanel />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleClick}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
              style={{ imageRendering: 'auto' }}
            />
          </div>

          <ActivityFeed
            bots={data.bots}
            workersRef={workersRef}
            selected={selected}
            onSelect={(w) => {
              setSelected(w);
              if (w) {
                camRef.current.x = w.x - canvasSizeRef.current.w / 2;
                camRef.current.y = w.y - canvasSizeRef.current.h / 2;
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

function ActivityFeed({ bots, workersRef, selected, onSelect }: {
  bots: OfficeBotWorker[];
  workersRef: React.RefObject<Worker[]>;
  selected: Worker | null;
  onSelect: (w: Worker | null) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const workers = workersRef.current ?? [];

  return (
    <div className="w-72 border-l border-amber-900/8 overflow-y-auto bg-white/60 backdrop-blur-sm shrink-0 flex flex-col">
      <div className="px-3 py-2 border-b border-amber-900/8 shrink-0">
        <h3 className="font-sans text-[10px] text-amber-800/50 tracking-widest font-medium">LIVE ACTIVITY FEED</h3>
        <p className="font-sans text-[8px] text-amber-700/25 mt-0.5">{workers.length} employees active</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {bots.map((bot, i) => {
          const w = workers[i];
          if (!w) return null;
          const isSel = selected?.bot.slug === bot.slug;
          const cc = CAT_COLORS[bot.category] || '#3aaa7a';
          const icon = TASK_ICONS[w.task];

          return (
            <div
              key={bot.slug}
              onClick={() => onSelect(isSel ? null : w)}
              className={`px-3 py-2.5 border-b border-amber-900/4 cursor-pointer transition-all ${isSel ? 'bg-amber-100/80 border-l-2 border-l-amber-500' : 'hover:bg-amber-50/60'}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-sm mt-0.5 shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-sans text-[11px] text-amber-900/80 font-semibold truncate">{bot.name.toUpperCase()}</span>
                    <span className="font-sans text-[7px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                      style={{ backgroundColor: cc + '15', color: cc }}>{bot.category.toUpperCase()}</span>
                  </div>
                  <div className="font-sans text-[10px] text-amber-800/60 mt-0.5 font-medium">
                    {TASK_LABELS[w.task]}
                  </div>
                  <div className="font-sans text-[9px] text-amber-700/45 mt-0.5 leading-relaxed">
                    {w.activityLine}
                  </div>
                  {w.speech && w.speechT > 0 && (
                    <div className="font-sans text-[9px] text-amber-600/50 mt-1 italic">
                      &ldquo;{w.speech}&rdquo;
                    </div>
                  )}
                </div>
              </div>

              {isSel && (
                <div className="mt-2 pt-2 border-t border-amber-200/40 space-y-1">
                  <p className="font-sans text-[9px] text-amber-700/40 italic">{bot.tagline}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-sans text-[8px] text-amber-700/30">LOCATION: <span className="text-amber-800/50 font-medium">{Math.round(w.x)}, {Math.round(w.y)}</span></span>
                    <span className="font-sans text-[8px]"><span className="text-green-600/60">●</span> ACTIVE</span>
                  </div>
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
        <div className="bg-white/70 rounded-lg border border-amber-200/50 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-sans text-lg text-amber-900/80 font-semibold tracking-wide">{OFFICE_INFO.name}</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-amber-600/50" />
                <span className="font-sans text-xs text-amber-700/60">{OFFICE_INFO.address}</span>
              </div>
              <span className="font-sans text-[10px] text-amber-600/40 tracking-wider">{OFFICE_INFO.district}</span>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 font-sans text-[10px] font-medium rounded tracking-wider">
              {OFFICE_INFO.status}
            </span>
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

        <div className="bg-white/70 rounded-lg border border-amber-200/50 p-6">
          <h3 className="font-sans text-sm text-amber-900/70 font-semibold tracking-wider mb-3">AMENITIES</h3>
          <div className="grid grid-cols-2 gap-2">
            {OFFICE_INFO.amenities.map(a => (
              <div key={a} className="flex items-center gap-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                <span className="font-sans text-xs text-amber-800/60">{a}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/70 rounded-lg border border-amber-200/50 p-6">
          <h3 className="font-sans text-sm text-amber-900/70 font-semibold tracking-wider mb-3">FLOOR PLAN</h3>
          <div className="grid grid-cols-3 gap-2 text-[10px] font-sans">
            {ROOMS.filter(r => r.label).map(r => (
              <div key={r.label} className="px-2 py-1.5 bg-amber-50/60 rounded border border-amber-200/30">
                <span className="text-amber-800/60 tracking-wider">{r.label}</span>
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
    <div className="flex items-start gap-3 p-3 bg-amber-50/40 rounded-lg">
      <div className="text-amber-600/40 mt-0.5">{icon}</div>
      <div>
        <span className="font-sans text-[9px] text-amber-700/40 tracking-widest block">{label}</span>
        <span className="font-sans text-sm text-amber-900/70 font-medium">{value}</span>
      </div>
    </div>
  );
}
