export const REC_GAME_IDS = ["arcade", "pool", "air-hockey", "foosball", "shuffleboard", "bowling", "darts"] as const;
export type RecGameId = (typeof REC_GAME_IDS)[number];

export const CLASSIC_ARCADE_GAME_IDS = ["cyber_serpent", "void_invaders", "barrel_runner", "neon_breaker"] as const;
export type ClassicArcadeGameId = (typeof CLASSIC_ARCADE_GAME_IDS)[number];

export function isClassicArcadeGameId(value: unknown): value is ClassicArcadeGameId {
  return typeof value === "string" && (CLASSIC_ARCADE_GAME_IDS as readonly string[]).includes(value);
}

export const CLASSIC_ARCADE_PRICES: Record<ClassicArcadeGameId, number> = {
  cyber_serpent: 10,
  void_invaders: 25,
  barrel_runner: 50,
  neon_breaker: 100,
};

export function getClassicArcadePrice(gameId: ClassicArcadeGameId): number {
  return CLASSIC_ARCADE_PRICES[gameId];
}

export const REC_GAMES: Record<RecGameId, { name: string; staminaCost: number; verb: string }> = {
  arcade: { name: "Neon Arcade", staminaCost: 8, verb: "RUN CIRCUIT" },
  pool: { name: "Pool", staminaCost: 5, verb: "TAKE SHOT" },
  "air-hockey": { name: "Air Hockey", staminaCost: 7, verb: "SERVE PUCK" },
  foosball: { name: "Foosball", staminaCost: 6, verb: "SPIN ATTACK" },
  shuffleboard: { name: "Shuffleboard", staminaCost: 4, verb: "SLIDE PUCK" },
  bowling: { name: "Bowling", staminaCost: 12, verb: "ROLL BALL" },
  darts: { name: "Darts", staminaCost: 5, verb: "THROW DARTS" },
};

export const REC_SPONSORS = [
  { id: "vendking", name: "VendKing", rewardBonus: 20, discountPct: 10 },
  { id: "pablo-power", name: "PABLO POWER", rewardBonus: 30, discountPct: 0 },
  { id: "banco-ombra", name: "Banco Ombra", rewardBonus: 50, discountPct: 0 },
] as const;

export type RecEffectKind = "orientation" | "color_shift" | "size_pulse" | "focus";
export type RecEffect = { kind: RecEffectKind; expiresAt: string; sourceItemId: string };
export type RecSession = { id: string; gameId: RecGameId; startedAt: string; sponsorId: string };
export type RecState = {
  stamina: number;
  staminaUpdatedAt: string;
  effects: RecEffect[];
  activeSession: RecSession | null;
  processed: string[];
  charges: Record<string, number>;
};

export const REC_ITEMS = [
  { id: "rec-lager", name: "LOCKDOWN LAGER", category: "alcoholic", price: 450, stamina: 8, effect: "orientation" as const, durationSec: 120 },
  { id: "rec-highball", name: "SHADOW HIGHBALL", category: "alcoholic", price: 700, stamina: 12, effect: "size_pulse" as const, durationSec: 90 },
  { id: "rec-mocktail", name: "NEON MOCKTAIL", category: "non_alcoholic", price: 400, stamina: 15, effect: "color_shift" as const, durationSec: 75 },
  { id: "rec-water", name: "MINERAL WATER", category: "non_alcoholic", price: 250, stamina: 10, effect: null, durationSec: 0 },
  { id: "rec-focus-tonic", name: "FOCUS TONIC", category: "non_alcoholic", price: 650, stamina: 20, effect: "focus" as const, durationSec: 90 },
  { id: "rec-charge-cell", name: "RECHARGE CELL", category: "rechargeable", price: 1_600, stamina: 30, effect: "color_shift" as const, durationSec: 45, maxCharges: 3 },
] as const;
export type RecItem = (typeof REC_ITEMS)[number];

export function findRecItem(id: string): RecItem | undefined {
  return REC_ITEMS.find((item) => item.id === id);
}
export function isRecGameId(value: unknown): value is RecGameId {
  return typeof value === "string" && (REC_GAME_IDS as readonly string[]).includes(value);
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function normalizeRecState(value: unknown, now = new Date()): RecState {
  const raw = value && typeof value === "object" ? value as Partial<RecState> : {};
  const updated = new Date(typeof raw.staminaUpdatedAt === "string" ? raw.staminaUpdatedAt : now.toISOString());
  const elapsed = Math.max(0, now.getTime() - (Number.isFinite(updated.getTime()) ? updated.getTime() : now.getTime()));
  const base = Number.isFinite(raw.stamina) ? Number(raw.stamina) : 100;
  const regenerated = Math.floor(elapsed / 30_000);
  return {
    stamina: clamp(Math.floor(base) + regenerated, 0, 100),
    staminaUpdatedAt: now.toISOString(),
    effects: Array.isArray(raw.effects)
      ? raw.effects.filter((effect): effect is RecEffect => !!effect && typeof effect.expiresAt === "string" && new Date(effect.expiresAt).getTime() > now.getTime())
      : [],
    activeSession: raw.activeSession && isRecGameId(raw.activeSession.gameId) ? raw.activeSession as RecSession : null,
    processed: Array.isArray(raw.processed) ? raw.processed.filter((id): id is string => typeof id === "string").slice(-80) : [],
    charges: raw.charges && typeof raw.charges === "object" ? { ...raw.charges } : {},
  };
}
function hash(input: string): number {
  let value = 2166136261;
  for (const char of input) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function settleRecGame(state: RecState, session: RecSession, requestId: string) {
  const game = REC_GAMES[session.gameId];
  if (state.stamina < game.staminaCost) return { ok: false as const, error: "insufficient_stamina" };
  const score = 40 + (hash(`${session.id}:${requestId}`) % 61);
  const sponsor = REC_SPONSORS.find((item) => item.id === session.sponsorId) ?? REC_SPONSORS[0];
  const rewardFiat = score >= 70 ? sponsor.rewardBonus + Math.floor(score / 2) : 0;
  state.stamina -= game.staminaCost;
  state.activeSession = null;
  state.processed = [...state.processed, requestId].slice(-80);
  return {
    ok: true as const, score, rewardFiat, sponsor,
    outcome: score >= 85 ? "JACKPOT" : score >= 70 ? "WIN" : score >= 50 ? "SOLID ROUND" : "MISSED",
  };
}