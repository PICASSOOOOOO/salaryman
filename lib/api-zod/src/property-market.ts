import { z } from "zod";

/** Broker fee is server policy, charged once when a sale or rental is signed. */
export const BROKER_COMMISSION_RATE = 0.05;

/** Rental enforcement policy. Kept shared so API clients cannot invent terms. */
export const PROPERTY_CONTRACT_GRACE_PERIOD_DAYS = 5;
export const PROPERTY_CONTRACT_SECURITY_DEPOSIT_MONTHS = 1;
export const PROPERTY_CONTRACT_CREDIT_HIT_POINTS = 25;
export const PROPERTY_CONTRACT_MAX_CATCH_UP_PERIODS = 6;
export const PROPERTY_CONTRACT_MIN_CREDIT_SCORE = 300;
export const PROPERTY_CONTRACT_STATUSES = ["active", "delinquent", "defaulted", "completed", "terminated"] as const;
export const propertyContractStatusSchema = z.enum(PROPERTY_CONTRACT_STATUSES);
export type PropertyContractStatus = z.infer<typeof propertyContractStatusSchema>;

/**
 * Property entry prices use a USD benchmark and three months of minimum wage.
 * This is separate from the game's ƒ300/hour quick-job wage: properties are
 * real-world-priced assets, while quick jobs are gameplay income.
 */
export const REAL_WORLD_MINIMUM_WAGE_USD_BY_YEAR = {
  2009: 7.25,
  2026: 7.25,
} as const;
export const USD_TO_FIAT_BASELINE = 100;
export const MINIMUM_WAGE_HOURS_PER_MONTH = 720;
export const PROPERTY_STARTING_WAGE_MONTHS = 3;

export function realWorldMinimumWageUsd(year = new Date().getUTCFullYear()): number {
  const years = Object.keys(REAL_WORLD_MINIMUM_WAGE_USD_BY_YEAR).map(Number).sort((a, b) => a - b);
  const applicableYear = years.filter((candidate) => candidate <= year).at(-1) ?? years[0];
  return REAL_WORLD_MINIMUM_WAGE_USD_BY_YEAR[applicableYear as keyof typeof REAL_WORLD_MINIMUM_WAGE_USD_BY_YEAR];
}

export function realWorldMinimumWageFiatPerHour(year = new Date().getUTCFullYear()): number {
  return realWorldMinimumWageUsd(year) * USD_TO_FIAT_BASELINE;
}

export function minimumPropertyStartingFiat(year = new Date().getUTCFullYear()): number {
  return Math.round(
    realWorldMinimumWageFiatPerHour(year)
    * MINIMUM_WAGE_HOURS_PER_MONTH
    * PROPERTY_STARTING_WAGE_MONTHS,
  );
}

export const propertyContractRequestIdSchema = z.object({
  requestId: z.string().uuid(),
}).strict();
export const signRentalContractRequestSchema = propertyContractRequestIdSchema;
export const payPropertyContractRequestSchema = propertyContractRequestIdSchema;
export const terminatePropertyContractRequestSchema = z.object({}).strict();

/** Pure lifecycle primitives used by settlement code and unit tests. */
export function advancePropertyContractDueDate(date: Date): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next;
}
export function propertyContractGraceEndsAt(dueAt: Date): Date {
  return new Date(dueAt.getTime() + PROPERTY_CONTRACT_GRACE_PERIOD_DAYS * 86_400_000);
}
export function propertyContractStatusAt(status: PropertyContractStatus, nextDueAt: Date, graceEndsAt: Date | null, now: Date): PropertyContractStatus {
  if (status === "completed" || status === "terminated" || now < nextDueAt) return status;
  return now >= (graceEndsAt ?? propertyContractGraceEndsAt(nextDueAt)) ? "defaulted" : "delinquent";
}

export const propertyMarketUpsellSchema = z.object({
  id: z.enum(["featured_placement", "professional_property_art", "verified_floor_plan", "priority_agent_service"]),
  priceFiat: z.number().int().positive(),
  listingPoints: z.number().int().nonnegative(),
  title: z.string().min(1),
  description: z.string().min(1),
}).strict();
export type PropertyMarketUpsell = z.infer<typeof propertyMarketUpsellSchema>;

/** Marketing services only; selecting one never grants an ownership right. */
export const PROPERTY_MARKET_UPSELLS = [
  { id: "featured_placement", priceFiat: 7_500, listingPoints: 20, title: "Featured placement", description: "Prominent marketplace placement for this listing." },
  { id: "professional_property_art", priceFiat: 4_000, listingPoints: 10, title: "Professional property art", description: "A professional marketing-art package for this listing." },
  { id: "verified_floor_plan", priceFiat: 6_000, listingPoints: 15, title: "Verified floor-plan package", description: "A verified floor-plan package for buyer review." },
  { id: "priority_agent_service", priceFiat: 12_000, listingPoints: 30, title: "Priority agent service", description: "Priority broker-agent marketing support." },
] as const satisfies readonly PropertyMarketUpsell[];

export const propertyMarketQuoteInputSchema = z.object({
  baseFiat: z.number().finite().nonnegative(),
  economyMultiplier: z.number().finite().positive(),
  selectedUpsellIds: z.array(z.string()).max(PROPERTY_MARKET_UPSELLS.length),
}).strict();
export type PropertyMarketQuote = {
  baseFiat: number; economyMultiplier: number; marketFiat: number; commissionFiat: number;
  upsellFiat: number; points: number; totalFiat: number; selectedUpsells: PropertyMarketUpsell[];
};
export type PropertyMarketQuoteResult = { ok: true; quote: PropertyMarketQuote } | { ok: false; error: "invalid_quote_input" | "unknown_upsell"; unknownUpsellIds?: string[] };

/** Market-only composition for system-owned inventory that has no broker fee. */
export function quoteMarketAdjustedFiat(baseFiat: number, economyMultiplier: number) {
  if (!Number.isFinite(baseFiat) || baseFiat < 0 || !Number.isFinite(economyMultiplier) || economyMultiplier <= 0) {
    throw new Error("baseFiat must be nonnegative and economyMultiplier must be positive");
  }
  return { baseFiat: Math.round(baseFiat), economyMultiplier, totalFiat: Math.round(baseFiat * economyMultiplier) };
}

/** Deterministic whole-FIAT broker quote; unknown services are an explicit error. */
export function quotePropertyMarket(input: unknown): PropertyMarketQuoteResult {
  const parsed = propertyMarketQuoteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_quote_input" };
  const byId = new Map(PROPERTY_MARKET_UPSELLS.map((item) => [item.id, item]));
  const unknownUpsellIds = [...new Set(parsed.data.selectedUpsellIds.filter((id) => !byId.has(id as PropertyMarketUpsell["id"])))];
  if (unknownUpsellIds.length) return { ok: false, error: "unknown_upsell", unknownUpsellIds };
  const selectedUpsells = [...new Set(parsed.data.selectedUpsellIds)].map((id) => byId.get(id as PropertyMarketUpsell["id"])!).map((item) => ({ ...item }));
  const baseFiat = Math.round(parsed.data.baseFiat);
  const economyMultiplier = parsed.data.economyMultiplier;
  const marketFiat = Math.round(baseFiat * economyMultiplier);
  const commissionFiat = Math.round(marketFiat * BROKER_COMMISSION_RATE);
  const upsellFiat = selectedUpsells.reduce((total, item) => total + item.priceFiat, 0);
  return { ok: true, quote: { baseFiat, economyMultiplier, marketFiat, commissionFiat, upsellFiat, points: selectedUpsells.reduce((total, item) => total + item.listingPoints, 0), totalFiat: marketFiat + commissionFiat + upsellFiat, selectedUpsells } };
}

export const publicAssetAddressInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("property"), serverId: z.string().min(1), assetKind: z.enum(["building", "listing"]), assetId: z.number().int().positive() }),
  z.object({ kind: z.literal("listing"), serverId: z.string().min(1), listingId: z.number().int().positive() }),
  z.object({ kind: z.literal("tower_floor"), city: z.string().min(1), floorNumber: z.number().int().positive() }),
  z.object({ kind: z.literal("tower_unit"), city: z.string().min(1), floorNumber: z.number().int().positive(), unitNumber: z.number().int().positive() }),
  z.object({ kind: z.literal("floor_plan_design"), designId: z.string().min(1) }),
]);
export type PublicAssetAddressInput = z.infer<typeof publicAssetAddressInputSchema>;
const slugPart = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** Public identity only; physical routing remains owned by the addresses table. */
export function publicAssetAddress(input: PublicAssetAddressInput): string {
  switch (input.kind) {
    case "property": return `property/${slugPart(input.serverId)}/${input.assetKind}-${input.assetId}`;
    case "listing": return `listing/${slugPart(input.serverId)}/${input.listingId}`;
    case "tower_floor": return `shadow-tower/${slugPart(input.city)}/floor-${input.floorNumber}`;
    case "tower_unit": return `shadow-tower/${slugPart(input.city)}/floor-${input.floorNumber}/unit-${input.unitNumber}`;
    case "floor_plan_design": return `floor-plan/${slugPart(input.designId)}`;
  }
}

export const publicPropertyCatalogItemSchema = z.object({
  kind: z.enum(["property", "tower_floor", "tower_unit", "floor_plan_design", "pledge_item"]),
  title: z.string().min(1), canonicalAddress: z.string().min(1), priceQuote: z.object({ baseFiat: z.number().int().nonnegative(), marketFiat: z.number().int().nonnegative(), totalFiat: z.number().int().nonnegative(), economyMultiplier: z.number().positive() }).strict(),
  paidFeaturePoints: z.number().int().nonnegative(), image: z.string().nullable(), description: z.string(),
}).strict();
export type PublicPropertyCatalogItem = z.infer<typeof publicPropertyCatalogItemSchema>;