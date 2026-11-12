// ── Shared player character identity ────────────────────────────────────────
// Single source of truth for the player's procedural paper-doll avatar: the
// Appearance schema, the free-baseline customization palettes, and the canvas
// draw routines. WorldPlay (the city), the office scenes, and the customizer
// preview all import from here so the SAME character renders identically
// everywhere. A premium "costume" item still overrides the outfit color when
// equipped — appearance is the foundation underneath.

export type Gender = 'm' | 'f' | 'nb';
export type HairStyle =
  | 'short' | 'long' | 'mohawk' | 'bun' | 'bald' | 'bowl'
  | 'buzz' | 'spiky' | 'afro' | 'ponytail' | 'topknot' | 'undercut';
export type FaceStyle =
  | 'plain' | 'shades' | 'scar' | 'beard' | 'visor' | 'cyber'
  | 'mask' | 'mustache' | 'goatee' | 'eyepatch' | 'tattoo' | 'freckles';
export type OutfitStyle =
  | 'suit' | 'dress' | 'hoodie' | 'duster' | 'jumpsuit' | 'casual'
  | 'trench' | 'tank' | 'kimono' | 'labcoat' | 'vest';

export interface Appearance {
  gender: Gender;
  skinTone: string;     // hex
  hairColor: string;    // hex
  hairStyle: HairStyle;
  faceStyle: FaceStyle;
  outfitStyle: OutfitStyle;
  outfitColor: string;  // hex (used when no premium costume equipped)
  // Optional AI-generated character portrait (painted "real life" avatar made
  // from the player's uploaded photo). Stored as an "/objects/..." path (or an
  // absolute URL). The pixel paper-doll above is still the in-world sprite; this
  // is the high-fidelity headshot shown in UI surfaces (builder, profile, HUD).
  portraitUrl?: string;
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
  { id: 'rose',      label: 'ROSE',      hex: '#e8b0a0' },
  { id: 'golden',    label: 'GOLDEN',    hex: '#caa05a' },
  { id: 'ashen',     label: 'ASHEN',     hex: '#b8b0a8' },
  { id: 'synth',     label: 'SYNTH',     hex: '#9cb4c0' },
  { id: 'pallid',    label: 'PALLID',    hex: '#c8c4d0' },
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
  { id: 'white',     label: 'WHITE',     hex: '#ece8e0' },
  { id: 'emerald',   label: 'EMERALD',   hex: '#27a060' },
  { id: 'violet',    label: 'VIOLET',    hex: '#8a52d8' },
  { id: 'pink',      label: 'PINK',      hex: '#e87ab0' },
  { id: 'tangerine', label: 'TANGERINE', hex: '#e07a2a' },
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
  { id: 'crimson',  label: 'CRIMSON',  hex: '#8a1e2a' },
  { id: 'gold',     label: 'GOLD',     hex: '#b8902e' },
  { id: 'violet',   label: 'VIOLET',   hex: '#4a2a6a' },
  { id: 'ice',      label: 'ICE',      hex: '#8aa8c0' },
  { id: 'mint',     label: 'MINT',     hex: '#3a7a5a' },
  { id: 'ember',    label: 'EMBER',    hex: '#a8521e' },
];
export const APPEARANCE_HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short',     label: 'SHORT'     },
  { id: 'long',      label: 'LONG'      },
  { id: 'mohawk',    label: 'MOHAWK'    },
  { id: 'bun',       label: 'BUN'       },
  { id: 'bowl',      label: 'BOWL'      },
  { id: 'bald',      label: 'BALD'      },
  { id: 'buzz',      label: 'BUZZ'      },
  { id: 'spiky',     label: 'SPIKY'     },
  { id: 'afro',      label: 'AFRO'      },
  { id: 'ponytail',  label: 'PONYTAIL'  },
  { id: 'topknot',   label: 'TOPKNOT'   },
  { id: 'undercut',  label: 'UNDERCUT'  },
];
export const APPEARANCE_FACE_STYLES: { id: FaceStyle; label: string }[] = [
  { id: 'plain',     label: 'PLAIN'     },
  { id: 'shades',    label: 'SHADES'    },
  { id: 'visor',     label: 'VISOR'     },
  { id: 'scar',      label: 'SCAR'      },
  { id: 'beard',     label: 'BEARD'     },
  { id: 'cyber',     label: 'CYBER EYE' },
  { id: 'mask',      label: 'RESPIRATOR'},
  { id: 'mustache',  label: 'MUSTACHE'  },
  { id: 'goatee',    label: 'GOATEE'    },
  { id: 'eyepatch',  label: 'EYEPATCH'  },
  { id: 'tattoo',    label: 'FACE TATTOO' },
  { id: 'freckles',  label: 'FRECKLES'  },
];
export const APPEARANCE_OUTFIT_STYLES: { id: OutfitStyle; label: string }[] = [
  { id: 'suit',     label: 'SUIT'     },
  { id: 'dress',    label: 'BIZ DRESS' },
  { id: 'hoodie',   label: 'HOODIE'   },
  { id: 'duster',   label: 'DUSTER'   },
  { id: 'jumpsuit', label: 'JUMPSUIT' },
  { id: 'casual',   label: 'CASUAL'   },
  { id: 'trench',   label: 'TRENCH'   },
  { id: 'tank',     label: 'TANK'     },
  { id: 'kimono',   label: 'KIMONO'   },
  { id: 'labcoat',  label: 'LAB COAT' },
  { id: 'vest',     label: 'VEST'     },
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
  // Preserve a generated portrait reference (object path or absolute URL); drop
  // anything that isn't a plausible image location so the save blob can't smuggle
  // a javascript:/data: payload into an <img src>.
  const portraitUrl =
    typeof r.portraitUrl === 'string' && /^(\/objects\/|https?:\/\/)/.test(r.portraitUrl)
      ? r.portraitUrl
      : undefined;
  return {
    gender:      (['m','f','nb'] as const).includes(r.gender as Gender) ? r.gender as Gender : def.gender,
    skinTone:    isHex(r.skinTone)    ? r.skinTone    : def.skinTone,
    hairColor:   isHex(r.hairColor)   ? r.hairColor   : def.hairColor,
    hairStyle:   APPEARANCE_HAIR_STYLES.some(h => h.id === r.hairStyle) ? r.hairStyle as HairStyle : def.hairStyle,
    faceStyle:   APPEARANCE_FACE_STYLES.some(f => f.id === r.faceStyle) ? r.faceStyle as FaceStyle : def.faceStyle,
    outfitStyle: APPEARANCE_OUTFIT_STYLES.some(o => o.id === r.outfitStyle) ? r.outfitStyle as OutfitStyle : def.outfitStyle,
    outfitColor: isHex(r.outfitColor) ? r.outfitColor : def.outfitColor,
    ...(portraitUrl ? { portraitUrl } : {}),
  };
}

// ── Character templates & faction garb ──────────────────────────────────────
// Character creation is framed around three TEMPLATES — Replicant, Woman, Man —
// each of which spawns in faction-appropriate garb. A template is a *derived
// view* over the persisted identity (body gender + replicant-ness), NOT a new
// stored field, so every existing save maps onto a template automatically (see
// templateFromAppearance) and nothing about the save schema changes.
export type CharacterTemplate = 'replicant' | 'woman' | 'man';
export type Faction = 'suit' | 'nomad' | 'replicant';

export const CHARACTER_TEMPLATES: { id: CharacterTemplate; label: string; desc: string }[] = [
  { id: 'man',       label: 'SALARYMAN',   desc: 'Standard build. Spawns in your faction\u2019s default kit.' },
  { id: 'woman',     label: 'SALARYWOMAN', desc: 'Standard build. Spawns in your faction\u2019s default kit.' },
  { id: 'replicant', label: 'REPLICANT',   desc: 'Synthetic build. Sleek faction-tuned synth wear.' },
];

const FACTION_VALUES: Faction[] = ['suit', 'nomad', 'replicant'];
export function asFaction(raw: unknown): Faction {
  return FACTION_VALUES.includes(raw as Faction) ? raw as Faction : 'suit';
}

// Template -> paper-doll body gender. Replicant reads as androgynous/neutral.
export function templateGender(t: CharacterTemplate): Gender {
  return t === 'woman' ? 'f' : t === 'man' ? 'm' : 'nb';
}

// Default starting garb (silhouette + color) for every template x faction combo.
// This is the "faction-dependent default garb" the player spawns in. Corporate
// (suit faction) defaults already satisfy the office dress code; the others are
// deliberately casual so the work-floor swap is visible.
export function factionGarb(template: CharacterTemplate, faction: Faction): { outfitStyle: OutfitStyle; outfitColor: string } {
  if (template === 'replicant') {
    switch (faction) {
      case 'suit':      return { outfitStyle: 'suit',     outfitColor: '#2a3540' }; // corporate synth — steel suit
      case 'nomad':     return { outfitStyle: 'jumpsuit', outfitColor: '#7a3a18' }; // rogue synth — rust rig
      case 'replicant': return { outfitStyle: 'jumpsuit', outfitColor: '#8aa8c0' }; // off-grid synth — ice rig
    }
  }
  const femme = template === 'woman';
  switch (faction) {
    case 'suit':      return femme ? { outfitStyle: 'dress',  outfitColor: '#1e3055' } : { outfitStyle: 'suit',   outfitColor: '#2e2e2e' };
    case 'nomad':     return femme ? { outfitStyle: 'trench', outfitColor: '#7a6238' } : { outfitStyle: 'duster', outfitColor: '#7a3a18' };
    case 'replicant': return { outfitStyle: 'jumpsuit', outfitColor: '#1a4a4a' };
  }
  return { outfitStyle: 'suit', outfitColor: '#2e2e2e' };
}

// Derive the template a saved character maps onto, from existing data. Replicant
// identity (faction or legacy charClass) wins; otherwise the body gender decides
// Woman vs Man (neutral bodies default to Man). Lets old saves load coherently
// without ever storing a template field.
export function templateFromAppearance(a: Appearance | undefined, charClass?: string, faction?: string): CharacterTemplate {
  const cls = (charClass ?? '').toLowerCase();
  if (faction === 'replicant' || cls === 'replicant') return 'replicant';
  if (a?.gender === 'f') return 'woman';
  return 'man';
}

// Produce a new appearance that adopts a template + faction: sets the body gender
// and the faction-default garb. Skin / hair / face customization is preserved.
export function applyTemplateGarb(a: Appearance, template: CharacterTemplate, faction: Faction): Appearance {
  const garb = factionGarb(template, faction);
  return { ...a, gender: templateGender(template), outfitStyle: garb.outfitStyle, outfitColor: garb.outfitColor };
}

// The skin / hair / face hints a ready-made character template carries so the
// in-world pixel sprite resembles the rendered realistic portrait. All fields
// optional + validated against the palettes before they're applied.
export interface TemplateLook {
  skinTone?: string;
  hairColor?: string;
  hairStyle?: string;
  faceStyle?: string;
  outfitStyle?: string;
  outfitColor?: string;
}

// Adopt a full ready-made character template: body gender + faction garb (via
// applyTemplateGarb) PLUS the template's skin/hair/face look hints. Hints are
// validated against the palettes so a bad/garbage hint degrades to the current
// value rather than corrupting the appearance. portraitUrl is NOT set here — the
// caller sets it from the rendered art when ready (and clears it otherwise).
export function applyCharacterTemplate(
  a: Appearance,
  template: CharacterTemplate,
  faction: Faction,
  look?: TemplateLook,
): Appearance {
  const next = applyTemplateGarb(a, template, faction);
  if (!look) return next;
  const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
  if (isHex(look.skinTone)) next.skinTone = look.skinTone;
  if (isHex(look.hairColor)) next.hairColor = look.hairColor;
  if (look.hairStyle && APPEARANCE_HAIR_STYLES.some(h => h.id === look.hairStyle)) next.hairStyle = look.hairStyle as HairStyle;
  if (look.faceStyle && APPEARANCE_FACE_STYLES.some(f => f.id === look.faceStyle)) next.faceStyle = look.faceStyle as FaceStyle;
  if (look.outfitStyle && APPEARANCE_OUTFIT_STYLES.some(o => o.id === look.outfitStyle)) next.outfitStyle = look.outfitStyle as OutfitStyle;
  if (isHex(look.outfitColor)) next.outfitColor = look.outfitColor;
  return next;
}

// ── Work dress code ─────────────────────────────────────────────────────────
// On office floors / while working, the character must present in business
// attire — a suit or a business dress. Enforcement is CONTEXTUAL: callers swap
// to work attire only for the work surface and keep the player's chosen outfit
// everywhere else. The swap must NEVER be persisted back into the save.
export const WORK_OUTFITS: ReadonlySet<OutfitStyle> = new Set<OutfitStyle>(['suit', 'dress']);

export function isWorkAppropriate(a: Appearance): boolean {
  return WORK_OUTFITS.has(a.outfitStyle);
}

// The business silhouette this character should wear at work: a business dress
// for femme bodies, otherwise a suit. Color is preserved (identity continuity).
export function workOutfitStyle(a: Appearance): OutfitStyle {
  return a.gender === 'f' ? 'dress' : 'suit';
}

// Returns a work-appropriate copy of the appearance when it isn't already; the
// SAME object is returned unchanged when it already passes the dress code, so
// callers can cheaply detect "no swap happened" via identity comparison.
export function toWorkAttire(a: Appearance): Appearance {
  if (isWorkAppropriate(a)) return a;
  return { ...a, outfitStyle: workOutfitStyle(a) };
}

// Mila — the player's story-issued replicant companion. She reuses the SAME
// paper-doll body as the player (so she renders identically everywhere) but
// carries a fixed aqua/teal identity that matches her Nebula orb + voice. Her
// `outfitColor` is overridable so a purchased outfit can re-dress her; pass the
// equipped clothes' tint as `outfitColor` to change what she's wearing.
export function milaAppearance(outfitColor?: string): Appearance {
  return {
    gender: 'f',
    skinTone: '#e8c4a0',
    hairColor: '#2acccc',   // teal — her signature
    hairStyle: 'long',
    faceStyle: 'visor',     // soft cyan visor reads as "replicant"
    outfitStyle: 'suit',
    outfitColor: outfitColor && /^#[0-9a-fA-F]{3,8}$/.test(outfitColor) ? outfitColor : '#1a4a4a',
  };
}

// Representative tint for each Armory "outfit" catalog item, so a purchased
// suit/dress can re-colour a paper-doll body (the player's avatar already gets
// a rarity tint from drawGearOutfit; Mila uses these directly). Keyed by the
// catalog item id in api-server/src/lib/item-catalog.ts. Unknown ids -> her
// default teal via milaAppearance.
export const CLOTH_OUTFIT_COLORS: Record<string, string> = {
  cloth_jumpsuit: '#5a5a5a',
  cloth_pinstripe: '#2e2e3a',
  cloth_trench: '#3a3228',
  cloth_exec: '#1e1e2e',
  cloth_nanoweave: '#2a3540',
  cloth_gold_pinstripe: '#b8902e',
  cloth_sundress: '#c98fae',
  cloth_cocktail: '#5a1a3a',
  cloth_qipao: '#b81e4a',
  cloth_evening_gown: '#2a1a4a',
  cloth_couture_gown: '#1a4a4a',
};

export function clothOutfitColor(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return CLOTH_OUTFIT_COLORS[id];
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
  } else if (style === 'buzz') {
    // Close-cropped cap hugging the scalp.
    ctx.fillRect(cx - 4, py2 - 19, 8, 3);
  } else if (style === 'spiky') {
    // Row of upward spikes.
    ctx.fillRect(cx - 4, py2 - 18, 8, 3);
    for (let i = -3; i <= 3; i += 2) {
      ctx.beginPath();
      ctx.moveTo(cx + i, py2 - 18);
      ctx.lineTo(cx + i + 1, py2 - 23);
      ctx.lineTo(cx + i + 2, py2 - 18);
      ctx.closePath(); ctx.fill();
    }
  } else if (style === 'afro') {
    // Big rounded volume around the head.
    ctx.beginPath(); ctx.arc(cx, py2 - 18, 6, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - 6, py2 - 18, 12, 3);
  } else if (style === 'ponytail') {
    // Pulled-back top + a tail trailing down the back.
    ctx.fillRect(cx - 4, py2 - 19, 8, 4);
    ctx.beginPath(); ctx.arc(cx, py2 - 18, 3, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx + 3, py2 - 16, 2, 9);
  } else if (style === 'topknot') {
    // Tied bun sitting high and centered.
    ctx.fillRect(cx - 4, py2 - 18, 8, 3);
    ctx.beginPath(); ctx.arc(cx, py2 - 22, 2, 0, Math.PI * 2); ctx.fill();
  } else if (style === 'undercut') {
    // Volume on top, shaved sides (gap between cap and temples).
    ctx.fillRect(cx - 3, py2 - 21, 6, 5);
    ctx.fillRect(cx - 4, py2 - 18, 8, 1);
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
  } else if (style === 'mask') {
    // Respirator covering the lower face.
    ctx.fillStyle = '#3a4654';
    ctx.fillRect(cx - 4, py2 - 13, 8, 4);
    ctx.fillStyle = '#222a33';
    ctx.fillRect(cx - 1, py2 - 11, 2, 2);
  } else if (style === 'mustache') {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(cx - 3, py2 - 12, 6, 1);
  } else if (style === 'goatee') {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(cx - 2, py2 - 11, 4, 1);
    ctx.fillRect(cx - 1, py2 - 10, 2, 2);
  } else if (style === 'eyepatch') {
    // Black patch over the left eye + strap.
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(cx - 4, py2 - 16, 3, 3);
    ctx.fillRect(cx - 4, py2 - 17, 8, 1);
  } else if (style === 'tattoo') {
    // Small magenta mark on the cheek.
    ctx.fillStyle = '#c244aa';
    ctx.fillRect(cx + 2, py2 - 13, 1, 2);
    ctx.fillRect(cx + 1, py2 - 12, 1, 1);
  } else if (style === 'freckles') {
    ctx.fillStyle = 'rgba(150,80,50,0.55)';
    ctx.fillRect(cx - 3, py2 - 13, 1, 1);
    ctx.fillRect(cx - 1, py2 - 12, 1, 1);
    ctx.fillRect(cx + 2, py2 - 13, 1, 1);
  }
}

// Outfit-style accent overlay — drawn ON TOP of the body so a player's chosen
// outfit silhouette reads regardless of class. Additive only (it layers small
// collars / lapels / seams), so it composes with the class body art and any
// equipped costume/gear without erasing them. Used by drawPlayerSprite AND the
// in-world walking sprite so the look is identical everywhere.
function shadeHex(hex: string, amt: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) + amt);
  const g = cl(((n >> 8) & 255) + amt);
  const b = cl((n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

export function drawPlayerOutfit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  py2: number,
  style: OutfitStyle,
  outfitColor: string,
): void {
  const dark = shadeHex(outfitColor, -36);
  const light = shadeHex(outfitColor, 48);
  if (style === 'suit') {
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(cx - 1, py2 - 7, 2, 2);
    ctx.fillStyle = '#a82828'; ctx.fillRect(cx - 1, py2 - 5, 2, 4);
    ctx.fillStyle = dark; ctx.fillRect(cx - 4, py2 - 8, 2, 4); ctx.fillRect(cx + 2, py2 - 8, 2, 4);
  } else if (style === 'dress') {
    // Business dress: tailored neckline + structured shoulders, then a flared
    // skirt over the hips so it reads as a skirt-suit rather than trousers.
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(cx - 1, py2 - 7, 2, 2);
    ctx.fillStyle = dark; ctx.fillRect(cx - 4, py2 - 8, 2, 4); ctx.fillRect(cx + 2, py2 - 8, 2, 4);
    ctx.fillStyle = outfitColor;
    ctx.beginPath();
    ctx.moveTo(cx - 3, py2 - 1); ctx.lineTo(cx + 3, py2 - 1);
    ctx.lineTo(cx + 5, py2 + 5); ctx.lineTo(cx - 5, py2 + 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark; ctx.fillRect(cx - 5, py2 + 5, 10, 1);
    ctx.fillStyle = light; ctx.fillRect(cx - 1, py2, 2, 4);
  } else if (style === 'hoodie') {
    ctx.fillStyle = dark; ctx.fillRect(cx - 4, py2 - 8, 8, 2);
    ctx.fillStyle = light; ctx.fillRect(cx - 2, py2 - 6, 1, 4); ctx.fillRect(cx + 1, py2 - 6, 1, 4);
  } else if (style === 'duster') {
    ctx.fillStyle = dark; ctx.fillRect(cx - 1, py2 - 7, 1, 7);
    ctx.fillRect(cx - 5, py2 - 1, 10, 1);
  } else if (style === 'jumpsuit') {
    ctx.fillStyle = light; ctx.fillRect(cx - 1, py2 - 7, 1, 6);
    ctx.fillStyle = dark; ctx.fillRect(cx - 5, py2 - 2, 10, 1);
  } else if (style === 'casual') {
    ctx.fillStyle = light; ctx.fillRect(cx - 2, py2 - 8, 4, 1);
  } else if (style === 'trench') {
    ctx.fillStyle = dark; ctx.fillRect(cx - 5, py2 - 8, 2, 8);
    ctx.fillStyle = light; ctx.fillRect(cx - 2, py2 - 3, 4, 1);
    ctx.fillStyle = dark; ctx.fillRect(cx - 3, py2 - 6, 1, 1); ctx.fillRect(cx + 2, py2 - 6, 1, 1);
  } else if (style === 'tank') {
    ctx.fillStyle = dark; ctx.fillRect(cx - 3, py2 - 8, 1, 5); ctx.fillRect(cx + 2, py2 - 8, 1, 5);
  } else if (style === 'kimono') {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(cx - 5, py2 - 8); ctx.lineTo(cx + 5, py2 - 4);
    ctx.lineTo(cx + 5, py2 - 2); ctx.lineTo(cx - 5, py2 - 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = light; ctx.fillRect(cx - 5, py2 - 2, 10, 1);
  } else if (style === 'labcoat') {
    ctx.fillStyle = '#e8eef2'; ctx.fillRect(cx - 5, py2 - 8, 2, 8); ctx.fillRect(cx + 3, py2 - 8, 2, 8);
    ctx.fillStyle = '#c0ccd4'; ctx.fillRect(cx - 3, py2 - 6, 1, 1); ctx.fillRect(cx - 3, py2 - 4, 1, 1);
  } else if (style === 'vest') {
    ctx.fillStyle = light; ctx.fillRect(cx - 1, py2 - 7, 2, 6);
    ctx.fillStyle = dark; ctx.fillRect(cx - 4, py2 - 8, 2, 7); ctx.fillRect(cx + 2, py2 - 8, 2, 7);
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

  // Outfit-style accent sits on the torso, under the hair/hat overlays.
  drawPlayerOutfit(ctx, px, py2, appearance.outfitStyle, body);

  drawPlayerHair(ctx, px, py2, appearance.hairStyle, hairCol);
  drawPlayerFace(ctx, px, py2, appearance.faceStyle);

  // Outlaw gets the hat
  if (pCls === 'outlaw') {
    ctx.fillStyle = '#5a3a18'; ctx.fillRect(px - 5, py2 - 19, 10, 5);
    ctx.fillStyle = '#6a4a25'; ctx.fillRect(px - 6, py2 - 14, 12, 2);
    ctx.fillStyle = '#4a2a10'; ctx.fillRect(px - 4, py2 - 21, 7, 3);
  }
}
