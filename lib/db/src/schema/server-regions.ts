import { pgTable, serial, varchar, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  cityId: varchar("city_id", { length: 32 }).notNull().unique(),
  cityName: varchar("city_name", { length: 80 }).notNull(),
  region: varchar("region", { length: 60 }).notNull(),
  timezone: varchar("timezone", { length: 60 }).notNull(),
  maxCapacity: integer("max_capacity").notNull().default(100),
  isActive: boolean("is_active").notNull().default(false),
  themeStyle: varchar("theme_style", { length: 40 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCitySchema = createInsertSchema(citiesTable).omit({ id: true, createdAt: true });
export type InsertCity = z.infer<typeof insertCitySchema>;
export type City = typeof citiesTable.$inferSelect;

export interface PlannedCity {
  readonly cityId: string;
  readonly cityName: string;
  readonly region: string;
  readonly timezone: string;
  readonly themeStyle: string;
  readonly accentColor: string;
  readonly bgGradient: string;
  readonly icon: string;
  readonly tagline: string;
  readonly description: string;
  readonly isLive: boolean;
}

export interface ServerRegion {
  id: string;
  label: string;
  description: string;
  cities: PlannedCity[];
}

export const PLANNED_CITIES: readonly PlannedCity[] = [
  { cityId: "minx_city",      cityName: "MINX CITY",      region: "AMERICAS — NORTH",     timezone: "America/Los_Angeles",         themeStyle: "cyberpunk_neon",   accentColor: "#38bdf8", bgGradient: "linear-gradient(135deg, #0c1929 0%, #1a2744 100%)", icon: "\u{1F3D9}\uFE0F", tagline: "THE NEON FRONTIER",          description: "The original. A neon-drenched corporate dystopia run by PABLO CORP. Where it all began.", isLive: true },
  { cityId: "solaris_drift",  cityName: "SOLARIS DRIFT",  region: "AMERICAS — CENTRAL",   timezone: "America/Mexico_City",         themeStyle: "solar_bazaar",    accentColor: "#f59e0b", bgGradient: "linear-gradient(135deg, #1a1207 0%, #2d1f0a 100%)", icon: "\u2600\uFE0F", tagline: "WHERE THE SUN NEVER SETS",   description: "Sun-scorched markets and neon cantinas. Trade flows through here like desert wind.", isLive: false },
  { cityId: "verde_nexus",    cityName: "VERDE NEXUS",    region: "AMERICAS — SOUTH",     timezone: "America/Sao_Paulo",           themeStyle: "jungle_circuit",  accentColor: "#22c55e", bgGradient: "linear-gradient(135deg, #0a1a0e 0%, #0f2d14 100%)", icon: "\u{1F33F}", tagline: "THE GREEN MACHINE",           description: "Tangled jungle data-vines and bioluminescent server farms. Growth is relentless.", isLive: false },
  { cityId: "obsidian_reach", cityName: "OBSIDIAN REACH", region: "AFRICA",               timezone: "Africa/Lagos",                themeStyle: "obsidian_forge",  accentColor: "#a855f7", bgGradient: "linear-gradient(135deg, #140a1e 0%, #1e0f2e 100%)", icon: "\u{1F48E}", tagline: "FORGED IN DARKNESS",          description: "Volcanic glass towers and underground markets. Raw power carved from ancient stone.", isLive: false },
  { cityId: "cobalt_harbor",  cityName: "COBALT HARBOR",  region: "EUROPE — WEST",        timezone: "Europe/London",               themeStyle: "maritime_chrome", accentColor: "#3b82f6", bgGradient: "linear-gradient(135deg, #0a1525 0%, #0f1e38 100%)", icon: "\u2693", tagline: "THE OLD WORLD PORT",          description: "Fog-wrapped docks and chrome-clad trading halls. Tradition meets technology.", isLive: false },
  { cityId: "vostok_gate",    cityName: "VOSTOK GATE",    region: "EUROPE — EAST",        timezone: "Europe/Moscow",               themeStyle: "frost_grid",      accentColor: "#ef4444", bgGradient: "linear-gradient(135deg, #0f0a0a 0%, #1a0f14 100%)", icon: "\u{1F6AA}", tagline: "THE EASTERN THRESHOLD",       description: "Frozen data corridors and iron-walled compounds. Only the strong survive here.", isLive: false },
  { cityId: "crescent_spire", cityName: "CRESCENT SPIRE", region: "ASIA — CRESCENT",      timezone: "Asia/Dubai",                  themeStyle: "desert_chrome",   accentColor: "#eab308", bgGradient: "linear-gradient(135deg, #1a1505 0%, #2b2008 100%)", icon: "\u{1F319}", tagline: "THE GOLDEN PINNACLE",         description: "Gleaming spires pierce the desert sky. Wealth and wisdom converge at the crossroads.", isLive: false },
  { cityId: "amber_circuit",  cityName: "AMBER CIRCUIT",  region: "ASIA — SOUTH",         timezone: "Asia/Kolkata",                themeStyle: "tech_bazaar",     accentColor: "#f97316", bgGradient: "linear-gradient(135deg, #1a0f05 0%, #2d1a08 100%)", icon: "\u{1F536}", tagline: "THE INFINITE BAZAAR",         description: "Chaotic brilliance and endless hustle. A million minds wired into one pulsing circuit.", isLive: false },
  { cityId: "jade_monsoon",   cityName: "JADE MONSOON",   region: "ASIA — SOUTHEAST",     timezone: "Asia/Singapore",              themeStyle: "monsoon_grid",    accentColor: "#14b8a6", bgGradient: "linear-gradient(135deg, #051a17 0%, #0a2d28 100%)", icon: "\u{1F30A}", tagline: "THE EMERALD TIDE",            description: "Tropical data streams and floating server islands. Innovation flows like monsoon rain.", isLive: false },
  { cityId: "dragon_forge",   cityName: "DRAGON FORGE",   region: "ASIA — EAST",          timezone: "Asia/Tokyo",                  themeStyle: "hyper_modern",    accentColor: "#dc2626", bgGradient: "linear-gradient(135deg, #1a0505 0%, #2d0a0a 100%)", icon: "\u{1F409}", tagline: "THE FURNACE OF PROGRESS",     description: "Precision-engineered megastructures and relentless production. The world's engine room.", isLive: false },
  { cityId: "coral_vault",    cityName: "CORAL VAULT",    region: "OCEANIA",              timezone: "Australia/Sydney",             themeStyle: "reef_circuit",    accentColor: "#06b6d4", bgGradient: "linear-gradient(135deg, #051519 0%, #0a252d 100%)", icon: "\u{1F41A}", tagline: "THE DEEP ARCHIVE",            description: "Reef-encrusted data vaults beneath crystal waters. Remote, secure, untouchable.", isLive: false },
];

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
    description: "4 servers across Crescent, South, Southeast, and East Asia",
    cities: PLANNED_CITIES.filter(c => c.region.startsWith("ASIA")),
  },
  {
    id: "oceania",
    label: "OCEANIA",
    description: "1 server for Australia, New Zealand, and the Pacific",
    cities: PLANNED_CITIES.filter(c => c.region === "OCEANIA"),
  },
];
