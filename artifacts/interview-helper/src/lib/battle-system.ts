/**
 * Staged battle scene framework — pure, DOM-free descriptors & helpers.
 *
 * SALARYMAN retired open-world lethal roaming combat; real fighting now happens
 * inside deliberate, cinematic "staged battle" scenes triggered from story beats
 * (e.g. dojo sparring, Mission encounters). This module defines the declarative
 * battle DESCRIPTOR that a scene author fills in, the OUTCOME a battle reports
 * back to story progression, and the scripted enemy ARCHETYPES a battle is built
 * from. The realtime arena loop lives in BattleArena.tsx and consumes these.
 *
 * Combat MATH (combo / stamina / block / gear) stays in combat-system.ts so the
 * arena and the open world share one source of truth.
 */

import type { GearStats } from "./combat-system";

// ── Scripted enemy archetypes ────────────────────────────────────────────────
// Presets keep authored battles terse: a descriptor lists archetypes and only
// overrides what differs. No PvP — every combatant is one of these scripts.
export type BattleArchetype =
  | "brawler" // fast, light melee
  | "striker" // balanced melee, moderate damage
  | "brute" // slow, heavy melee, lots of HP
  | "gunner" // ranged, fragile, keeps distance
  | "sentinel"; // tanky ranged guard

export interface ArchetypePreset {
  name: string;
  hp: number;
  damage: number;
  speed: number; // world-units per frame at 60fps
  ranged: boolean;
  range: number; // engagement range (px)
  attackCd: number; // frames between attacks
  windup: number; // telegraph frames before a melee strike lands
  color: string;
  size: number; // draw radius (px)
}

export const BATTLE_ARCHETYPES: Record<BattleArchetype, ArchetypePreset> = {
  brawler: { name: "BRAWLER", hp: 60, damage: 6, speed: 1.7, ranged: false, range: 26, attackCd: 36, windup: 14, color: "#f59e0b", size: 16 },
  striker: { name: "STRIKER", hp: 90, damage: 10, speed: 1.4, ranged: false, range: 28, attackCd: 48, windup: 20, color: "#ef4444", size: 18 },
  brute: { name: "BRUTE", hp: 180, damage: 18, speed: 0.9, ranged: false, range: 34, attackCd: 70, windup: 30, color: "#a855f7", size: 24 },
  gunner: { name: "GUNNER", hp: 55, damage: 8, speed: 1.2, ranged: true, range: 320, attackCd: 64, windup: 0, color: "#22d3ee", size: 16 },
  sentinel: { name: "SENTINEL", hp: 140, damage: 12, speed: 0.8, ranged: true, range: 360, attackCd: 80, windup: 0, color: "#38bdf8", size: 20 },
};

// ── Descriptor: how a scene author declares a battle ─────────────────────────
export interface BattleEnemySpec {
  id: string;
  archetype: BattleArchetype;
  /** Override the archetype display name. */
  name?: string;
  /** Multiplies the archetype HP (bosses, sparring partners, etc.). */
  hpMult?: number;
  /** Multiplies the archetype outgoing damage. */
  damageMult?: number;
  /** Flags this enemy as a boss (gets a dedicated HP bar + bigger frame). */
  boss?: boolean;
}

export type ArenaTheme = "dojo" | "street" | "tower" | "waste";

export interface BattleDescriptor {
  id: string;
  title: string;
  subtitle?: string;
  enemies: BattleEnemySpec[];
  /** Sparring / training: defeat does not kill the player or cost real HP. */
  nonLethal?: boolean;
  /** Allow the player to flee with ESC (reported as 'flee'). */
  allowFlee?: boolean;
  /** Opaque flag a story scene uses to know which beat this battle resolves. */
  storyFlag?: string;
  /** Rewards granted on a win (applied by the host, e.g. WorldPlay). */
  rewards?: { fiat?: number; xp?: number };
  arenaTheme?: ArenaTheme;
}

// ── Player snapshot handed to the arena ──────────────────────────────────────
export interface BattlePlayerInit {
  hp: number;
  maxHp: number;
  /** Resolved base melee attack power (already includes level/weapon/gear). */
  meleeAttack: number;
  /** Resolved base ranged attack power. */
  rangedAttack: number;
  gear: GearStats;
  level: number;
  /** Whether the player owns a ranged weapon (gates the shoot control). */
  hasRanged: boolean;
}

// ── Outcome reported back to story progression ───────────────────────────────
export type BattleResult = "win" | "lose" | "flee";

export interface BattleOutcome {
  battleId: string;
  result: BattleResult;
  enemiesDefeated: number;
  totalEnemies: number;
  playerHpRemaining: number;
  storyFlag?: string;
  rewards?: { fiat?: number; xp?: number };
}

// ── Resolved (runtime) enemy stats ───────────────────────────────────────────
export interface ResolvedEnemy extends ArchetypePreset {
  id: string;
  archetype: BattleArchetype;
  boss: boolean;
}

export function resolveEnemy(spec: BattleEnemySpec): ResolvedEnemy {
  const preset = BATTLE_ARCHETYPES[spec.archetype] ?? BATTLE_ARCHETYPES.striker;
  return {
    ...preset,
    name: spec.name ?? preset.name,
    hp: Math.round(preset.hp * (spec.hpMult ?? 1)),
    damage: preset.damage * (spec.damageMult ?? 1),
    id: spec.id,
    archetype: spec.archetype,
    boss: !!spec.boss,
  };
}

// ── Dynamic battle music ─────────────────────────────────────────────────────
// Boost a randomly selected high-intensity OST track on enter. Tracks live in
// the same callhome library RadioPlayer streams; we pick from a driving subset.
// import.meta.env.BASE_URL keeps the path correct under the artifact's prefix.
const BATTLE_TRACK_NUMBERS = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

export function battleTrackUrl(n: number): string {
  const base = import.meta.env.BASE_URL;
  return `${base}callhome/track-${String(n).padStart(2, "0")}.mp3`;
}

export function pickBattleTrack(): string {
  const n = BATTLE_TRACK_NUMBERS[Math.floor(Math.random() * BATTLE_TRACK_NUMBERS.length)];
  return battleTrackUrl(n);
}

// ── Demo / reusable authored battles ─────────────────────────────────────────
/**
 * Dojo sparring — a non-lethal staged battle that scales to player level. Used
 * as the framework's discoverable entry point (walk into the IRON DOJO) and as a
 * template for how Mission scenes declare their encounters.
 */
export function makeSparDescriptor(level: number): BattleDescriptor {
  const tier = Math.max(1, Math.min(5, Math.ceil(level / 4)));
  const enemies: BattleEnemySpec[] = [
    { id: "spar-1", archetype: "brawler", name: "SPARRING STUDENT", hpMult: 0.8 + tier * 0.15 },
  ];
  if (tier >= 2) enemies.push({ id: "spar-2", archetype: "brawler", name: "SPARRING STUDENT", hpMult: 0.8 + tier * 0.15 });
  if (tier >= 4) enemies.push({ id: "spar-3", archetype: "striker", name: "SENIOR STUDENT", hpMult: 0.6 + tier * 0.1 });
  return {
    id: "dojo-spar",
    title: "IRON DOJO — SPARRING",
    subtitle: "The SENSEI watches. No blades. No death. Only discipline.",
    enemies,
    nonLethal: true,
    allowFlee: true,
    rewards: { xp: 20 + tier * 10 },
    arenaTheme: "dojo",
  };
}

/**
 * Shadow Tower breakout — the culminating staged battle of Q1 · Mission 1
 * ("AND IT ALL FALLS DOWN"). PABLO CORP security seals the descent as the player
 * escapes the burning tower through the service vents. Scales to player level.
 *
 * Deliberately NON-LETHAL (with flee allowed): the mission must complete on WIN
 * OR LOSE, so a defeat here must never drop the player into the death/hospital
 * flow and strand the scene. The host (WorldPlay) overrides the result narration
 * via the onComplete hook and proceeds to the camp claim regardless of outcome.
 */
export function makeShadowTowerEscapeBattle(level: number): BattleDescriptor {
  const tier = Math.max(1, Math.min(5, Math.ceil(level / 4)));
  const enemies: BattleEnemySpec[] = [
    { id: "stx-1", archetype: "striker", name: "PABLO CORP ENFORCER", hpMult: 0.7 + tier * 0.12 },
    { id: "stx-2", archetype: "brawler", name: "CORP SECURITY", hpMult: 0.7 + tier * 0.12 },
  ];
  if (tier >= 3) enemies.push({ id: "stx-3", archetype: "sentinel", name: "TOWER SENTINEL", hpMult: 0.6 + tier * 0.1 });
  if (tier >= 4) enemies.push({ id: "stx-boss", archetype: "brute", name: "FLOOR WARDEN", hpMult: 0.7 + tier * 0.12, boss: true });
  return {
    id: "shadow-tower-escape",
    title: "SHADOW TOWER — BREAKOUT",
    subtitle: "PABLO CORP seals the descent. Cut through and reach the vents.",
    enemies,
    nonLethal: true,
    allowFlee: true,
    storyFlag: "and_it_all_falls_down",
    rewards: { fiat: 1500 + tier * 500, xp: 30 + tier * 12 },
    arenaTheme: "tower",
  };
}
