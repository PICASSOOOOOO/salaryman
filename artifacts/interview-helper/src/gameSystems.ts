// ── World Clock & Calendar ────────────────────────────────────────────────────
// 1 real hour = 1 in-game day. 13 months × 28 days = 364 days/year.
// Each season = 91 game days (3 months × 28 days + 7 bonus days). 4 seasons × 91 = 364 days/year.
export const MONTHS = [
  'NEONVEIL','ASHMARK','DRIFTMOON','IRONBLOOM','RUSTFALL',
  'SMOKETIDE','GLASSREACH','COILWAKE','DEEPFORGE','HOLLOWEND',
  'STORMVEIL','FROSTLOCK','SHADOWTURN',
] as const;
export const SEASONS = ['SPRING','SUMMER','AUTUMN','WINTER'] as const;
export type Season = typeof SEASONS[number];
export type WeatherType = 'CLEAR'|'RAIN'|'SNOW'|'OVERCAST'|'STORM'|'HEATWAVE'|'FOG'|'DUST'|'ACID_RAIN';
export type TemperatureLevel = 'COLD' | 'MILD' | 'HOT';

export const DAYS_PER_SEASON = 91;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;

export function getSeasonFromDayOfYear(dayOfYear: number): Season {
  const d = ((dayOfYear - 1) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  if (d < DAYS_PER_SEASON) return 'SPRING';
  if (d < DAYS_PER_SEASON * 2) return 'SUMMER';
  if (d < DAYS_PER_SEASON * 3) return 'AUTUMN';
  return 'WINTER';
}

export function getDayOfYear(month: number, day: number): number {
  return month * 28 + day;
}

export interface WorldCalendar {
  year: number;
  month: number;
  day: number;
  hour: number;
  season: Season;
  weather: WeatherType;
  weatherTimer: number;
  disasterActive: null | 'FIRE' | 'EARTHQUAKE';
  disasterTimer: number;
  disasterX: number;
  disasterY: number;
}

export function initCalendar(): WorldCalendar {
  return {
    year: 1, month: 0, day: 1, hour: 8,
    season: 'SPRING', weather: 'CLEAR', weatherTimer: 0,
    disasterActive: null, disasterTimer: 0, disasterX: 0, disasterY: 0,
  };
}

const REAL_MS_PER_GAME_DAY = 3600000;
const REAL_MS_PER_GAME_HOUR = REAL_MS_PER_GAME_DAY / 24;

export function tickCalendar(cal: WorldCalendar, dtMs: number): WorldCalendar {
  const hoursElapsed = dtMs / REAL_MS_PER_GAME_HOUR;
  let h = cal.hour + hoursElapsed;
  let d = cal.day;
  let m = cal.month;
  let y = cal.year;

  while (h >= 24) { h -= 24; d++; }
  while (d > 28) { d -= 28; m++; }
  while (m >= 13) { m -= 13; y++; }

  const dayOfYear = getDayOfYear(m, d);
  const season = getSeasonFromDayOfYear(dayOfYear);

  let weather = cal.weather;
  let wt = cal.weatherTimer - 1;
  if (wt <= 0) {
    weather = pickWeather(season);
    wt = 300 + Math.floor(Math.random() * 600);
  }

  let disaster = cal.disasterActive;
  let disasterTimer = cal.disasterTimer;
  let dx = cal.disasterX, dy = cal.disasterY;
  if (disasterTimer > 0) {
    disasterTimer--;
    if (disasterTimer <= 0) disaster = null;
  } else if (Math.random() < 0.00008) {
    disaster = Math.random() < 0.6 ? 'FIRE' : 'EARTHQUAKE';
    disasterTimer = 180 + Math.floor(Math.random() * 120);
    dx = 5500 + Math.random() * 3500;
    dy = 5100 + Math.random() * 2400;
  }

  return { year: y, month: m, day: d, hour: h, season, weather, weatherTimer: wt,
    disasterActive: disaster, disasterTimer, disasterX: dx, disasterY: dy };
}

export function getTemperatureLevel(season: Season, weather: WeatherType, hour: number): TemperatureLevel {
  const isNight = hour < 6 || hour >= 20;
  if (season === 'WINTER') {
    if (weather === 'HEATWAVE') return 'MILD';
    return 'COLD';
  }
  if (season === 'SUMMER') {
    if (weather === 'HEATWAVE' || weather === 'DUST') return 'HOT';
    if (weather === 'SNOW' || weather === 'STORM') return 'MILD';
    if (isNight) return 'MILD';
    return 'HOT';
  }
  if (season === 'AUTUMN') {
    if (weather === 'SNOW' || weather === 'STORM') return 'COLD';
    if (weather === 'HEATWAVE') return 'HOT';
    if (isNight && (weather === 'RAIN' || weather === 'FOG')) return 'COLD';
    return 'MILD';
  }
  if (weather === 'SNOW' || (weather === 'STORM' && isNight)) return 'COLD';
  if (weather === 'HEATWAVE') return 'HOT';
  return 'MILD';
}

function pickWeather(season: Season): WeatherType {
  const r = Math.random();
  switch (season) {
    case 'SPRING': return r < 0.35 ? 'CLEAR' : r < 0.6 ? 'RAIN' : r < 0.75 ? 'OVERCAST' : r < 0.9 ? 'FOG' : 'STORM';
    case 'SUMMER': return r < 0.5 ? 'CLEAR' : r < 0.65 ? 'HEATWAVE' : r < 0.8 ? 'OVERCAST' : r < 0.92 ? 'DUST' : 'STORM';
    case 'AUTUMN': return r < 0.3 ? 'CLEAR' : r < 0.55 ? 'RAIN' : r < 0.75 ? 'OVERCAST' : r < 0.85 ? 'FOG' : r < 0.95 ? 'STORM' : 'ACID_RAIN';
    case 'WINTER': return r < 0.2 ? 'CLEAR' : r < 0.5 ? 'SNOW' : r < 0.7 ? 'OVERCAST' : r < 0.85 ? 'FOG' : 'STORM';
  }
}

export function getCalendarString(cal: WorldCalendar): string {
  const h = Math.floor(cal.hour);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${MONTHS[cal.month]} ${cal.day}, Y${cal.year} · ${h12}:00 ${ampm} · ${cal.season}`;
}

export function getDayNightAlpha(hour: number): number {
  if (hour >= 6 && hour < 18) return 0;
  if (hour >= 18 && hour < 20) return (hour - 18) / 2 * 0.6;
  if (hour >= 20 || hour < 4) return 0.6;
  if (hour >= 4 && hour < 6) return (1 - (hour - 4) / 2) * 0.6;
  return 0;
}

// ── Radiation Zones ──────────────────────────────────────────────────────────
export interface RadiationZone {
  x: number; y: number; w: number; h: number; intensity: number; label: string;
}

export const RADIATION_ZONES: RadiationZone[] = [
  { x: 1000, y: 9000, w: 1500, h: 1200, intensity: 0.8, label: 'TOXIC FLATS' },
  { x: 11000, y: 1000, w: 1800, h: 1400, intensity: 0.6, label: 'DEAD ZONE NORTH' },
  { x: 9000, y: 10000, w: 2000, h: 1500, intensity: 0.7, label: 'IRRADIATED WASTES' },
  { x: 3500, y: 3000, w: 1200, h: 1000, intensity: 0.5, label: 'MELTDOWN SITE' },
  { x: 12000, y: 7000, w: 1600, h: 1200, intensity: 0.9, label: 'REACTOR CRATER' },
];

export function getRadiationLevel(px: number, py: number): { inZone: boolean; intensity: number; label: string } {
  for (const z of RADIATION_ZONES) {
    if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) {
      return { inZone: true, intensity: z.intensity, label: z.label };
    }
  }
  return { inZone: false, intensity: 0, label: '' };
}

// ── Gold Exchange ────────────────────────────────────────────────────────────
export const FIAT_PER_GOLD = 100000;
export const GEMSTONE_PER_GOLD = 1;
export const BASE_TAX_RATE = 0.10;
export const TAX_INCREASE_PER_YEAR = 0.001;

export function getTransactionTax(year: number): number {
  return BASE_TAX_RATE + TAX_INCREASE_PER_YEAR * (year - 1);
}

export function fiatToGold(fiat: number, year: number): { gold: number; tax: number; totalCost: number } {
  const taxRate = getTransactionTax(year);
  const gold = Math.floor(fiat / FIAT_PER_GOLD);
  const baseCost = gold * FIAT_PER_GOLD;
  const tax = Math.floor(baseCost * taxRate);
  return { gold, tax, totalCost: baseCost + tax };
}

// ── Treasure System ──────────────────────────────────────────────────────────
export interface TreasureChest {
  id: string; x: number; y: number; opened: boolean;
  loot: { fiat: number; items: { name: string; desc: string }[] };
  requiresMap: boolean;
}

export const TREASURE_CHESTS: TreasureChest[] = [
  { id: 'tc_nw_1', x: 1500, y: 2000, opened: false, loot: { fiat: 15000, items: [{ name: 'ANCIENT BLADE', desc: 'Pre-collapse weapon. Still sharp.' }] }, requiresMap: false },
  { id: 'tc_ne_1', x: 11500, y: 1800, opened: false, loot: { fiat: 20000, items: [{ name: 'DATA CORE', desc: 'PABLO Corp. classified data.' }] }, requiresMap: false },
  { id: 'tc_sw_1', x: 2500, y: 10000, opened: false, loot: { fiat: 25000, items: [{ name: 'GOLD INGOT', desc: 'Pure gold. Worth 1 gold unit.' }] }, requiresMap: true },
  { id: 'tc_se_1', x: 10000, y: 10500, opened: false, loot: { fiat: 30000, items: [{ name: 'REACTOR SHARD', desc: 'Glowing with residual energy.' }] }, requiresMap: true },
  { id: 'tc_mid_1', x: 6000, y: 8500, opened: false, loot: { fiat: 8000, items: [{ name: 'SUPPLY CRATE', desc: 'Food and medical supplies.' }] }, requiresMap: false },
  { id: 'tc_deep_1', x: 4000, y: 11000, opened: false, loot: { fiat: 40000, items: [{ name: 'PABLO\'S DIARY', desc: 'A page from Senior Pablo\'s journal.' }] }, requiresMap: true },
  { id: 'tc_east_1', x: 12500, y: 5000, opened: false, loot: { fiat: 12000, items: [{ name: 'ENERGY CELL', desc: 'Military-grade power source.' }] }, requiresMap: false },
  { id: 'tc_north_1', x: 8000, y: 1200, opened: false, loot: { fiat: 18000, items: [{ name: 'VOID DOG FANG', desc: 'Trophy from a Void Dog alpha.' }] }, requiresMap: false },
];

export const TREASURE_MAPS = [
  { id: 'tmap_1', name: 'TATTERED MAP', desc: 'Points to the irradiated southwest...', targetChest: 'tc_sw_1' },
  { id: 'tmap_2', name: 'ENCODED MAP', desc: 'Coordinates encrypted. Southeast sector.', targetChest: 'tc_se_1' },
  { id: 'tmap_3', name: 'PABLO\'S NOTE', desc: '"X marks where I buried the truth." Deep south.', targetChest: 'tc_deep_1' },
];

// ── Boomer Mode Terminology ──────────────────────────────────────────────────
export const BOOMER_MAP: Record<string, string> = {
  'FIAT': 'CREDITS',
  'HP': 'HEALTH',
  'ATK': 'POWER',
  'XP': 'EXPERIENCE',
  'EXP': 'EXPERIENCE',
  'LVL': 'RANK',
  'PSN': 'TOXIN',
  'HUNGER': 'FOOD LEVEL',
  'THIRST': 'HYDRATION',
  'ENERGY': 'STAMINA',
  'LEVEL UP': 'PROMOTION',
  'WASTELAND': 'FIELD TERRITORY',
  'MINX CITY': 'HEADQUARTERS',
  'MELEE': 'CLOSE COMBAT',
  'RANGED': 'LONG RANGE',
  'LOOT': 'ACQUISITION',
  'BOUNTY': 'COMMISSION',
  'NPC': 'CONTACT',
  'PVP': 'COMPETITIVE',
  'WEAPON': 'TOOL',
  'POISON': 'CONTAMINATION',
  'SAVE POINT': 'CHECKPOINT',
  'GAME OVER': 'SESSION ENDED',
  'RESPAWN': 'RESTART',
  'KILL': 'NEUTRALIZE',
  'QUEST': 'OBJECTIVE',
  'INVENTORY': 'PORTFOLIO',
  'MERCHANT': 'VENDOR',
  'GANG': 'COMPETITOR',
  'BOSS': 'EXECUTIVE',
  'DUNGEON': 'FACILITY',
  'ARMOR': 'PROTECTION',
  'MANA': 'RESOURCES',
  'GRIND': 'WORK',
  'BUFF': 'ENHANCEMENT',
  'DEBUFF': 'PENALTY',
  'SPAWN': 'DEPLOY',
  'AGGRO': 'ATTENTION',
  'RAID': 'OPERATION',
  'GUILD': 'DEPARTMENT',
  'DPS': 'OUTPUT',
};

export function boomerize(text: string, active: boolean): string {
  if (!active) return text;
  let result = text;
  for (const [game, biz] of Object.entries(BOOMER_MAP)) {
    result = result.replace(new RegExp(`\\b${game}\\b`, 'gi'), biz);
  }
  return result;
}

// ── Dialogue System ──────────────────────────────────────────────────────────
export interface DialogueChoice {
  text: string;
  nextId: string | null;
  flag?: string;
  flagValue?: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  portrait: 'player' | 'npc';
  text: string;
  choices: DialogueChoice[];
}

export interface DialogueTree {
  npcName: string;
  startId: string;
  nodes: Record<string, DialogueNode>;
}

export const STORY_DIALOGUES: Record<string, DialogueTree> = {
  MARCUS_VELL: {
    npcName: 'MARCUS VELL',
    startId: 'start',
    nodes: {
      start: { id: 'start', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Another visitor. The megabank doesn\'t close, but my patience does. What do you want?', choices: [
        { text: 'Tell me about the bank.', nextId: 'bank_info' },
        { text: 'What do you know about Senior Pablo?', nextId: 'pablo_info' },
        { text: 'Nothing. Goodbye.', nextId: null },
      ]},
      bank_info: { id: 'bank_info', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Iron Trust Bank. EST. 1989. Every fiat in this city passes through these doors. PABLO Corp. takes 12% of everything above 5,000. That\'s not banking. That\'s tribute.', choices: [
        { text: 'That seems unfair.', nextId: 'unfair' },
        { text: 'Thanks for the info.', nextId: null },
      ]},
      pablo_info: { id: 'pablo_info', speaker: 'MARCUS VELL', portrait: 'npc', text: 'I\'ve worked here eleven years. Never met him. Never seen him. But every document I process has his signature. Same ink. Same hand. For eleven years.', choices: [
        { text: 'That\'s suspicious.', nextId: 'suspicious', flag: 'marcus_suspicious', flagValue: 'true' },
        { text: 'Interesting. Goodbye.', nextId: null },
      ]},
      unfair: { id: 'unfair', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Fairness left Minx City around the same time the flowers did. You want fair? Try the wasteland. Out there, everyone loses equally.', choices: [
        { text: 'Goodbye.', nextId: null },
      ]},
      suspicious: { id: 'suspicious', speaker: 'MARCUS VELL', portrait: 'npc', text: 'Keep your voice down. Walls have ears in this city. And cameras. And microphones. All of them pointed at this desk.', choices: [
        { text: 'I\'ll be careful.', nextId: null },
      ]},
    },
  },
  OFFICER_DECLAN_VOSS: {
    npcName: 'OFFICER DECLAN VOSS',
    startId: 'start',
    nodes: {
      start: { id: 'start', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Citizen. State your business. I don\'t have time for idle conversation.', choices: [
        { text: 'What happens on Floor 40?', nextId: 'floor40' },
        { text: 'Any threats I should know about?', nextId: 'threats' },
        { text: 'Just passing through.', nextId: null },
      ]},
      floor40: { id: 'floor40', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Floor 40 and above. Permanent restriction. I\'ve been a captain for fourteen years and I\'ve never been above floor 39. Don\'t ask who gave the order.', choices: [
        { text: 'You\'re not curious?', nextId: 'curious' },
        { text: 'Understood.', nextId: null },
      ]},
      threats: { id: 'threats', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Border gangs south of the checkpoints. Iron Rats and Void Dogs in the wastes. Spies in the city — they look like everyone else. Watch your back.', choices: [
        { text: 'Thanks, Officer.', nextId: null },
      ]},
      curious: { id: 'curious', speaker: 'OFFICER VOSS', portrait: 'npc', text: 'Curiosity is a luxury. I have a pension. Those two things don\'t coexist in Minx City.', choices: [
        { text: 'Fair enough.', nextId: null },
      ]},
    },
  },
};

// ── Rumor System ─────────────────────────────────────────────────────────────
export const RUMORS: string[] = [
  'Someone saw lights on Floor 62 last night...',
  'The Iron Rats are planning a push into Void Dogs territory.',
  'PABLO Corp. raised water prices again. Third time this month.',
  'A courier disappeared near the eastern ruins. Nobody\'s talking.',
  'The clinic is running low on med kits. Stock up.',
  'Someone found a pre-collapse bunker under the scrap yard.',
  'The Void Dogs alpha was spotted near the northern gate.',
  'Static Monks are recruiting. Something big is coming.',
  'A trader at the black market is selling fake passports.',
  'The subway tunnels connect to something deeper...',
  'PABLO Corp. is hiring contractors. Nobody knows for what.',
  'An android in the east district developed emotions. They\'re hiding.',
  'The Noodle Bar has the best ramen in Minx City. Fight me.',
  'Eastern Bloc found old military tech. Weapon parts everywhere.',
  'The power grid flickers every night at exactly 2:47 AM.',
  'A fire broke out near the scrap yard. Nobody came to help.',
  'Someone grafitti\'d "PABLO LIES" on Shadow Tower. It lasted 3 minutes.',
  'The Rust Porch has a secret room. Ask for the \'special.\'',
];

// ── Character Customization ──────────────────────────────────────────────────
export interface Costume {
  id: string; name: string; desc: string; price: number; color: string;
}

export const COSTUMES: Costume[] = [
  { id: 'default', name: 'STANDARD ISSUE', desc: 'Basic civilian clothing.', price: 0, color: '#00ff41' },
  { id: 'corpo_suit', name: 'CORPO SUIT', desc: 'Sharp. Professional. PABLO-approved.', price: 15000, color: '#3366ff' },
  { id: 'wasteland_gear', name: 'WASTELAND GEAR', desc: 'Reinforced. Dusty. Functional.', price: 12000, color: '#aa8844' },
  { id: 'stealth_black', name: 'STEALTH BLACK', desc: 'Matte black. Night operations.', price: 20000, color: '#333344' },
  { id: 'neon_runner', name: 'NEON RUNNER', desc: 'Glowing trim. Fast look. No speed bonus.', price: 18000, color: '#ff00ff' },
  { id: 'medic_whites', name: 'MEDIC WHITES', desc: 'Clinic uniform. Enemies hesitate.', price: 10000, color: '#ffffff' },
  { id: 'iron_rats_jacket', name: 'IRON RATS JACKET', desc: 'Gang colors. Risky in wrong territory.', price: 8000, color: '#ff4444' },
  { id: 'void_dogs_vest', name: 'VOID DOGS VEST', desc: 'Gang colors. Risky in wrong territory.', price: 8000, color: '#ff8800' },
];

// ── Time Zone Cities ─────────────────────────────────────────────────────────
export const TIMEZONE_CITIES = [
  { id: 'pst', label: 'MINX CITY (PST)', offset: -8 },
  { id: 'est', label: 'NEW EDEN (EST)', offset: -5 },
  { id: 'cst', label: 'IRON FALLS (CST)', offset: -6 },
  { id: 'mst', label: 'DUST VALLEY (MST)', offset: -7 },
  { id: 'gmt', label: 'NEXUS PRIME (GMT)', offset: 0 },
  { id: 'cet', label: 'STEEL BERLIN (CET)', offset: 1 },
  { id: 'jst', label: 'NEO TOKYO (JST)', offset: 9 },
  { id: 'aest', label: 'CHROME SYDNEY (AEST)', offset: 10 },
  { id: 'ist', label: 'CYBER MUMBAI (IST)', offset: 5.5 },
] as const;

// ── Subscription Pricing ─────────────────────────────────────────────────────
export const SUBSCRIPTION_PRICING = {
  ECHO_7: { name: 'ECHO-7 NERVE TAP', monthlyFiat: 5, trialDays: 7 },
  OPTIC_9: { name: 'OPTIC-9 RETINAL SCANNER', monthlyFiat: 6, trialDays: 7 },
  VOX_4: { name: 'VOX-4 LARYNX MODULE', monthlyFiat: 4, trialDays: 7 },
  CIPHER_X: { name: 'CIPHER-X COMMAND TERMINAL', monthlyFiat: 5, trialDays: 7 },
  PRESENTATION: { name: 'HOLO-PROJ MK.II', monthlyFiat: 4, trialDays: 7 },
} as const;

// ── Weather Rendering Params ─────────────────────────────────────────────────
export interface WeatherParticle { x: number; y: number; vx: number; vy: number; size: number; }

export function createWeatherParticles(weather: WeatherType, count: number, canvasW: number, canvasH: number): WeatherParticle[] {
  const particles: WeatherParticle[] = [];
  if (weather !== 'RAIN' && weather !== 'SNOW' && weather !== 'STORM' && weather !== 'ACID_RAIN') return particles;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvasW,
      y: Math.random() * canvasH,
      vx: weather === 'SNOW' ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 2,
      vy: weather === 'SNOW' ? 0.5 + Math.random() * 1 : 4 + Math.random() * 6,
      size: weather === 'SNOW' ? 2 + Math.random() * 3 : 1,
    });
  }
  return particles;
}

export function updateWeatherParticles(particles: WeatherParticle[], canvasW: number, canvasH: number): void {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y > canvasH) { p.y = -5; p.x = Math.random() * canvasW; }
    if (p.x < 0) p.x = canvasW;
    if (p.x > canvasW) p.x = 0;
  }
}

// ── Starter Weapon Lore Names ────────────────────────────────────────────────
export const LORE_WEAPON_NAMES: Record<string, { label: string; lore: string }> = {
  FISTS: { label: 'BARE FISTS', lore: 'No weapon needed. Street-hardened knuckles.' },
  KNIFE: { label: 'SWITCHBLADE', lore: 'Standard-issue blade. Every operative carries one.' },
  REVOLVER: { label: 'VOSS-6', lore: 'Six-shot revolver. Reliable. Loud.' },
  PISTOL: { label: 'VOSS-9 AUTO', lore: 'Corporate sidearm. Semi-automatic. Clean kills.' },
  SWORD: { label: 'ASHFANG', lore: 'Salvaged from the ruins of Old Minx. The blade remembers.' },
  RIFLE: { label: 'LONGREACH MK.4', lore: 'Outlaw standard. Reaches further than trust.' },
  GUN: { label: 'VOSS-9', lore: 'Standard-issue sidearm. Serial number filed off.' },
  LASER: { label: 'PRISM LANCE', lore: 'Pre-collapse military tech. Still hums.' },
  BOMB: { label: 'SHATTER CHARGE', lore: 'Improvised explosive. Loud. Effective.' },
};

// ── Ambient Audio Identifiers ────────────────────────────────────────────────
export const AMBIENT_SOUNDS = {
  CITY_HUM: 'city_hum',
  WASTELAND_WIND: 'wasteland_wind',
  RAIN_LOOP: 'rain_loop',
  BREATHING: 'breathing',
  COMBAT_MUSIC: 'combat_music',
} as const;
