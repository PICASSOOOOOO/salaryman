import { useEffect, useRef, useState, useCallback } from 'react';

interface ArcadeGameProps {
  gameId: string;
  priceFiat?: number;
  onExit: () => void;
  onDeductFiat: () => boolean | Promise<boolean>;
  salary: number;
}

const GAME_LIST = [
  { id: 'cyber_serpent', label: 'CYBER SERPENT', color: '#38bdf8', priceFiat: 10, desc: 'Guide the serpent. Eat data nodes. Don\'t hit walls.' },
  { id: 'void_invaders', label: 'VOID INVADERS', color: '#ff4444', priceFiat: 25, desc: 'Shoot the descending alien fleet before they reach you.' },
  { id: 'barrel_runner', label: 'BARREL RUNNER', color: '#ffaa00', priceFiat: 50, desc: 'Climb the platforms. Dodge barrels. Reach the top.' },
  { id: 'neon_breaker', label: 'NEON BREAKER', color: '#ff44ff', priceFiat: 100, desc: 'Bounce the ball. Break all the bricks.' },
];

export { GAME_LIST };

export default function ArcadeGame({ gameId, priceFiat, onExit, onDeductFiat, salary }: ArcadeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<'title' | 'playing' | 'gameover'>('title');
  const scoreRef = useRef(0);
  const highScoreRef = useRef(0);
  const frameRef = useRef(0);
  const keysRef = useRef(new Set<string>());
  const gameDataRef = useRef<any>({});
  const rafRef = useRef(0);
  const startingRef = useRef(false);
  const [, forceUpdate] = useState(0);
  const [isStarting, setIsStarting] = useState(false);

  const game = GAME_LIST.find(g => g.id === gameId) ?? GAME_LIST[0];
  const playPrice = priceFiat ?? game.priceFiat;

  const startGame = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    try {
      if (!(await onDeductFiat())) return;
      stateRef.current = 'playing';
      scoreRef.current = 0;
      frameRef.current = 0;
      gameDataRef.current = initGame(gameId);
      forceUpdate(n => n + 1);
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, [gameId, onDeductFiat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') { onExit(); return; }
      keysRef.current.add(k);
      if (stateRef.current === 'title' && (k === 'enter' || k === ' ')) {
        e.preventDefault();
        void startGame();
      }
      if (stateRef.current === 'gameover' && (k === 'enter' || k === ' ')) {
        e.preventDefault();
        void startGame();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [onExit, startGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 320, H = 240;
    canvas.width = W;
    canvas.height = H;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      if (stateRef.current === 'title') {
        ctx.font = 'bold 18px "Fira Code", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = game.color;
        ctx.fillText(game.label, W / 2, 60);
        ctx.font = '10px "Fira Code", monospace';
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.fillText(game.desc, W / 2, 90);
        ctx.fillStyle = 'rgba(255,255,255,.3)';
         ctx.fillText(`COST: ƒ${playPrice}  |  BALANCE: ƒ${salary.toLocaleString()}`, W / 2, 120);
        const blink = Math.sin(frameRef.current * 0.08) > 0;
        if (blink) {
          ctx.fillStyle = game.color;
          ctx.font = '12px "Fira Code", monospace';
          ctx.fillText('PRESS ENTER TO START', W / 2, 160);
        }
        ctx.fillStyle = 'rgba(255,255,255,.2)';
        ctx.font = '9px "Fira Code", monospace';
        ctx.fillText('ESC TO EXIT', W / 2, 220);
        if (highScoreRef.current > 0) {
          ctx.fillStyle = 'rgba(255,200,0,.4)';
          ctx.fillText(`HIGH SCORE: ${highScoreRef.current}`, W / 2, 200);
        }
      } else if (stateRef.current === 'playing') {
        const result = updateGame(gameId, gameDataRef.current, keysRef.current, W, H);
        if (result.score !== undefined) scoreRef.current = result.score;
        if (result.gameOver) {
          stateRef.current = 'gameover';
          if (scoreRef.current > highScoreRef.current) highScoreRef.current = scoreRef.current;
          forceUpdate(n => n + 1);
        }
        renderGame(ctx, gameId, gameDataRef.current, W, H, frameRef.current, game.color);
        ctx.font = '10px "Fira Code", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = game.color;
        ctx.fillText(`SCORE: ${scoreRef.current}`, 8, 14);
      } else if (stateRef.current === 'gameover') {
        ctx.font = 'bold 20px "Fira Code", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff3333';
        ctx.fillText('GAME OVER', W / 2, 70);
        ctx.font = '14px "Fira Code", monospace';
        ctx.fillStyle = game.color;
        ctx.fillText(`SCORE: ${scoreRef.current}`, W / 2, 100);
        if (scoreRef.current >= highScoreRef.current) {
          ctx.fillStyle = '#ffcc00';
          ctx.fillText('NEW HIGH SCORE!', W / 2, 120);
        }
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        ctx.font = '10px "Fira Code", monospace';
         ctx.fillText(`INSERT ƒ${playPrice} TO CONTINUE  |  BALANCE: ƒ${salary.toLocaleString()}`, W / 2, 155);
        const blink = Math.sin(frameRef.current * 0.08) > 0;
        if (blink) {
          ctx.fillStyle = game.color;
          ctx.font = '12px "Fira Code", monospace';
          ctx.fillText('PRESS ENTER', W / 2, 185);
        }
        ctx.fillStyle = 'rgba(255,255,255,.2)';
        ctx.font = '9px "Fira Code", monospace';
        ctx.fillText('ESC TO EXIT', W / 2, 220);
      }
      frameRef.current++;
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameId, game, salary]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.92)', padding: 16 }}>
      <div style={{ border: `2px solid ${game.color}44`, borderRadius: 8, overflow: 'hidden', boxShadow: `0 0 40px ${game.color}22`, maxWidth: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{ width: 'min(640px, 90vw)', height: 'auto', aspectRatio: '4 / 3', imageRendering: 'pixelated', display: 'block' }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '10px 12px', background: '#0a0a0a' }}>
          <button type="button" onClick={() => void startGame()} disabled={isStarting} style={{ border: `1px solid ${game.color}`, color: game.color, background: 'transparent', padding: '8px 12px', font: 'bold 11px "Fira Code", monospace', cursor: isStarting ? 'wait' : 'pointer' }}>
            {isStarting ? 'CHARGING…' : stateRef.current === 'gameover' ? `PLAY AGAIN · ƒ${playPrice}` : `START · ƒ${playPrice}`}
          </button>
          <button type="button" onClick={onExit} style={{ border: '1px solid rgba(255,255,255,.25)', color: 'rgba(255,255,255,.7)', background: 'transparent', padding: '8px 12px', font: '11px "Fira Code", monospace', cursor: 'pointer' }}>
            EXIT
          </button>
        </div>
      </div>
    </div>
  );
}

function initGame(id: string): any {
  if (id === 'cyber_serpent') return initSnake();
  if (id === 'void_invaders') return initInvaders();
  if (id === 'barrel_runner') return initBarrelRunner();
  if (id === 'neon_breaker') return initBreaker();
  return {};
}

function updateGame(id: string, data: any, keys: Set<string>, w: number, h: number): { score?: number; gameOver?: boolean } {
  if (id === 'cyber_serpent') return updateSnake(data, keys, w, h);
  if (id === 'void_invaders') return updateInvaders(data, keys, w, h);
  if (id === 'barrel_runner') return updateBarrelRunner(data, keys, w, h);
  if (id === 'neon_breaker') return updateBreaker(data, keys, w, h);
  return {};
}

function renderGame(ctx: CanvasRenderingContext2D, id: string, data: any, w: number, h: number, frame: number, color: string) {
  if (id === 'cyber_serpent') renderSnake(ctx, data, w, h, frame, color);
  if (id === 'void_invaders') renderInvaders(ctx, data, w, h, frame, color);
  if (id === 'barrel_runner') renderBarrelRunner(ctx, data, w, h, frame, color);
  if (id === 'neon_breaker') renderBreaker(ctx, data, w, h, frame, color);
}

// ═══════════════════════════════════════════════════════════════════════════
// CYBER SERPENT
// ═══════════════════════════════════════════════════════════════════════════
const GRID = 10;
function initSnake() {
  const cx = 16, cy = 12;
  return {
    body: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: spawnFood(32, 24, [{ x: cx, y: cy }]),
    tick: 0,
    speed: 6,
    score: 0,
    alive: true,
  };
}

function spawnFood(gw: number, gh: number, body: { x: number; y: number }[]) {
  let fx: number, fy: number;
  do {
    fx = Math.floor(Math.random() * gw);
    fy = Math.floor(Math.random() * gh);
  } while (body.some(s => s.x === fx && s.y === fy));
  return { x: fx, y: fy };
}

function updateSnake(d: any, keys: Set<string>, _w: number, _h: number) {
  if (!d.alive) return { score: d.score, gameOver: true };
  if ((keys.has('arrowup') || keys.has('w')) && d.dir.y === 0) d.nextDir = { x: 0, y: -1 };
  if ((keys.has('arrowdown') || keys.has('s')) && d.dir.y === 0) d.nextDir = { x: 0, y: 1 };
  if ((keys.has('arrowleft') || keys.has('a')) && d.dir.x === 0) d.nextDir = { x: -1, y: 0 };
  if ((keys.has('arrowright') || keys.has('d')) && d.dir.x === 0) d.nextDir = { x: 1, y: 0 };

  d.tick++;
  if (d.tick < d.speed) return { score: d.score };
  d.tick = 0;
  d.dir = { ...d.nextDir };
  const head = d.body[0];
  const nx = head.x + d.dir.x;
  const ny = head.y + d.dir.y;
  const gw = 32, gh = 24;
  if (nx < 0 || nx >= gw || ny < 0 || ny >= gh || d.body.some((s: any) => s.x === nx && s.y === ny)) {
    d.alive = false;
    return { score: d.score, gameOver: true };
  }
  d.body.unshift({ x: nx, y: ny });
  if (nx === d.food.x && ny === d.food.y) {
    d.score += 10;
    d.food = spawnFood(gw, gh, d.body);
    if (d.speed > 2) d.speed = Math.max(2, d.speed - 0.3);
  } else {
    d.body.pop();
  }
  return { score: d.score };
}

function renderSnake(ctx: CanvasRenderingContext2D, d: any, _w: number, _h: number, frame: number, color: string) {
  ctx.fillStyle = 'rgba(56,189,248,.08)';
  for (let x = 0; x < 32; x++) for (let y = 0; y < 24; y++) {
    if ((x + y) % 2 === 0) ctx.fillRect(x * GRID, y * GRID, GRID, GRID);
  }
  for (let i = 0; i < d.body.length; i++) {
    const s = d.body[i];
    const alpha = 1 - i * 0.015;
    ctx.fillStyle = i === 0 ? color : `rgba(0,200,40,${Math.max(0.3, alpha)})`;
    ctx.fillRect(s.x * GRID + 1, s.y * GRID + 1, GRID - 2, GRID - 2);
  }
  const pulse = 0.6 + Math.sin(frame * 0.15) * 0.4;
  ctx.fillStyle = `rgba(255,50,50,${pulse})`;
  ctx.fillRect(d.food.x * GRID + 2, d.food.y * GRID + 2, GRID - 4, GRID - 4);
  ctx.fillStyle = `rgba(255,150,150,${pulse * 0.5})`;
  ctx.fillRect(d.food.x * GRID + 3, d.food.y * GRID + 3, GRID - 6, GRID - 6);
}

// ═══════════════════════════════════════════════════════════════════════════
// VOID INVADERS
// ═══════════════════════════════════════════════════════════════════════════
function initInvaders() {
  const enemies: { x: number; y: number; alive: boolean; type: number }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 8; col++) {
      enemies.push({ x: 40 + col * 30, y: 20 + row * 22, alive: true, type: row < 2 ? 2 : row < 4 ? 1 : 0 });
    }
  }
  return {
    px: 160, bullets: [] as { x: number; y: number; dy: number }[],
    enemies, enemyDir: 1, enemySpeed: 0.3, enemyMoveTimer: 0,
    enemyBullets: [] as { x: number; y: number }[],
    score: 0, alive: true, shootCd: 0,
  };
}

function updateInvaders(d: any, keys: Set<string>, w: number, h: number) {
  if (!d.alive) return { score: d.score, gameOver: true };
  if (keys.has('arrowleft') || keys.has('a')) d.px = Math.max(10, d.px - 3);
  if (keys.has('arrowright') || keys.has('d')) d.px = Math.min(w - 10, d.px + 3);
  if (d.shootCd > 0) d.shootCd--;
  if ((keys.has(' ') || keys.has('arrowup') || keys.has('w')) && d.shootCd <= 0) {
    d.bullets.push({ x: d.px, y: h - 25, dy: -4 });
    d.shootCd = 10;
  }
  d.bullets = d.bullets.filter((b: any) => {
    b.y += b.dy;
    if (b.y < 0) return false;
    for (const e of d.enemies) {
      if (e.alive && Math.abs(b.x - e.x) < 10 && Math.abs(b.y - e.y) < 8) {
        e.alive = false;
        d.score += (e.type + 1) * 10;
        return false;
      }
    }
    return true;
  });
  d.enemyMoveTimer++;
  if (d.enemyMoveTimer >= Math.max(2, 15 - d.enemies.filter((e: any) => !e.alive).length * 0.3)) {
    d.enemyMoveTimer = 0;
    let hitEdge = false;
    for (const e of d.enemies) {
      if (!e.alive) continue;
      e.x += d.enemyDir * 4;
      if (e.x < 15 || e.x > w - 15) hitEdge = true;
    }
    if (hitEdge) {
      d.enemyDir *= -1;
      for (const e of d.enemies) { if (e.alive) { e.y += 8; e.x += d.enemyDir * 4; } }
    }
  }
  if (Math.random() < 0.02) {
    const shooters = d.enemies.filter((e: any) => e.alive);
    if (shooters.length > 0) {
      const s = shooters[Math.floor(Math.random() * shooters.length)];
      d.enemyBullets.push({ x: s.x, y: s.y + 8 });
    }
  }
  d.enemyBullets = d.enemyBullets.filter((b: any) => {
    b.y += 2.5;
    if (b.y > h) return false;
    if (Math.abs(b.x - d.px) < 8 && Math.abs(b.y - (h - 18)) < 8) {
      d.alive = false;
      return false;
    }
    return true;
  });
  for (const e of d.enemies) {
    if (e.alive && e.y > h - 30) { d.alive = false; break; }
  }
  if (d.enemies.every((e: any) => !e.alive)) {
    const newEnemies: any[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        newEnemies.push({ x: 40 + col * 30, y: 20 + row * 22, alive: true, type: row < 2 ? 2 : row < 4 ? 1 : 0 });
      }
    }
    d.enemies = newEnemies;
    d.enemyDir = 1;
    d.score += 100;
  }
  if (!d.alive) return { score: d.score, gameOver: true };
  return { score: d.score };
}

function renderInvaders(ctx: CanvasRenderingContext2D, d: any, w: number, h: number, frame: number, color: string) {
  const colors = ['#44ff44', '#ffaa00', '#ff4444'];
  for (const e of d.enemies) {
    if (!e.alive) continue;
    const c = colors[e.type];
    ctx.fillStyle = c;
    ctx.fillRect(e.x - 8, e.y - 6, 16, 12);
    ctx.fillStyle = '#000';
    const wiggle = Math.sin(frame * 0.1) > 0 ? 2 : -2;
    ctx.fillRect(e.x - 6, e.y + 6, 4, 3 + (wiggle > 0 ? 1 : 0));
    ctx.fillRect(e.x + 2, e.y + 6, 4, 3 + (wiggle < 0 ? 1 : 0));
    ctx.fillRect(e.x - 3, e.y - 3, 2, 2);
    ctx.fillRect(e.x + 1, e.y - 3, 2, 2);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(d.px, h - 25);
  ctx.lineTo(d.px - 8, h - 14);
  ctx.lineTo(d.px + 8, h - 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(d.px - 1, h - 28, 2, 5);
  ctx.fillStyle = '#ffffff';
  for (const b of d.bullets) ctx.fillRect(b.x - 1, b.y, 2, 6);
  ctx.fillStyle = '#ff4444';
  for (const b of d.enemyBullets) ctx.fillRect(b.x - 1, b.y, 2, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// BARREL RUNNER (platformer)
// ═══════════════════════════════════════════════════════════════════════════
function initBarrelRunner() {
  const platforms = [
    { x: 0, y: 220, w: 320, h: 20 },
    { x: 250, y: 180, w: 70, h: 8 },
    { x: 60, y: 150, w: 200, h: 8 },
    { x: 0, y: 115, w: 180, h: 8 },
    { x: 180, y: 80, w: 140, h: 8 },
    { x: 20, y: 45, w: 200, h: 8 },
  ];
  return {
    px: 30, py: 200, vx: 0, vy: 0, grounded: false,
    platforms,
    barrels: [] as { x: number; y: number; vx: number; vy: number; plat: number }[],
    barrelTimer: 0,
    goal: { x: 180, y: 25 },
    score: 0, alive: true, level: 1,
  };
}

function updateBarrelRunner(d: any, keys: Set<string>, w: number, h: number) {
  if (!d.alive) return { score: d.score, gameOver: true };
  const accel = 0.5, maxSpd = 2.5, gravity = 0.35, jumpForce = -5.5;
  if (keys.has('arrowleft') || keys.has('a')) d.vx = Math.max(-maxSpd, d.vx - accel);
  else if (keys.has('arrowright') || keys.has('d')) d.vx = Math.min(maxSpd, d.vx + accel);
  else d.vx *= 0.8;
  if ((keys.has('arrowup') || keys.has('w') || keys.has(' ')) && d.grounded) {
    d.vy = jumpForce;
    d.grounded = false;
  }
  d.vy += gravity;
  d.px += d.vx;
  d.py += d.vy;
  d.px = Math.max(0, Math.min(w - 8, d.px));
  d.grounded = false;
  for (const p of d.platforms) {
    if (d.px + 6 > p.x && d.px - 6 < p.x + p.w && d.py + 8 > p.y && d.py + 8 < p.y + p.h + 6 && d.vy >= 0) {
      d.py = p.y - 8;
      d.vy = 0;
      d.grounded = true;
    }
  }
  if (d.py > h + 20) { d.alive = false; return { score: d.score, gameOver: true }; }
  d.barrelTimer++;
  if (d.barrelTimer > Math.max(30, 80 - d.level * 5)) {
    d.barrelTimer = 0;
    const topPlat = d.platforms[d.platforms.length - 1];
    d.barrels.push({ x: topPlat.x + topPlat.w - 10, y: topPlat.y - 6, vx: -1.5, vy: 0, plat: d.platforms.length - 1 });
  }
  d.barrels = d.barrels.filter((b: any) => {
    b.vy += gravity * 0.8;
    b.x += b.vx;
    b.y += b.vy;
    let onPlat = false;
    for (const p of d.platforms) {
      if (b.x + 4 > p.x && b.x - 4 < p.x + p.w && b.y + 4 > p.y && b.y + 4 < p.y + p.h + 5 && b.vy >= 0) {
        b.y = p.y - 4;
        b.vy = 0;
        onPlat = true;
        break;
      }
    }
    if (!onPlat && b.y > h + 30) return false;
    if (b.x < -10 || b.x > w + 10) { b.vx *= -1; b.x = Math.max(-5, Math.min(w + 5, b.x)); }
    if (Math.abs(b.x - d.px) < 10 && Math.abs(b.y - d.py) < 10) {
      d.alive = false;
    }
    return true;
  });
  if (Math.abs(d.px - d.goal.x) < 12 && Math.abs(d.py - d.goal.y) < 15) {
    d.score += 100 + d.level * 50;
    d.level++;
    d.barrels = [];
    d.px = 30; d.py = 200; d.vx = 0; d.vy = 0;
  }
  if (!d.alive) return { score: d.score, gameOver: true };
  return { score: d.score };
}

function renderBarrelRunner(ctx: CanvasRenderingContext2D, d: any, _w: number, _h: number, frame: number, color: string) {
  for (const p of d.platforms) {
    ctx.fillStyle = '#334433';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#556655';
    ctx.fillRect(p.x, p.y, p.w, 2);
  }
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  const gp = Math.sin(frame * 0.1) * 2;
  ctx.arc(d.goal.x, d.goal.y + gp, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('★', d.goal.x, d.goal.y + gp + 3);
  for (const b of d.barrels) {
    ctx.fillStyle = '#884422';
    ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#664411';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#553311';
    ctx.fillRect(b.x - 3, b.y - 1, 6, 2);
  }
  ctx.fillStyle = color;
  ctx.fillRect(d.px - 4, d.py - 8, 8, 16);
  ctx.fillStyle = '#ddb888';
  ctx.beginPath(); ctx.arc(d.px, d.py - 11, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.font = '9px "Fira Code", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`LVL ${d.level}`, 315, 14);
}

// ═══════════════════════════════════════════════════════════════════════════
// NEON BREAKER
// ═══════════════════════════════════════════════════════════════════════════
function initBreaker() {
  const bricks: { x: number; y: number; w: number; h: number; alive: boolean; color: string }[] = [];
  const colors = ['#ff4444', '#ff8844', '#ffcc00', '#44ff44', '#4488ff', '#ff44ff'];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 10; col++) {
      bricks.push({ x: 10 + col * 30, y: 25 + row * 14, w: 28, h: 12, alive: true, color: colors[row] });
    }
  }
  return {
    px: 160, padW: 40,
    bx: 160, by: 200, bdx: 1.8, bdy: -2,
    bricks,
    score: 0, alive: true, ballActive: true,
  };
}

function updateBreaker(d: any, keys: Set<string>, w: number, _h: number) {
  if (!d.alive) return { score: d.score, gameOver: true };
  if (keys.has('arrowleft') || keys.has('a')) d.px = Math.max(d.padW / 2, d.px - 4);
  if (keys.has('arrowright') || keys.has('d')) d.px = Math.min(w - d.padW / 2, d.px + 4);
  if (!d.ballActive) return { score: d.score };
  d.bx += d.bdx;
  d.by += d.bdy;
  if (d.bx < 4 || d.bx > w - 4) d.bdx *= -1;
  if (d.by < 4) d.bdy = Math.abs(d.bdy);
  if (d.by > 232) {
    d.alive = false;
    return { score: d.score, gameOver: true };
  }
  if (d.by > 218 && d.by < 226 && d.bx > d.px - d.padW / 2 - 3 && d.bx < d.px + d.padW / 2 + 3) {
    d.bdy = -Math.abs(d.bdy);
    const offset = (d.bx - d.px) / (d.padW / 2);
    d.bdx = offset * 3;
    const speed = Math.sqrt(d.bdx * d.bdx + d.bdy * d.bdy);
    const targetSpeed = Math.min(4, 2.5 + d.score * 0.002);
    d.bdx = (d.bdx / speed) * targetSpeed;
    d.bdy = (d.bdy / speed) * targetSpeed;
  }
  for (const brick of d.bricks) {
    if (!brick.alive) continue;
    if (d.bx > brick.x - 3 && d.bx < brick.x + brick.w + 3 && d.by > brick.y - 3 && d.by < brick.y + brick.h + 3) {
      brick.alive = false;
      d.score += 10;
      const bCx = brick.x + brick.w / 2, bCy = brick.y + brick.h / 2;
      if (Math.abs(d.bx - bCx) / brick.w > Math.abs(d.by - bCy) / brick.h) d.bdx *= -1;
      else d.bdy *= -1;
      break;
    }
  }
  if (d.bricks.every((b: any) => !b.alive)) {
    const colors = ['#ff4444', '#ff8844', '#ffcc00', '#44ff44', '#4488ff', '#ff44ff'];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 10; col++) {
        d.bricks.push({ x: 10 + col * 30, y: 25 + row * 14, w: 28, h: 12, alive: true, color: colors[row] });
      }
    }
    d.score += 200;
  }
  return { score: d.score };
}

function renderBreaker(ctx: CanvasRenderingContext2D, d: any, w: number, _h: number, frame: number, color: string) {
  for (const b of d.bricks) {
    if (!b.alive) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(b.x, b.y, b.w, 2);
  }
  ctx.fillStyle = color;
  ctx.fillRect(d.px - d.padW / 2, 222, d.padW, 6);
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(d.px - d.padW / 2, 222, d.padW, 2);
  const pulse = 0.8 + Math.sin(frame * 0.2) * 0.2;
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  ctx.beginPath(); ctx.arc(d.bx, d.by, 3, 0, Math.PI * 2); ctx.fill();
}
