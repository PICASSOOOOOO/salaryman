import { useMemo } from "react";

// Deterministic procedural pixel-art portrait for a Pixel Agent. Same seed
// (the bot slug) always produces the same face, so every agent has a stable,
// unique "face" with zero network cost — it renders instantly and never fails.
// The agents share one steel chassis so they read as a unified robot family,
// with eyes / mouth / antenna glowing in their division's accent color.

export interface PixelFaceTheme {
  base: string;
  baseDark: string;
  accent: string;
  accentDim: string;
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GW = 11;
const GH = 12;

// Cell codes: 0 empty · 1 base metal · 2 metal shadow · 4 accent glow · 5 accent dim
function buildFace(seed: string): number[][] {
  const rng = mulberry32(hashStr(seed));
  const g: number[][] = Array.from({ length: GH }, () => new Array(GW).fill(0));
  const sym = (r: number, c: number, v: number) => {
    if (r < 0 || r >= GH || c < 0 || c >= GW) return;
    g[r][c] = v;
    g[r][GW - 1 - c] = v;
  };

  // Head — rounded rect, cols 2..8, rows 1..8 (paint left half, mirror).
  const headTop = 1;
  const headBot = 8;
  const headLeft = 2;
  for (let r = headTop; r <= headBot; r++) {
    for (let c = headLeft; c <= 5; c++) sym(r, c, 1);
  }
  // Round the head corners.
  sym(headTop, headLeft, 0);
  sym(headBot, headLeft, 0);

  // Optional side "ears" / sensors.
  if (rng() < 0.6) {
    sym(4, 1, 2);
    sym(5, 1, 2);
  }

  // Shoulders / body block, rows 9..10, wider than head.
  const bodyTop = 9;
  const bodyBot = 10;
  const bodyLeft = 1;
  for (let r = bodyTop; r <= bodyBot; r++) {
    for (let c = bodyLeft; c <= 5; c++) sym(r, c, 1);
  }
  sym(bodyTop, bodyLeft, 0);

  // Paneled metallic shading on the head interior (symmetric).
  for (let r = headTop; r <= headBot; r++) {
    for (let c = headLeft; c <= 5; c++) {
      if (g[r][c] === 1 && rng() < 0.3) sym(r, c, 2);
    }
  }

  // Antenna.
  if (rng() < 0.7) {
    g[0][5] = 5;
  }

  // Eyes — either a single eye on each side or a full visor bar.
  const eyeRow = 4;
  if (rng() < 0.4) {
    for (let c = 3; c <= 5; c++) sym(eyeRow, c, 4); // visor
  } else {
    sym(eyeRow, 3, 4); // two eyes (mirrored)
    if (rng() < 0.35) sym(eyeRow, 2, 5); // brow accent
  }

  // Mouth / grille, row 6.
  const mouthRow = 6;
  const half = rng() < 0.5 ? 1 : 2;
  for (let c = 5 - half; c <= 5; c++) sym(mouthRow, c, 5);

  // Collar accent on the shoulders.
  if (rng() < 0.6) sym(bodyTop, 3, 5);

  return g;
}

export function PixelAgentFace({
  seed,
  theme,
  className,
}: {
  seed: string;
  theme: PixelFaceTheme;
  className?: string;
}) {
  const grid = useMemo(() => buildFace(seed), [seed]);
  const gid = useMemo(() => `agf-${hashStr(seed).toString(36)}`, [seed]);

  const color = (v: number): string => {
    switch (v) {
      case 1:
        return theme.base;
      case 2:
        return theme.baseDark;
      case 4:
        return theme.accent;
      case 5:
        return theme.accentDim;
      default:
        return "transparent";
    }
  };

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < GH; r++) {
    for (let c = 0; c < GW; c++) {
      const v = grid[r][c];
      if (v === 0) continue;
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={c}
          y={r}
          width={1.02}
          height={1.02}
          fill={color(v)}
          filter={v === 4 ? `url(#${gid})` : undefined}
        />,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${GW} ${GH}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Pixel agent portrait"
    >
      <defs>
        <filter id={gid} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.22" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`${gid}-bg`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={theme.accent} stopOpacity={0.28} />
          <stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={GW} height={GH} fill={`url(#${gid}-bg)`} />
      {rects}
    </svg>
  );
}

// Division (category) → display label, accent color, and a metal/glow theme for
// the face. One steel chassis across all agents; the division tints the glow.
const STEEL_BASE = "#c7d3e0";
const STEEL_DARK = "#74849a";

export interface DivisionMeta {
  label: string;
  accent: string; // tailwind-ish hex used for borders/glow
  theme: PixelFaceTheme;
}

function div(label: string, accent: string, accentDim: string): DivisionMeta {
  return {
    label,
    accent,
    theme: { base: STEEL_BASE, baseDark: STEEL_DARK, accent, accentDim },
  };
}

export const DIVISIONS: Record<string, DivisionMeta> = {
  core: div("Core Command", "#34d399", "#0f766e"),
  automation: div("Growth & Automation", "#a78bfa", "#6d28d9"),
  business: div("Business Development", "#fbbf24", "#b45309"),
  finance: div("Finance Desk", "#a3e635", "#4d7c0f"),
  creative: div("Creative Studio", "#f472b6", "#be185d"),
  trades: div("Trades & Service", "#fb923c", "#c2410c"),
  publishing: div("Publishing House", "#38bdf8", "#0369a1"),
  education: div("The Academy", "#22d3ee", "#0e7490"),
  professional: div("Legal & Professional", "#818cf8", "#4338ca"),
  ecommerce: div("Commerce Floor", "#fb7185", "#be123c"),
  productivity: div("Ops & Productivity", "#2dd4bf", "#0f766e"),
  personal: div("Lifestyle", "#c084fc", "#7e22ce"),
  healthcare: div("Health Bay", "#f87171", "#b91c1c"),
  gaming: div("Game World", "#4ade80", "#15803d"),
  insurance: div("Insurance Wing", "#60a5fa", "#1d4ed8"),
};

export const DIVISION_ORDER = [
  "core",
  "automation",
  "business",
  "finance",
  "creative",
  "professional",
  "ecommerce",
  "trades",
  "publishing",
  "education",
  "productivity",
  "healthcare",
  "personal",
  "insurance",
  "gaming",
];

export function divisionFor(category: string): DivisionMeta {
  return DIVISIONS[category] ?? div(category.toUpperCase(), "#94a3b8", "#475569");
}
