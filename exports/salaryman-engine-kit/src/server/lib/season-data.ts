import type { SeasonTier, SeasonMissionDef } from "@workspace/db";

const SEASON_TIERS: SeasonTier[] = [
  { level: 1,  xpRequired: 0,    freeReward: { kind: "fiat",     label: "FIAT BONUS",           value: 500,           icon: "ƒ" },              premiumReward: { kind: "cosmetic", label: "CORP CHROME TRIM",     value: "corp_chrome",   color: "#88ccff" } },
  { level: 2,  xpRequired: 500,  freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 1000,            icon: "ƒ" } },
  { level: 3,  xpRequired: 1100, freeReward: { kind: "item",     label: "SUPPLY CRATE",          value: "supply_crate",icon: "📦" },             premiumReward: { kind: "cosmetic", label: "NEON RUNNER MK.II",    value: "neon_runner_2", color: "#ff44ff" } },
  { level: 4,  xpRequired: 1800, freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 2500,            icon: "ƒ" } },
  { level: 5,  xpRequired: 2600, freeReward: { kind: "fiat",     label: "FIAT BONUS",            value: 1500,          icon: "ƒ" },              premiumReward: { kind: "title",    label: "QUARTER EXEC",         value: "QUARTER EXEC",  color: "#ffcc00" } },
  { level: 6,  xpRequired: 3500, freeReward: null,                                                                                              premiumReward: { kind: "cosmetic", label: "SHADOW OPS VEST",       value: "shadow_ops",    color: "#556677" } },
  { level: 7,  xpRequired: 4500, freeReward: { kind: "item",     label: "MEDKIT x3",             value: "medkit_3",    icon: "💊" },             premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 5000,            icon: "ƒ" } },
  { level: 8,  xpRequired: 5600, freeReward: null,                                                                                              premiumReward: { kind: "cosmetic", label: "VOID SIGNAL COAT",      value: "void_signal",   color: "#8833ff" } },
  { level: 9,  xpRequired: 6800, freeReward: { kind: "fiat",     label: "FIAT BONUS",            value: 3000,          icon: "ƒ" },              premiumReward: { kind: "title",    label: "VOID OPERATIVE",       value: "VOID OPERATIVE",color: "#aa44ff" } },
  { level: 10, xpRequired: 8100, freeReward: { kind: "cosmetic", label: "CORP BADGE",            value: "corp_badge",  color: "#00ff41" },        premiumReward: { kind: "cosmetic", label: "PABLO ELITE SUIT",      value: "pablo_elite",   color: "#00ffcc" } },
  { level: 11, xpRequired: 9500, freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 7500,            icon: "ƒ" } },
  { level: 12, xpRequired: 11000,freeReward: { kind: "item",     label: "TREASURE MAP",          value: "tmap_season", icon: "🗺" },             premiumReward: { kind: "cosmetic", label: "REACTOR GLOW JACKET",   value: "reactor_glow",  color: "#ffaa00" } },
  { level: 13, xpRequired: 12600,freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 10000,           icon: "ƒ" } },
  { level: 14, xpRequired: 14300,freeReward: { kind: "fiat",     label: "FIAT BONUS",            value: 5000,          icon: "ƒ" },              premiumReward: { kind: "title",    label: "SHADOWMARK",           value: "SHADOWMARK",    color: "#cc4488" } },
  { level: 15, xpRequired: 16100,freeReward: { kind: "cosmetic", label: "MINX CITY JACKET",      value: "minx_jacket", color: "#33ffaa" },        premiumReward: { kind: "cosmetic", label: "PABLO CORP EXECUTIVE",  value: "pablo_exec",    color: "#ffdd44" } },
  { level: 16, xpRequired: 18000,freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 12500,           icon: "ƒ" } },
  { level: 17, xpRequired: 20000,freeReward: { kind: "item",     label: "GOLD INGOT",            value: "gold_ingot",  icon: "🥇" },             premiumReward: { kind: "cosmetic", label: "STATIC MONK ROBE",      value: "static_monk",   color: "#aaff22" } },
  { level: 18, xpRequired: 22100,freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 15000,           icon: "ƒ" } },
  { level: 19, xpRequired: 24300,freeReward: { kind: "fiat",     label: "FIAT BONUS",            value: 8000,          icon: "ƒ" },              premiumReward: { kind: "title",    label: "IRON OPERATIVE",       value: "IRON OPERATIVE",color: "#ff4444" } },
  { level: 20, xpRequired: 26600,freeReward: { kind: "cosmetic", label: "OUTLAW LONGCOAT",       value: "outlaw_coat", color: "#88ff44" },        premiumReward: { kind: "cosmetic", label: "VOID DOG COMMANDER",    value: "void_commander",color: "#ff8800" } },
  { level: 21, xpRequired: 29000,freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 20000,           icon: "ƒ" } },
  { level: 22, xpRequired: 31500,freeReward: { kind: "item",     label: "DATA CORE",             value: "data_core",   icon: "💾" },             premiumReward: { kind: "cosmetic", label: "PRISM LANCE SKIN",      value: "prism_lance",   color: "#33ccff" } },
  { level: 23, xpRequired: 34100,freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 25000,           icon: "ƒ" } },
  { level: 24, xpRequired: 36800,freeReward: { kind: "fiat",     label: "FIAT BONUS",            value: 12000,         icon: "ƒ" },              premiumReward: { kind: "title",    label: "SHADOW TOWER RESIDENT",value: "SHADOW TOWER RESIDENT", color: "#cc88ff" } },
  { level: 25, xpRequired: 39600,freeReward: { kind: "cosmetic", label: "REPLICANT CHASSIS",     value: "rep_chassis",  color: "#33ffaa" },       premiumReward: { kind: "cosmetic", label: "PABLO CORP ANDROID",    value: "pablo_android", color: "#00ffff" } },
  { level: 26, xpRequired: 42500,freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 30000,           icon: "ƒ" } },
  { level: 27, xpRequired: 45500,freeReward: { kind: "item",     label: "MILITARY TECH CACHE",   value: "mil_cache",   icon: "🔧" },             premiumReward: { kind: "cosmetic", label: "NEON SYNAPSE ARMOR",    value: "neon_synapse",  color: "#ff44aa" } },
  { level: 28, xpRequired: 48600,freeReward: null,                                                                                              premiumReward: { kind: "fiat",     label: "FIAT BONUS",           value: 40000,           icon: "ƒ" } },
  { level: 29, xpRequired: 51800,freeReward: { kind: "fiat",     label: "FIAT BONUS",            value: 20000,         icon: "ƒ" },              premiumReward: { kind: "title",    label: "FLOOR 62 CLEARED",     value: "FLOOR 62 CLEARED", color: "#ffcc00" } },
  { level: 30, xpRequired: 55100,freeReward: { kind: "cosmetic", label: "SEASON 1 PRESTIGE SUIT",value: "s1_prestige", color: "#ffdd44" },        premiumReward: { kind: "cosmetic", label: "PABLO CORP DIRECTOR",   value: "pablo_director",color: "#ffffff" } },
];

const SEASON_MISSIONS: SeasonMissionDef[] = [
  { id: "daily_loot_chests",   type: "daily",  label: "CHEST RUNNER",        description: "Open 3 treasure chests today.",            targetCount: 3,  xpReward: 120, trackingKey: "chestsOpened" },
  { id: "daily_earn_fiat",     type: "daily",  label: "PAY DAY",             description: "Earn 5,000 FIAT today.",                   targetCount: 5000, xpReward: 150, trackingKey: "fiatEarned" },
  { id: "daily_defeat_npcs",   type: "daily",  label: "THREAT NEUTRALIZED",  description: "Defeat 5 enemies today.",                  targetCount: 5,  xpReward: 100, trackingKey: "npcsDefeated" },
  { id: "daily_travel",        type: "daily",  label: "CITY PATROL",         description: "Visit 3 different districts today.",       targetCount: 3,  xpReward: 80,  trackingKey: "districtsVisited" },
  { id: "daily_survive",       type: "daily",  label: "CLOCK IN",            description: "Play for at least 15 minutes today.",      targetCount: 15, xpReward: 60,  trackingKey: "minutesPlayed" },
  { id: "weekly_loot",         type: "weekly", label: "ACQUISITION SWEEP",   description: "Loot 15 chests this week.",                targetCount: 15, xpReward: 500, trackingKey: "chestsOpened" },
  { id: "weekly_fiat",         type: "weekly", label: "QUARTERLY EARNINGS",  description: "Earn 50,000 FIAT this week.",              targetCount: 50000, xpReward: 600, trackingKey: "fiatEarned" },
  { id: "weekly_kills",        type: "weekly", label: "HOSTILE OPERATIONS",  description: "Defeat 30 enemies this week.",             targetCount: 30, xpReward: 450, trackingKey: "npcsDefeated" },
  { id: "weekly_explore",      type: "weekly", label: "FULL CITY SWEEP",     description: "Visit all 5 city districts this week.",    targetCount: 5,  xpReward: 350, trackingKey: "districtsVisited" },
  { id: "weekly_playtime",     type: "weekly", label: "MANDATORY OVERTIME",  description: "Play for at least 60 minutes this week.",  targetCount: 60, xpReward: 400, trackingKey: "minutesPlayed" },
];

export function buildCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd = new Date(year, quarter * 3, 1);
  const seasonNumber = (year - 2024) * 4 + quarter;
  const quarterNames = ["Q1", "Q2", "Q3", "Q4"];
  const qName = quarterNames[quarter - 1];
  const slug = `season-${seasonNumber}-${year}-${qName.toLowerCase()}`;
  const name = `CORPORATE QUARTER ${qName} · Y${year - 2020}`;

  return {
    slug,
    name,
    number: seasonNumber,
    startsAt: qStart,
    endsAt: qEnd,
    isActive: true,
    premiumPriceUsd: 999,
    stripePriceId: process.env.STRIPE_PRICE_SEASON_PASS ?? null,
    tiers: SEASON_TIERS,
    missions: SEASON_MISSIONS,
  };
}

export function getDailyPeriodKey(): string {
  const d = new Date();
  return `D-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function getWeeklyPeriodKey(): string {
  const d = new Date();
  const dayOfWeek = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
  return `W-${monday.getUTCFullYear()}-${monday.getUTCMonth() + 1}-${monday.getUTCDate()}`;
}

export function getPeriodKeyForMission(type: "daily" | "weekly"): string {
  return type === "daily" ? getDailyPeriodKey() : getWeeklyPeriodKey();
}
