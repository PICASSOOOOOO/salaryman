// ── Shared player character identity ────────────────────────────────────────
// Single source of truth for the player's procedural paper-doll avatar: the
// Appearance schema, the free-baseline customization palettes, and the canvas
// draw routines. WorldPlay (the city), the office scenes, and the customizer
// preview all import from here so the SAME character renders identically
// everywhere. A premium "costume" item still overrides the outfit color when
// equipped — appearance is the foundation underneath.

export type Gender = 'm' | 'f' | 'nb';
export type HairStyle = 'short' | 'long' | 'mohawk' | 'bun' | 'bald' | 'bowl';
export type FaceStyle = 'plain' | 'shades' | 'scar' | 'beard' | 'visor' | 'cyber';
export type OutfitStyle = 'suit' | 'hoodie' | 'duster' | 'jumpsuit' | 'casual';

export interface Appearance {
  gender: Gender;
  skinTone: string;     // hex
  hairColor: string;    // hex
  hairStyle: HairStyle;
  faceStyle: FaceStyle;
  outfitStyle: OutfitStyle;
  outfitColor: string;  // hex (used when no premium costume equipped)
}

export const APPEARANCE_SKIN_TONES: { id: string; label: string; hex: string }[] = [
  { id: 'porcelain', label: 'PORCELAIN', hex: '#f0d4b8' },
  { id: 'fair',      label: 'FAIR',      hex: '#e8c4a0' },
  { id: 'tan',       label: 'TAN',       hex: '#d4a878' },
  { id: 'olive',     label: 'OLIVE',     hex: '#c4956a' },
  { id: 'bronze',    label: 'BRONZE',    hex: '#b07848' },
  { id: 'umber',     label: 'UMBER',     hex: '#8a5a3a' },
  { id: 'sienna',    label: 'SIENNA',    hex: '#6a4028' },
  { id: 'ebony',     label: 'EBONY',     hex: '#3e2616' },
];
export const APPEARANCE_HAIR_COLORS: { id: string; label: string; hex: string }[] = [
  { id: 'black',     label: 'JET BLACK', hex: '#0a0a0a' },
  { id: 'darkbrown', label: 'DARK BROWN',hex: '#2a1808' },
  { id: 'brown',     label: 'BROWN',     hex: '#5a3a18' },
  { id: 'auburn',    label: 'AUBURN',    hex: '#7a3a18' },
  { id: 'blonde',    label: 'BLONDE',    hex: '#d4b070' },
  { id: 'platinum',  label: 'PLATINUM',  hex: '#e8e4d8' },
  { id: 'silver',    label: 'SILVER',    hex: '#9a9a9a' },
  { id: 'red',       label: 'RED',       hex: '#a83020' },
  { id: 'magenta',   label: 'MAGENTA',   hex: '#c244aa' },
  { id: 'cyan',      label: 'CYAN',      hex: '#2acccc' },
  { id: 'electric',  label: 'ELECTRIC',  hex: '#56e8ff' },
];
export const APPEARANCE_OUTFIT_COLORS: { id: string; label: string; hex: string }[] = [
  { id: 'graphite', label: 'GRAPHITE', hex: '#2e2e2e' },
  { id: 'navy',     label: 'NAVY',     hex: '#1e3055' },
  { id: 'forest',   label: 'FOREST',   hex: '#2a4a28' },
  { id: 'sand',     label: 'SAND',     hex: '#7a6238' },
  { id: 'rust',     label: 'RUST',     hex: '#7a3a18' },
  { id: 'oxblood',  label: 'OXBLOOD',  hex: '#5a1a1a' },
  { id: 'plum',     label: 'PLUM',     hex: '#3a1a3a' },
  { id: 'teal',     label: 'TEAL',     hex: '#1a4a4a' },
  { id: 'pearl',    label: 'PEARL',    hex: '#cfcabd' },
  { id: 'neon',     label: 'NEON',     hex: '#38bdf8' },
];
export const APPEARANCE_HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short',  label: 'SHORT'  },
  { id: 'long',   label: 'LONG'   },
  { id: 'mohawk', label: 'MOHAWK' },
  { id: 'bun',    label: 'BUN'    },
  { id: 'bowl',   label: 'BOWL'   },
  { id: 'bald',   label: 'BALD'   },
];
export const APPEARANCE_FACE_STYLES: { id: FaceStyle; label: string }[] = [
  { id: 'plain',  label: 'PLAIN'  },
  { id: 'shades', label: 'SHADES' },
  { id: 'visor',  label: 'VISOR'  },
  { id: 'scar',   label: 'SCAR'   },
  { id: 'beard',  label: 'BEARD'  },
  { id: 'cyber',  label: 'CYBER EYE' },
];
export const APPEARANCE_OUTFIT_STYLES: { id: OutfitStyle; label: string }[] = [
  { id: 'suit',     label: 'SUIT'     },
  { id: 'hoodie',   label: 'HOODIE'   },
  { id: 'duster',   label: 'DUSTER'   },
  { id: 'jumpsuit', label: 'JUMPSUIT' },
  { id: 'casual',   label: 'CASUAL'   },
];
export const APPEARANCE_GENDERS: { id: Gender; label: string }[] = [
  { id: 'm',  label: 'MASC' },
  { id: 'f',  label: 'FEMME' },
  { id: 'nb', label: 'NEUTRAL' },
];

export function defaultAppearance(charClass?: string): Appearance {
  const cls = (charClass ?? '').toLowerCase();
  const outfitStyle: OutfitStyle =
    cls === 'corporate' ? 'suit' :
    cls === 'outlaw'    ? 'duster' :
    cls === 'replicant' ? 'hoodie' : 'casual';
  const outfitColor =
    cls === 'corporate' ? '#2e2e2e' :
    cls === 'outlaw'    ? '#6b4a28' :
    cls === 'replicant' ? '#3a4a5a' : '#556644';
  return {
    gender: 'nb',
    skinTone: '#d4906a',
    hairColor: '#1a1a1a',
    hairStyle: 'short',
    faceStyle: 'plain',
    outfitStyle,
    outfitColor,
  };
}

export function sanitizeAppearance(raw: unknown, charClass?: string): Appearance {
  const def = defaultAppearance(charClass);
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<Appearance>;
  const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
  return {
    gender:      (['m','f','nb'] as const).includes(r.gender as Gender) ? r.gender as Gender : def.gender,
    skinTone:    isHex(r.skinTone)    ? r.skinTone    : def.skinTone,
    hairColor:   isHex(r.hairColor)   ? r.hairColor   : def.hairColor,
    hairStyle:   APPEARANCE_HAIR_STYLES.some(h => h.id === r.hairStyle) ? r.hairStyle as HairStyle : def.hairStyle,
    faceStyle:   APPEARANCE_FACE_STYLES.some(f => f.id === r.faceStyle) ? r.faceStyle as FaceStyle : def.faceStyle,
    outfitStyle: APPEARANCE_OUTFIT_STYLES.some(o => o.id === r.outfitStyle) ? r.outfitStyle as OutfitStyle : def.outfitStyle,
    outfitColor: isHex(r.outfitColor) ? r.outfitColor : def.outfitColor,
  };
}

// Draws the player's hair on top of the head. Hair geometry sits at the same
// offsets the previous hardcoded "slick cut" used so the existing class
// outlines (corporate glasses, outlaw hat, etc.) still line up. Coords passed
// are the sprite anchor (head-center, foot Y).
export function drawPlayerHair(
  ctx: CanvasRenderingContext2D,
  cx: number,
  py2: number,
  style: HairStyle,
  hairCol: string,
): void {
  if (style === 'bald') return;
  ctx.fillStyle = hairCol;
  if (style === 'short') {
    ctx.fillRect(cx - 4, py2 - 19, 8, 4);
    ctx.beginPath(); ctx.arc(cx, py2 - 18, 3, Math.PI, 0); ctx.fill();
  } else if (style === 'long') {
    ctx.fillRect(cx - 4, py2 - 19, 8, 4);
    ctx.beginPath(); ctx.arc(cx, py2 - 18, 3, Math.PI, 0); ctx.fill();
    // Hair flowing past shoulders
    ctx.fillRect(cx - 5, py2 - 16, 2, 7);
    ctx.fillRect(cx + 3, py2 - 16, 2, 7);
  } else if (style === 'mohawk') {
    ctx.fillRect(cx - 1, py2 - 22, 2, 8);
    ctx.fillRect(cx - 4, py2 - 17, 8, 2);
  } else if (style === 'bun') {
    ctx.fillRect(cx - 4, py2 - 18, 8, 3);
    ctx.beginPath(); ctx.arc(cx, py2 - 21, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (style === 'bowl') {
    ctx.fillRect(cx - 5, py2 - 19, 10, 5);
    ctx.fillRect(cx - 4, py2 - 14, 8, 1);
  }
}

// Face overlay (drawn after eyes/mouth so it sits on top).
export function drawPlayerFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  py2: number,
  style: FaceStyle,
): void {
  if (style === 'plain') return;
  if (style === 'shades') {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(cx - 4, py2 - 16, 8, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - 3, py2 - 16, 1, 1);
    ctx.fillRect(cx + 2, py2 - 16, 1, 1);
  } else if (style === 'visor') {
    ctx.fillStyle = '#56e8ff';
    ctx.shadowColor = '#56e8ff'; ctx.shadowBlur = 4;
    ctx.fillRect(cx - 4, py2 - 16, 8, 2);
    ctx.shadowBlur = 0;
  } else if (style === 'scar') {
    ctx.strokeStyle = '#a83020'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 3, py2 - 16);
    ctx.lineTo(cx - 1, py2 - 11);
    ctx.stroke();
  } else if (style === 'beard') {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(cx - 3, py2 - 12, 6, 2);
    ctx.fillRect(cx - 4, py2 - 12, 1, 1);
    ctx.fillRect(cx + 3, py2 - 12, 1, 1);
  } else if (style === 'cyber') {
    // Glowing red right eye (Pablo would approve)
    ctx.fillStyle = '#ff2244';
    ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 4;
    ctx.fillRect(cx + 2, py2 - 15, 1, 1);
    ctx.shadowBlur = 0;
  }
}

// Draws the full standing player paper-doll (generic body + hair + face, plus
// the outlaw hat) at the given anchor. The caller is responsible for any
// translate/scale on the context first — the geometry is authored around a
// 32px-tall sprite with the anchor at head-center / foot Y. This is the exact
// body the customizer preview and the in-world default branch use, factored out
// so the office scene renders the same character. `costumeColor` overrides the
// outfit color when a premium costume is equipped.
export function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  appearance: Appearance,
  opts?: { costumeColor?: string | null; pCls?: string; px?: number; py?: number },
): void {
  const px = opts?.px ?? 0;
  const py2 = opts?.py ?? 0;
  const pCls = (opts?.pCls ?? '').toLowerCase();
  const skin = appearance.skinTone;
  const hairCol = appearance.hairColor;
  const body = opts?.costumeColor ?? appearance.outfitColor;

  // Generic body (mirrors the in-world default branch)
  ctx.fillStyle = '#3a2510'; ctx.fillRect(px - 5, py2 + 7, 3, 4); ctx.fillRect(px + 2, py2 + 7, 3, 4);
  ctx.fillStyle = '#2a3555'; ctx.fillRect(px - 4, py2 + 1, 3, 7); ctx.fillRect(px + 1, py2 + 1, 3, 7);
  ctx.fillStyle = '#665533'; ctx.fillRect(px - 5, py2 - 1, 10, 2);
  ctx.fillStyle = body; ctx.fillRect(px - 5, py2 - 8, 10, 8);
  ctx.fillStyle = body; ctx.fillRect(px - 8, py2 - 7, 3, 6); ctx.fillRect(px + 5, py2 - 7, 3, 6);
  ctx.fillStyle = skin; ctx.fillRect(px - 8, py2 - 1, 3, 2); ctx.fillRect(px + 5, py2 - 1, 3, 2);
  ctx.fillStyle = skin; ctx.fillRect(px - 1, py2 - 10, 3, 3);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(px, py2 - 14, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(px - 3, py2 - 15, 1, 1); ctx.fillRect(px + 2, py2 - 15, 1, 1);
  ctx.fillStyle = '#c87a55'; ctx.fillRect(px - 1, py2 - 11, 2, 1);

  drawPlayerHair(ctx, px, py2, appearance.hairStyle, hairCol);
  drawPlayerFace(ctx, px, py2, appearance.faceStyle);

  // Outlaw gets the hat
  if (pCls === 'outlaw') {
    ctx.fillStyle = '#5a3a18'; ctx.fillRect(px - 5, py2 - 19, 10, 5);
    ctx.fillStyle = '#6a4a25'; ctx.fillRect(px - 6, py2 - 14, 12, 2);
    ctx.fillStyle = '#4a2a10'; ctx.fillRect(px - 4, py2 - 21, 7, 3);
  }
}
