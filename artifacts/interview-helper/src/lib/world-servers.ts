import { CITY_TIMEZONES } from "@workspace/api-zod";

export interface CityEntry {
  cityId: string;
  cityName: string;
  region: string;
  timezone: string;
  themeStyle: string;
  accentColor: string;
  bgGradient: string;
  icon: string;
  tagline: string;
  description: string;
  isLive: boolean;
  // Max concurrent players this realm holds (each realm is a separate always-on
  // server). Capped for cost control; raised as the in-world economy grows.
  maxPlayers: number;
  // Origin of the realm's world server, e.g. "https://huda.picassoo.app".
  // Empty → connect to the same origin the client was served from. This lets
  // every (identical) deployment route a player to the realm that physically
  // hosts their continent once each realm has its own published domain.
  serverUrl?: string;
}

export interface ServerRegion {
  id: string;
  label: string;
  description: string;
  cities: CityEntry[];
}

// Default per-realm population cap. Each realm is its own always-on server; the
// cap keeps a single instance healthy and hosting cost predictable. Raise it
// (per realm) once the realm's economy is strong enough to justify the compute.
export const DEFAULT_MAX_PLAYERS = 50;

export const PLANNED_CITIES: CityEntry[] = [
  { cityId: "minx_city",      cityName: "MINX CITY",      region: "AMERICAS — NORTH",     timezone: CITY_TIMEZONES.minx_city,  themeStyle: "cyberpunk_neon",   accentColor: "#38bdf8", bgGradient: "linear-gradient(135deg, #0c1929 0%, #1a2744 100%)", icon: "🏙️", tagline: "THE NEON FRONTIER",          description: "The original. PABLO CORP's neon-drenched flagship sprawl, where the company owns the towers, the streets, and most of the people. Acid rain, holographic billboards, and a poison fog beyond the wall keep everyone working. Where it all began — and where the boss still watches every floor.", isLive: true,  maxPlayers: DEFAULT_MAX_PLAYERS, serverUrl: "" },
  { cityId: "huda_city",      cityName: "HUDA CITY",      region: "ASIA",                 timezone: CITY_TIMEZONES.huda_city,     themeStyle: "monsoon_grid",     accentColor: "#14b8a6", bgGradient: "linear-gradient(135deg, #051a17 0%, #0a2d28 100%)", icon: "🌏", tagline: "THE EASTERN GATEWAY",        description: "PABLO CORP's Asian capital — a rain-slick monsoon megacity of neon night markets, floating tower-farms, and lantern-lit canals. The same world as Minx City, run for the East: humid, crowded, and electric around the clock. Trade never sleeps here, and the company's reach runs as deep as it does back home.", isLive: true,  maxPlayers: DEFAULT_MAX_PLAYERS, serverUrl: "" },
  { cityId: "solaris_drift",  cityName: "SOLARIS DRIFT",  region: "AMERICAS — CENTRAL",   timezone: "America/Mexico_City",  themeStyle: "solar_bazaar",    accentColor: "#f59e0b", bgGradient: "linear-gradient(135deg, #1a1207 0%, #2d1f0a 100%)", icon: "☀️", tagline: "WHERE THE SUN NEVER SETS",   description: "Sun-scorched markets and neon cantinas. Trade flows through here like desert wind.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "verde_nexus",    cityName: "VERDE NEXUS",    region: "AMERICAS — SOUTH",     timezone: "America/Sao_Paulo",    themeStyle: "jungle_circuit",  accentColor: "#22c55e", bgGradient: "linear-gradient(135deg, #0a1a0e 0%, #0f2d14 100%)", icon: "🌿", tagline: "THE GREEN MACHINE",           description: "Tangled jungle data-vines and bioluminescent server farms. Growth is relentless.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "obsidian_reach", cityName: "OBSIDIAN REACH", region: "AFRICA",               timezone: "Africa/Lagos",         themeStyle: "obsidian_forge",  accentColor: "#a855f7", bgGradient: "linear-gradient(135deg, #140a1e 0%, #1e0f2e 100%)", icon: "💎", tagline: "FORGED IN DARKNESS",          description: "Volcanic glass towers and underground markets. Raw power carved from ancient stone.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "cobalt_harbor",  cityName: "COBALT HARBOR",  region: "EUROPE — WEST",        timezone: "Europe/London",        themeStyle: "maritime_chrome", accentColor: "#3b82f6", bgGradient: "linear-gradient(135deg, #0a1525 0%, #0f1e38 100%)", icon: "⚓", tagline: "THE OLD WORLD PORT",          description: "Fog-wrapped docks and chrome-clad trading halls. Tradition meets technology.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "vostok_gate",    cityName: "VOSTOK GATE",    region: "EUROPE — EAST",        timezone: "Europe/Moscow",        themeStyle: "frost_grid",      accentColor: "#ef4444", bgGradient: "linear-gradient(135deg, #0f0a0a 0%, #1a0f14 100%)", icon: "🚪", tagline: "THE EASTERN THRESHOLD",       description: "Frozen data corridors and iron-walled compounds. Only the strong survive here.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "crescent_spire", cityName: "CRESCENT SPIRE", region: "ASIA — CRESCENT",      timezone: "Asia/Dubai",           themeStyle: "desert_chrome",   accentColor: "#eab308", bgGradient: "linear-gradient(135deg, #1a1505 0%, #2b2008 100%)", icon: "🌙", tagline: "THE GOLDEN PINNACLE",         description: "Gleaming spires pierce the desert sky. Wealth and wisdom converge at the crossroads.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "amber_circuit",  cityName: "AMBER CIRCUIT",  region: "ASIA — SOUTH",         timezone: "Asia/Kolkata",         themeStyle: "tech_bazaar",     accentColor: "#f97316", bgGradient: "linear-gradient(135deg, #1a0f05 0%, #2d1a08 100%)", icon: "🔶", tagline: "THE INFINITE BAZAAR",         description: "Chaotic brilliance and endless hustle. A million minds wired into one pulsing circuit.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "dragon_forge",   cityName: "DRAGON FORGE",   region: "ASIA — EAST",          timezone: "Asia/Tokyo",           themeStyle: "hyper_modern",    accentColor: "#dc2626", bgGradient: "linear-gradient(135deg, #1a0505 0%, #2d0a0a 100%)", icon: "🐉", tagline: "THE FURNACE OF PROGRESS",     description: "Precision-engineered megastructures and relentless production. The world's engine room.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
  { cityId: "coral_vault",    cityName: "CORAL VAULT",    region: "OCEANIA",              timezone: "Australia/Sydney",      themeStyle: "reef_circuit",    accentColor: "#06b6d4", bgGradient: "linear-gradient(135deg, #051519 0%, #0a252d 100%)", icon: "🐚", tagline: "THE DEEP ARCHIVE",            description: "Reef-encrusted data vaults beneath crystal waters. Remote, secure, untouchable.", isLive: false, maxPlayers: DEFAULT_MAX_PLAYERS },
];

// ─── Operational cities & timezone routing ──────────────────────────────────
// A city is a REGIONAL SERVER (realm) tied to a real-world timezone — not a
// global space. Each live city runs the SAME game on its own always-on server;
// players are native to one realm and route to the nearest operational one.
// MINX CITY serves the Americas (PST); HUDA CITY serves Asia (Vietnam tz).

export function getOperationalCities(): CityEntry[] {
  return PLANNED_CITIES.filter(c => c.isLive);
}

export function getCityById(cityId: string): CityEntry | undefined {
  return PLANNED_CITIES.find(c => c.cityId === cityId);
}

// Resolve the world-server origin for a realm. Returns "" when the realm is
// hosted at the same origin the client was served from (the common case until
// a realm has its own published domain). Once each realm is published, fill in
// its `serverUrl` so any deployment can route a player to the realm that
// physically hosts their continent.
export function worldServerOrigin(cityId?: string): string {
  const c = cityId ? getCityById(cityId) : undefined;
  return (c?.serverUrl ?? "").trim();
}

export function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Minutes east of UTC for an IANA timezone at a given instant (DST-aware).
function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(at);
    const m: Record<string, number> = {};
    for (const p of parts) if (p.type !== "literal") m[p.type] = parseInt(p.value, 10);
    const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

// Circular distance between two UTC offsets (minutes), wrapping at the dateline.
function offsetDistance(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 720) d = 1440 - d;
  return d;
}

function nearestByOffset(cities: CityEntry[], playerOffset: number): CityEntry | null {
  let best: CityEntry | null = null;
  let bestDist = Infinity;
  for (const c of cities) {
    const d = offsetDistance(playerOffset, tzOffsetMinutes(c.timezone));
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

export interface HomeCityResolution {
  city: CityEntry;        // the operational city the player is routed into
  isHome: boolean;        // true when this city is genuinely the player's region
  isFallback: boolean;    // true when routed to nearest operational city instead
  playerTimezone: string;
  homeRegionCity: CityEntry | null; // the city that WOULD be home once it's live
}

// Resolve which operational city a player should enter, given their timezone.
// Picks the operational city sharing the player's timezone; otherwise the
// geographically nearest operational city by UTC offset. Reports whether this
// was the player's true home region or a fallback so callers can message it.
export function resolveHomeCity(timezone?: string): HomeCityResolution | null {
  const tz = timezone || getLocalTimezone();
  const operational = getOperationalCities();
  if (operational.length === 0) return null;

  const playerOffset = tzOffsetMinutes(tz);
  const homeRegionCity = PLANNED_CITIES.find(c => c.timezone === tz)
    ?? nearestByOffset(PLANNED_CITIES, playerOffset);

  const exact = operational.find(c => c.timezone === tz);
  if (exact) {
    return { city: exact, isHome: true, isFallback: false, playerTimezone: tz, homeRegionCity };
  }

  const nearest = nearestByOffset(operational, playerOffset) ?? operational[0];
  const isHome = homeRegionCity?.cityId === nearest.cityId;
  return { city: nearest, isHome, isFallback: !isHome, playerTimezone: tz, homeRegionCity };
}

export const SERVER_REGIONS: ServerRegion[] = [
  {
    id: "americas",
    label: "THE AMERICAS",
    description: "3 servers spanning North, Central, and South America",
    cities: PLANNED_CITIES.filter(c => c.region.startsWith("AMERICAS")),
  },
  {
    id: "africa",
    label: "AFRICA",
    description: "1 server covering the entire African continent",
    cities: PLANNED_CITIES.filter(c => c.region === "AFRICA"),
  },
  {
    id: "europe",
    label: "EUROPE",
    description: "2 servers for Western and Eastern Europe",
    cities: PLANNED_CITIES.filter(c => c.region.startsWith("EUROPE")),
  },
  {
    id: "asia",
    label: "ASIA",
    description: "Huda City leads Asia, with regional capitals to follow",
    cities: PLANNED_CITIES.filter(c => c.region === "ASIA" || c.region.startsWith("ASIA")),
  },
  {
    id: "oceania",
    label: "OCEANIA",
    description: "1 server for Australia, New Zealand, and the Pacific",
    cities: PLANNED_CITIES.filter(c => c.region === "OCEANIA"),
  },
];
