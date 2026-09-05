// GRAPHICS QUALITY knobs (Settings -> Display). These are the performance /
// presentation toggles that the city render loop must actually consume so a
// player on a slow device gets real relief. Each one mirrors the pattern set by
// lib/weather-quality.ts: a single, pure, unit-testable reader + helper so the
// behaviour can be verified without standing up the whole WorldPlay loop.
//
// Wired here:
//   - FPS cap          -> min interval between rendered frames (throttle)
//   - Resolution       -> backing-canvas DPR cap
//   - UI scale         -> HUD zoom factor (canvas is counter-zoomed to stay 1:1)
//   - Bloom / glow     -> gates the additive neon building-glow pass
//   - Cinematic bars   -> letterbox during the in-world story cinematic
//
// IMPORTANT: every default below reproduces the loop's *current* behaviour
// exactly, so a fresh/never-touched save renders byte-identical to before.

// Shared persistence key with Game/Settings.tsx + the audio store. This module
// only ever READS the blob (Settings owns writes), so it never clobbers the
// other keys living under the same key.
const STORE_KEY = 'sm_game_settings_v1';

function readBlob(): Record<string, unknown> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ── Low-graphics master switch ───────────────────────────────────────────────
// The global "Low graphics mode" toggle (lib/lowGfx) is persisted under its own
// key and is a master relief valve: when ON it forces the most expensive ambient
// passes off AND relaxes the heavy Display knobs (caps the frame rate at 60fps
// and the backing-canvas resolution at 1080p) regardless of the per-knob Display
// settings — but only ever LOWERING them, never raising a choice the player
// already made lighter. So flipping the one switch genuinely downgrades what's
// rendered instead of only toggling the <html> class, and turning it back off
// restores every saved choice. Read inline here (not via lib/lowGfx, which
// imports React) so these helpers stay pure + framework-free, mirroring
// readGfxQuality() in WorldPlay.
const LOW_GFX_KEY = 'salaryman_low_gfx';

export function lowGfxEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(LOW_GFX_KEY) === '1';
  } catch {
    return false;
  }
}

// ── FPS cap ─────────────────────────────────────────────────────────────────
// The render loop is otherwise uncapped (runs at the display's refresh rate).
// `0` means UNCAPPED. The default (120) is high enough that it never throttles a
// ≤120Hz display, so the common case is unchanged.
export type FpsCap = 30 | 60 | 120 | 0;
export const DEFAULT_FPS_CAP: FpsCap = 120;

export function normalizeFpsCap(v: unknown): FpsCap {
  return v === 30 || v === 60 || v === 0 || v === 120 ? v : DEFAULT_FPS_CAP;
}

// Raw saved FPS cap (ignores the low-graphics master switch). Settings reads
// this so the dropdown reflects the player's actual saved choice; the render
// loop consumes the capped value from readFpsCap().
export function readSavedFpsCap(): FpsCap {
  return normalizeFpsCap(readBlob().fpsCap);
}

// Render-load ordering: a HIGHER rank means a heavier loop (more rendered
// frames). Uncapped (`0`) is the heaviest; 30fps is the lightest.
const FPS_LOAD_RANK: Record<FpsCap, number> = { 30: 0, 60: 1, 120: 2, 0: 3 };
// Low-graphics caps the rendered frame rate at 60fps: a clear relief on a
// 120Hz/uncapped device while still feeling smooth. It can only ever LOWER the
// rate, never raise it — a player who already chose 30fps stays at 30.
const LOW_GFX_FPS_CAP: FpsCap = 60;

export function applyLowGfxFpsCap(cap: FpsCap, lowGfx: boolean): FpsCap {
  if (!lowGfx) return cap;
  return FPS_LOAD_RANK[cap] <= FPS_LOAD_RANK[LOW_GFX_FPS_CAP] ? cap : LOW_GFX_FPS_CAP;
}

// Effective FPS cap the render loop consumes: the saved choice, then capped by
// the global low-graphics switch.
export function readFpsCap(): FpsCap {
  return applyLowGfxFpsCap(readSavedFpsCap(), lowGfxEnabled());
}

// Minimum milliseconds that must elapse between two RENDERED frames for a given
// cap. `0` (uncapped) yields 0 — the loop never skips. A small tolerance is
// subtracted so a cap never accidentally drops a frame on a display running at
// (or just under) that same rate — e.g. a 60Hz panel choosing "60" still draws
// every vsync because 16.67ms RAF > (16.67 - tolerance).
export function frameIntervalForCap(cap: FpsCap, toleranceMs = 2): number {
  if (cap === 0) return 0;
  return Math.max(0, 1000 / cap - toleranceMs);
}

// ── Resolution ───────────────────────────────────────────────────────────────
// Caps the backing-canvas device-pixel-ratio. 'auto' = the loop's existing
// behaviour (native DPR clamped to 2). The fixed tiers cap the backing buffer
// height to the target so a small viewport renders fewer pixels (cheaper);
// a tall option still allows up to the native/2 ceiling.
export type Resolution = 'auto' | '720p' | '1080p' | '1440p';
export const DEFAULT_RESOLUTION: Resolution = 'auto';

const RES_TARGET_HEIGHT: Record<Exclude<Resolution, 'auto'>, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
};

export function normalizeResolution(v: unknown): Resolution {
  return v === '720p' || v === '1080p' || v === '1440p' ? v : DEFAULT_RESOLUTION;
}

// Raw saved resolution (ignores the low-graphics master switch). Settings reads
// this so the dropdown reflects the player's actual saved choice; the render
// loop consumes the capped value from readResolution().
export function readSavedResolution(): Resolution {
  return normalizeResolution(readBlob().resolution);
}

// Render-load ordering: a HIGHER rank means a heavier backing buffer (more
// pixels). 'auto' (native/2) is the heaviest; '720p' renders the fewest pixels.
const RES_LOAD_RANK: Record<Resolution, number> = { '720p': 0, '1080p': 1, '1440p': 2, auto: 3 };
// Low-graphics caps the backing-canvas resolution at 1080p: a meaningful pixel
// cut on a high-DPR phone while still looking crisp. It can only ever LOWER the
// resolution, never raise it — a player who already chose 720p stays at 720p.
const LOW_GFX_RESOLUTION_CAP: Resolution = '1080p';

export function applyLowGfxResolutionCap(res: Resolution, lowGfx: boolean): Resolution {
  if (!lowGfx) return res;
  return RES_LOAD_RANK[res] <= RES_LOAD_RANK[LOW_GFX_RESOLUTION_CAP] ? res : LOW_GFX_RESOLUTION_CAP;
}

// Effective resolution the render loop consumes: the saved choice, then capped
// by the global low-graphics switch.
export function readResolution(): Resolution {
  return applyLowGfxResolutionCap(readSavedResolution(), lowGfxEnabled());
}

// Effective device-pixel-ratio for the backing canvas. `nativeDpr` is
// window.devicePixelRatio; `cssHeight` is the canvas CSS height in px. Result is
// always clamped to a sane [0.5, 2] band so the buffer can never collapse to
// zero or blow past the historical ceiling.
export function effectiveDpr(res: Resolution, nativeDpr: number, cssHeight: number): number {
  const native = Number.isFinite(nativeDpr) && nativeDpr > 0 ? nativeDpr : 1;
  const ceil = Math.min(native, 2);
  if (res === 'auto') return ceil;
  const target = RES_TARGET_HEIGHT[res];
  if (!Number.isFinite(cssHeight) || cssHeight <= 0) return ceil;
  // Never UPSCALE past the native/2 ceiling — resolution is a relief valve.
  return Math.max(0.5, Math.min(ceil, target / cssHeight));
}

// ── UI scale ─────────────────────────────────────────────────────────────────
// Scales the HUD/overlay layer. Applied as CSS `zoom` on the game root, with the
// world canvas counter-zoomed (1/scale) so the rendered world stays 1:1. The
// default 1.0 is an exact no-op (zoom:1 on both).
export const DEFAULT_UI_SCALE = 1.0;
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.4;

export function normalizeUiScale(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_UI_SCALE;
  return Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, v));
}

export function readUiScale(): number {
  return normalizeUiScale(readBlob().uiScale);
}

// ── Bloom / glow ──────────────────────────────────────────────────────────────
// Gates the additive neon/fluorescent building-glow pass (the most expensive
// ambient lighting work). Default ON = current behaviour.
export const DEFAULT_BLOOM = true;

export function normalizeBloom(v: unknown): boolean {
  // Only an explicit `false` disables it; anything else keeps the rich default.
  return v !== false;
}

export function readBloomEnabled(): boolean {
  // Low-graphics mode forces the additive neon glow pass off outright, so the
  // toggle genuinely strips the most expensive ambient lighting work.
  if (lowGfxEnabled()) return false;
  return normalizeBloom(readBlob().bloom);
}

// ── Cinematic letterbox ───────────────────────────────────────────────────────
// Black bars framing the in-world story cinematic. Default ON matches the
// Settings label ("Black bars during cutscenes"). When off, no bars draw.
export const DEFAULT_CINEMATIC = true;

export function normalizeCinematic(v: unknown): boolean {
  return v !== false;
}

export function readCinematicLetterbox(): boolean {
  return normalizeCinematic(readBlob().cinematic);
}

// Height in px of each letterbox bar (top and bottom) for a given canvas height.
// ~7% per bar reads as a classic 2.35:1 framing without swallowing the HUD.
export function cinematicBarHeight(canvasHeight: number): number {
  if (!Number.isFinite(canvasHeight) || canvasHeight <= 0) return 0;
  return Math.round(canvasHeight * 0.07);
}
