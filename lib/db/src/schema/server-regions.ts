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

export const PLANNED_CITIES = [
  { cityId: "minx_city", cityName: "MINX CITY", region: "US WEST", timezone: "America/Los_Angeles", themeStyle: "cyberpunk_neon" },
  { cityId: "neon_lagos", cityName: "NEON LAGOS", region: "WEST AFRICA", timezone: "Africa/Lagos", themeStyle: "afrofuturism" },
  { cityId: "sector_berlin", cityName: "SECTOR BERLIN", region: "CENTRAL EUROPE", timezone: "Europe/Berlin", themeStyle: "brutalist_tech" },
  { cityId: "old_shanghai", cityName: "OLD SHANGHAI", region: "EAST ASIA", timezone: "Asia/Shanghai", themeStyle: "neo_imperial" },
  { cityId: "havana_grid", cityName: "HAVANA GRID", region: "CARIBBEAN", timezone: "America/Havana", themeStyle: "retro_tropical" },
  { cityId: "tokyo_core", cityName: "TOKYO CORE", region: "EAST ASIA", timezone: "Asia/Tokyo", themeStyle: "hyper_modern" },
  { cityId: "sao_paulo_nexus", cityName: "SAO PAULO NEXUS", region: "SOUTH AMERICA", timezone: "America/Sao_Paulo", themeStyle: "urban_jungle" },
  { cityId: "dubai_spire", cityName: "DUBAI SPIRE", region: "MIDDLE EAST", timezone: "Asia/Dubai", themeStyle: "desert_chrome" },
  { cityId: "mumbai_circuit", cityName: "MUMBAI CIRCUIT", region: "SOUTH ASIA", timezone: "Asia/Kolkata", themeStyle: "tech_bazaar" },
  { cityId: "london_vault", cityName: "LONDON VAULT", region: "WESTERN EUROPE", timezone: "Europe/London", themeStyle: "industrial_fog" },
  { cityId: "sydney_arc", cityName: "SYDNEY ARC", region: "OCEANIA", timezone: "Australia/Sydney", themeStyle: "coastal_circuit" },
  { cityId: "nairobi_pulse", cityName: "NAIROBI PULSE", region: "EAST AFRICA", timezone: "Africa/Nairobi", themeStyle: "savanna_tech" },
  { cityId: "seoul_grid", cityName: "SEOUL GRID", region: "EAST ASIA", timezone: "Asia/Seoul", themeStyle: "k_digital" },
  { cityId: "mexico_signal", cityName: "MEXICO SIGNAL", region: "NORTH AMERICA", timezone: "America/Mexico_City", themeStyle: "aztec_cyber" },
  { cityId: "istanbul_bridge", cityName: "ISTANBUL BRIDGE", region: "EURASIA", timezone: "Europe/Istanbul", themeStyle: "crossroads_neon" },
  { cityId: "toronto_node", cityName: "TORONTO NODE", region: "NORTH AMERICA", timezone: "America/Toronto", themeStyle: "northern_grid" },
  { cityId: "johannesburg_mine", cityName: "JOHANNESBURG MINE", region: "SOUTHERN AFRICA", timezone: "Africa/Johannesburg", themeStyle: "gold_circuit" },
  { cityId: "singapore_hub", cityName: "SINGAPORE HUB", region: "SOUTHEAST ASIA", timezone: "Asia/Singapore", themeStyle: "garden_tech" },
  { cityId: "cairo_pyramid", cityName: "CAIRO PYRAMID", region: "NORTH AFRICA", timezone: "Africa/Cairo", themeStyle: "ancient_digital" },
  { cityId: "buenos_aires_tango", cityName: "BUENOS AIRES TANGO", region: "SOUTH AMERICA", timezone: "America/Argentina/Buenos_Aires", themeStyle: "passion_circuit" },
  { cityId: "jakarta_flow", cityName: "JAKARTA FLOW", region: "SOUTHEAST ASIA", timezone: "Asia/Jakarta", themeStyle: "island_tech" },
  { cityId: "moscow_zero", cityName: "MOSCOW ZERO", region: "EASTERN EUROPE", timezone: "Europe/Moscow", themeStyle: "frost_grid" },
  { cityId: "new_york_tower", cityName: "NEW YORK TOWER", region: "US EAST", timezone: "America/New_York", themeStyle: "steel_canyon" },
  { cityId: "manila_wave", cityName: "MANILA WAVE", region: "SOUTHEAST ASIA", timezone: "Asia/Manila", themeStyle: "ocean_circuit" },
] as const;
