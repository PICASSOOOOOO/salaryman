import { Router, type IRouter, type Request } from "express";
import {
  db,
  pledgePurchasesTable,
  pledgeStockTable,
  playerInventoryTable,
  donationsTable,
  agentProjectsTable,
  usersTable,
  botsTable,
  type PledgeCategory,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { getStripe } from "./stripe";
import { isOwnerEmail } from "../lib/plan";
import { isApprovedAlpha } from "./alpha";
import { ITEM_CATALOG, type ItemStats } from "../lib/item-catalog";
import { recordLegacyRecoveryEvent, restoreLegacyRecoveryForUser } from "../lib/legacy-recovery";

const router: IRouter = Router();

// ─── Pledge catalog ───────────────────────────────────────────────────────
// Dollar-backed items. Only the agent/membership subset is exposed through the
// Pledge Store; property, gear, and other in-world advantages are earned or
// purchased with FIAT from the game economy. The full definitions remain here
// so historical pledge webhooks can still fulfill older purchases safely.
// Architectural spec for buildable/property pledges — drives the floor-plan,
// elevation schematic, and stats previews in the Pledge Store. Optional: only
// physical structures carry one.
export interface BuildingSpec {
  floors: number;       // total stories — Shadow Tower is the tallest in the city
  heightM: number;      // structural height in metres
  sqft: number;         // gross floor area
  footprint: string;    // plan dimensions, e.g. "42m × 38m"
  style: string;        // architectural language
  architect: string;    // studio / designer flavour
  materials: string[];  // facade + structure materials
  prestige: number;     // 0–100 in-game prestige rating
  rooms: string[];      // labelled rooms for the floor-plan preview
  summary: string;      // one-line architectural pitch
}

export interface PledgeItem {
  id: string;
  category: PledgeCategory;
  name: string;
  blurb: string;
  effect: string;
  // SECRET cost basis in whole USD. This is the house's cost, NEVER the price
  // the player pays and NEVER serialized to the client. The retail price the
  // store charges/shows is derived from this via retailPriceUsd() (cost-plus
  // markup). See the CONFIDENTIAL pricing section below.
  costUsd: number;
  icon: string;
  spec?: BuildingSpec;
  // A bundle delivers several other catalog items at once. When set, this
  // listing's member items are each granted on purchase (one pledge ledger row
  // per member + any gear), and its retail price is its own (discounted) cost
  // basis plus markup. Members MUST be non-limited base pledges/gear.
  bundleOf?: string[];
  // When set, completing this purchase ALSO drops the named Armory gear item
  // into the player's inventory (in addition to the pledge ledger row). Used to
  // consolidate the premium real-money gear into the single Pledge Store
  // storefront while reusing the existing checkout + webhook fulfillment.
  fulfill?: { gearItemId?: string };
  // Sold at face value with NO markup (e.g. a fixed-price subscription). Almost
  // nothing uses this — the store is cost-plus by default.
  noMarkup?: boolean;
  // When set, this listing is a recurring subscription that grants the named
  // plan feature. It is purchased through the existing subscription checkout
  // (POST /stripe/create-checkout-session, mode:"subscription") — NOT the
  // one-time /pledge/checkout — so recurring billing + the feature grant stay
  // intact. It is consolidated into the storefront for visibility only and is
  // always sold at face value (noMarkup). The feature key is client-safe.
  subscriptionFeature?: string;
  // Routes the buyer into an existing selection flow instead of generic pledge
  // checkout. A phone number must be selected and reserved before payment.
  storeAction?: "phone_number_picker";
  // Surfaced in the reusable Pledge Store popup that replaces the scattered
  // promo-page redirects when a paid terminal feature is locked. Kept to a
  // tiny curated set (1–3 items) — each maps to a single Stripe price the
  // owner creates by hand (see PLEDGE_PRICE_ENV).
  popup?: boolean;
  // Scarce limited drop: only `stock` of these will ever be sold. When marked
  // limited, the store shows remaining stock and the item sells out
  // permanently. Stock is tracked + atomically reserved server-side
  // (pledge_stock) so concurrent purchases can never oversell.
  limited?: boolean;
  stock?: number;
}

// itemId → env var holding the Stripe Price ID the owner created by hand for
// that pledge. When set, checkout charges that exact price; otherwise it falls
// back to an inline price_data line built from priceUsd (so dev still works).
// Server-only — never surfaced to the client.
const PLEDGE_PRICE_ENV: Record<string, string> = {
  term_pablo_pass: "STRIPE_PRICE_PLEDGE_TERM_PABLO_PASS",
  term_phone_pass: "STRIPE_PRICE_PLEDGE_TERM_PHONE_PASS",
};

export const PLEDGE_CATALOG: PledgeItem[] = [
  // PROPERTY — every venture is forced to have an office; these are the deeds.
  {
    id: "prop_corner_office", category: "property", name: "Corner Office Suite",
    blurb: "Top-floor glass office with a skyline view.",
    effect: "Unlocks the Suite office tier for a venture — lower rent drag, higher prestige.",
    costUsd: 49, icon: "🏢",
    spec: {
      floors: 1, heightM: 4.2, sqft: 2400, footprint: "28m × 22m",
      style: "Curtain-wall corporate modern",
      architect: "MINX CITY — Helix Office Group",
      materials: ["Low-iron glass curtain wall", "Brushed aluminium mullions", "Polished concrete floors"],
      prestige: 58,
      rooms: ["Reception", "Open Desk Pool", "Glass Meeting Room", "Executive Office", "Break Bar", "Skyline Terrace"],
      summary: "A full top-floor suite — light on every side, prestige on every wall.",
    },
  },
  {
    id: "prop_warehouse", category: "property", name: "Riverside Warehouse",
    blurb: "Industrial footprint for heavy operations.",
    effect: "Adds a second property slot so you can run two ventures at once.",
    costUsd: 79, icon: "🏭",
    spec: {
      floors: 3, heightM: 18, sqft: 18000, footprint: "60m × 40m",
      style: "Adaptive-reuse industrial loft",
      architect: "MINX CITY — Dockside Reclaimed Works",
      materials: ["Reclaimed steel frame", "Exposed brick", "Sawtooth glazed roof", "Cross-laminated timber decks"],
      prestige: 47,
      rooms: ["Loading Bay", "Production Floor", "Mezzanine Studios", "Cold Storage", "Ops Office", "Rooftop Yard"],
      summary: "Raw square footage by the water — built to run two ventures at once.",
    },
  },
  {
    id: "prop_penthouse", category: "property", name: "Shadow Tower Penthouse",
    blurb: "The crown of the tallest tower in the city.",
    effect: "Permanent prestige office at the summit of Shadow Tower — no rent, max prestige, flagship HQ.",
    costUsd: 199, icon: "🏙️", limited: true, stock: 25,
    spec: {
      floors: 120, heightM: 540, sqft: 9800, footprint: "44m × 44m",
      style: "Neo-brutalist obsidian supertall",
      architect: "PABLO CORP — Office of the Boss",
      materials: ["Black anodized titanium skin", "Electrochromic smart glass", "Carbon-fibre core", "Gold-leaf inlay"],
      prestige: 100,
      rooms: ["Private Sky Lobby", "The Boss's Office", "Boardroom 100", "Vault", "Helipad", "Observation Deck", "Penthouse Quarters"],
      summary: "Floor 120 of Shadow Tower — the highest, most expensive address in SALARYMAN.",
    },
  },

  // BOTS — pixel agents that actively build your ventures.
  { id: "bot_extra_seat", category: "bots", name: "Extra Agent Seat", blurb: "One more pixel agent on your roster.", effect: "Adds +1 deployable agent slot on the Command Deck.", costUsd: 25, icon: "🤖" },
  { id: "bot_overclock", category: "bots", name: "Agent Overclock", blurb: "Push your agents harder.", effect: "Agents progress ventures faster (higher progress per build cycle).", costUsd: 39, icon: "⚡" },
  { id: "bot_jean_claw_elite", category: "bots", name: "Jean Claw Elite Squad", blurb: "Jean Claw hand-picks a specialist strike team.", effect: "Unlocks a premium 5-strong Pixel Agent squad tuned for building apps and businesses.", costUsd: 89, icon: "🎩", limited: true, stock: 100 },

  // WEAPONS — edge in the wasteland / PvP social layer.
  { id: "wpn_briefcase", category: "weapons", name: "Loaded Briefcase", blurb: "Looks corporate. Isn't.", effect: "Self-defense item — survive longer outside the city core.", costUsd: 19, icon: "💼" },
  { id: "wpn_gasmask", category: "weapons", name: "Corporate Gasmask", blurb: "Breathe through the poison fog.", effect: "Move freely through poison-gas zones without taking damage.", costUsd: 29, icon: "😷" },
  { id: "wpn_escort", category: "weapons", name: "Private Escort", blurb: "A pixel bodyguard that travels with you.", effect: "Armed escort lets you roam far from home safely.", costUsd: 59, icon: "🛡️" },

  // FURNITURE — office buffs.
  { id: "furn_standing_desks", category: "furniture", name: "Standing Desk Set", blurb: "Ergonomic, expensive, productive.", effect: "Small permanent productivity buff to all agents in this office.", costUsd: 15, icon: "🪑" },
  { id: "furn_boardroom", category: "furniture", name: "Glass Boardroom", blurb: "Close deals in style.", effect: "Boosts negotiation / deal outcomes in meetings.", costUsd: 45, icon: "🛋️" },

  // TECHNOLOGY — platform power-ups.
  { id: "tech_server_rack", category: "technology", name: "Private Server Rack", blurb: "Your own metal.", effect: "Higher API / compute budget for your ventures and agents.", costUsd: 69, icon: "🖥️" },
  { id: "tech_quantum", category: "technology", name: "Quantum Co-Processor", blurb: "Bleeding edge.", effect: "Unlocks the fastest agent build tier and priority briefings.", costUsd: 149, icon: "🧬" },

  // OFFICE SUPPLIES — small consumable / cosmetic advantages.
  { id: "sup_espresso", category: "office_supplies", name: "Espresso Machine", blurb: "Fuel the grind.", effect: "Agents take fewer coffee breaks — steadier output.", costUsd: 12, icon: "☕" },
  { id: "sup_letterhead", category: "office_supplies", name: "Embossed Letterhead", blurb: "First impressions.", effect: "Cosmetic prestige on documents and invoices your ventures send.", costUsd: 9, icon: "📄" },

  // DECOR — flex.
  { id: "decor_neon", category: "decor", name: "Neon Sign Pack", blurb: "Light up your HQ.", effect: "Animated neon decor for your office interior.", costUsd: 14, icon: "🌃" },
  { id: "decor_aquarium", category: "decor", name: "Shark Aquarium", blurb: "Subtle.", effect: "Centerpiece decor that raises office prestige.", costUsd: 34, icon: "🦈" },

  // SKINS — player / UI cosmetics.
  { id: "skin_gold_suit", category: "skins", name: "Gold Pinstripe Suit", blurb: "Dress like you've made it.", effect: "Rare player skin worn across the world.", costUsd: 24, icon: "🤵", limited: true, stock: 250 },
  { id: "skin_nebula_ui", category: "skins", name: "Nebula UI Theme", blurb: "Pablo's signature look.", effect: "Applies the Pablo nebula theme across your whole interface.", costUsd: 18, icon: "🌌" },

  // TERMINALS — the device you operate SALARYMAN from.
  // POPUP PASSES — one-time unlocks for the terminal's paid features. Shown in
  // the Pledge Store popup that replaces promo-page redirects. Each maps to a
  // single hand-made Stripe price (PLEDGE_PRICE_ENV) and to terminal features
  // via PLEDGE_FEATURE_UNLOCKS in lib/plan.ts — pledge_purchases is the one
  // ledger both the terminal and the in-world game read.
  {
    id: "term_pablo_pass", category: "terminals", name: "PABLO Listening Pass",
    blurb: "Unlock the terminal's listening suite — for keeps.",
    effect: "Permanently unlocks Live Listen, Screen Scan, and Say This across the terminal and your Command Deck. One-time pledge, no subscription.",
    costUsd: 49, icon: "🎧", popup: true,
  },
  {
    id: "term_phone_pass", category: "terminals", name: "Phone System Pass",
    blurb: "Your own AI-run phone line.",
    effect: "Permanently unlocks the full Phone System — dialer, voicemail, call center, and AI secretary. One-time pledge, no subscription.",
    costUsd: 99, icon: "📞", popup: true,
  },
  { id: "term_holo", category: "terminals", name: "Holo Terminal", blurb: "From the future.", effect: "Premium holographic terminal type with extra panels.", costUsd: 54, icon: "🔮" },
];

// Retired products stay server-side solely so delayed Stripe webhooks and
// existing purchase records retain their original catalog identity. They are
// intentionally excluded from all active catalog and checkout lookups.
const RETIRED_FULFILLMENT_CATALOG: PledgeItem[] = [
  {
    id: "term_retro",
    category: "terminals",
    name: "Retired Terminal Cosmetic",
    blurb: "Retired product — retained for purchase-history fulfillment only.",
    effect: "Historical entitlement retained without enabling a selectable terminal skin.",
    costUsd: 16,
    icon: "📟",
  },
];

// ─── CONFIDENTIAL: cost-plus pricing ─────────────────────────────────────────
// Every catalog entry carries a SECRET cost basis (costUsd). The price the
// store charges and shows the player is cost + markup. NEITHER the cost basis
// NOR the markup percentage ever leaves the server — the catalog/popup
// responses serialize ONLY the derived retail price via toPublicItem(). The
// markup is owner-tunable via PLEDGE_MARKUP_PCT (a server env var, never
// exposed); default is a 300% markup, i.e. retail = cost × 4.
const DEFAULT_MARKUP_PCT = 300;

function markupPct(): number {
  const raw = process.env.PLEDGE_MARKUP_PCT?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MARKUP_PCT;
}

// Final retail price in whole USD for a catalog entry. Cost-plus:
//   retail = round(cost × (1 + markup/100))
// Items flagged noMarkup (e.g. a fixed-price subscription) are sold at cost.
export function retailPriceUsd(item: Pick<PledgeItem, "costUsd" | "noMarkup">): number {
  if (item.noMarkup) return Math.round(item.costUsd);
  return Math.round(item.costUsd * (1 + markupPct() / 100));
}

// ─── Consolidated Armory gear ────────────────────────────────────────────────
// Surface the premium (real-money) Armory gear as Pledge Store listings so the
// store is the single storefront for everything that costs real money. The
// gear's own established USD price is our cost basis here; the store sells it
// cost-plus like everything else, and fulfillment drops the item straight into
// the player's Armory inventory (see fulfillEntitlements). The Armory's own
// in-place purchase path is unchanged.
function describeStats(stats: ItemStats): string {
  const parts: string[] = [];
  if (stats.attack) parts.push(`ATK ${stats.attack}`);
  if (stats.defense) parts.push(`DEF ${stats.defense}`);
  if (stats.magic) parts.push(`MAG ${stats.magic}`);
  if (stats.tech) parts.push(`TECH ${stats.tech}`);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

const GEAR_LISTINGS: PledgeItem[] = ITEM_CATALOG
  .filter((g) => g.priceUsd != null && g.priceUsd > 0)
  .map((g) => ({
    id: `gear_${g.id}`,
    category: "gear" as PledgeCategory,
    name: g.name,
    blurb: g.blurb,
    effect: `Armory gear — delivered straight to your loadout${describeStats(g.stats)}.`,
    costUsd: g.priceUsd!,
    icon: g.icon,
    fulfill: { gearItemId: g.id },
  }));

// ─── Bundles ─────────────────────────────────────────────────────────────────
// Curated multi-item packs. A bundle's cost basis is the sum of its members'
// costs at a bundle discount, then sold cost-plus like everything else — so a
// bundle always lands cheaper than buying each member individually. Members
// must be non-limited base pledges or gear listings.
const BUNDLE_COST_DISCOUNT = 0.85; // 15% off the summed member cost basis

interface BundleDef {
  id: string;
  name: string;
  blurb: string;
  effect: string;
  icon: string;
  memberIds: string[];
}

const BUNDLE_DEFS: BundleDef[] = [
  {
    id: "bundle_founder",
    name: "Founder's Office Starter",
    blurb: "Everything to stand up your first HQ in one move.",
    effect: "A corner-office suite, standing desks, an espresso machine, and neon — your first venture, fully furnished.",
    icon: "🏢",
    memberIds: ["prop_corner_office", "furn_standing_desks", "sup_espresso", "decor_neon"],
  },
  {
    id: "bundle_survival",
    name: "Wasteland Survival Kit",
    blurb: "Walk out past the city core and come back.",
    effect: "Loaded briefcase, corporate gasmask, and a private escort — roam the poison zones without dying.",
    icon: "🧳",
    memberIds: ["wpn_briefcase", "wpn_gasmask", "wpn_escort"],
  },
  {
    id: "bundle_power",
    name: "Command Deck Power Pack",
    blurb: "Scale your agents and your compute at once.",
    effect: "An extra agent seat, agent overclock, a private server rack, and the quantum co-processor — max build throughput.",
    icon: "⚡",
    memberIds: ["bot_extra_seat", "bot_overclock", "tech_server_rack", "tech_quantum"],
  },
];

function findInBaseOrGear(id: string): PledgeItem | undefined {
  return PLEDGE_CATALOG.find((i) => i.id === id) ?? GEAR_LISTINGS.find((i) => i.id === id);
}

const BUNDLE_LISTINGS: PledgeItem[] = BUNDLE_DEFS.map((b) => {
  const members = b.memberIds.map((id) => {
    const m = findInBaseOrGear(id);
    if (!m) throw new Error(`Bundle ${b.id} references unknown member ${id}`);
    if (m.limited) throw new Error(`Bundle ${b.id} may not include limited member ${id}`);
    return m;
  });
  const summedCost = members.reduce((t, m) => t + m.costUsd, 0);
  return {
    id: b.id,
    category: "bundles" as PledgeCategory,
    name: b.name,
    blurb: b.blurb,
    effect: `${b.effect} Includes: ${members.map((m) => m.name).join(", ")}.`,
    costUsd: Math.round(summedCost * BUNDLE_COST_DISCOUNT),
    icon: b.icon,
    bundleOf: b.memberIds,
  };
});

// PABLO PRIME — the $149/mo platform subscription. Consolidated INTO the
// storefront so every real-money offer lives in one place, but it is a
// recurring subscription that grants the `claw_bot` feature (which bundles
// every paid capability). It is purchased via the subscription checkout, never
// /pledge/checkout, and is listed at face value with NO markup.
const PRIME_LISTING: PledgeItem = {
  id: "membership_pablo_prime",
  category: "membership",
  name: "PABLO PRIME",
  blurb: "The whole platform in one subscription.",
  effect: "Unlocks Jean Claw and the full Pixel Agent workforce, Live Listen, Screen Scan, Say This, and the complete Phone System with AI secretary — billed $149/mo.",
  costUsd: 149,
  noMarkup: true,
  subscriptionFeature: "claw_bot",
  icon: "👑",
};

const PHONE_NUMBER_LISTING: PledgeItem = {
  id: "phone_number",
  category: "terminals",
  name: "Custom Phone Number",
  blurb: "Your own SALARYMAN line.",
  effect: "Choose one available Twilio number for a $10 one-time purchase. Phone System access is required for calling and SMS.",
  costUsd: 10,
  noMarkup: true,
  icon: "☎",
  storeAction: "phone_number_picker",
};

// The full internal catalog is retained for delayed webhook fulfillment, but
// the live storefront has exactly three products: Phone System, Custom Phone
// Number, and PABLO PRIME. Historical products stay fulfillment-only.
const FULL_CATALOG: PledgeItem[] = [
  ...PLEDGE_CATALOG,
  ...RETIRED_FULFILLMENT_CATALOG,
  ...GEAR_LISTINGS,
  ...BUNDLE_LISTINGS,
  PRIME_LISTING,
  PHONE_NUMBER_LISTING,
];
const PUBLIC_PRODUCT_IDS = new Set(["term_phone_pass", "phone_number", "membership_pablo_prime"]);
const PUBLIC_CATALOG = FULL_CATALOG.filter((item) => PUBLIC_PRODUCT_IDS.has(item.id));
const PUBLIC_CATEGORIES = ["terminals", "membership"] as const;

// Client-safe projection. This is the ONLY shape that reaches the client:
// the derived retail price ONLY — never costUsd, markup, or internal
// fulfillment wiring (bundleOf / fulfill / noMarkup).
type StockInfo = { stockTotal: number; stockRemaining: number; soldOut: boolean };
function toPublicItem(item: PledgeItem, stock?: StockInfo) {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    blurb: item.blurb,
    effect: item.effect,
    priceUsd: retailPriceUsd(item),
    icon: item.icon,
    ...(item.spec ? { spec: item.spec } : {}),
    ...(item.limited ? { limited: true } : {}),
    ...(item.subscriptionFeature ? { subscriptionFeature: item.subscriptionFeature } : {}),
    ...(item.storeAction ? { storeAction: item.storeAction } : {}),
    ...(stock ?? {}),
  };
}

function findItem(id: string): PledgeItem | undefined {
  return FULL_CATALOG.find((i) => i.id === id);
}

function findPublicItem(id: string): PledgeItem | undefined {
  return PUBLIC_CATALOG.find((i) => i.id === id);
}

// Grant everything a purchased listing delivers BEYOND its own pledge ledger
// row: bundle members (one completed ledger row each) and Armory gear (into the
// player's inventory). Idempotent — safe to call again on a webhook retry.
async function fulfillEntitlements(userId: string, item: PledgeItem): Promise<void> {
  // Gear → Armory inventory (slot 0, the primary character), like /items.
  if (item.fulfill?.gearItemId) {
    await db
      .insert(playerInventoryTable)
      .values({ userId, slotIndex: 0, itemId: item.fulfill.gearItemId, acquiredVia: "stripe" })
      .onConflictDoNothing();
  }
  // Bundle → grant each member's entitlement.
  if (item.bundleOf) {
    for (const memberId of item.bundleOf) {
      const member = findInBaseOrGear(memberId);
      if (!member) continue;
      // One completed ledger row per member (amountCents 0 — the bundle row
      // carries the charge). Guard duplicates: pledge_purchases has no unique
      // constraint, so check before inserting.
      const [existing] = await db
        .select({ id: pledgePurchasesTable.id })
        .from(pledgePurchasesTable)
        .where(and(
          eq(pledgePurchasesTable.userId, userId),
          eq(pledgePurchasesTable.itemId, member.id),
          eq(pledgePurchasesTable.status, "completed"),
        ))
        .limit(1);
      if (!existing) {
        await db.insert(pledgePurchasesTable).values({
          userId,
          itemId: member.id,
          category: member.category,
          name: member.name,
          amountCents: 0,
          status: "completed",
          grantedBy: "bundle",
        });
      }
      // A member that is itself gear still drops into inventory.
      if (member.fulfill?.gearItemId) {
        await db
          .insert(playerInventoryTable)
          .values({ userId, slotIndex: 0, itemId: member.fulfill.gearItemId, acquiredVia: "stripe" })
          .onConflictDoNothing();
      }
    }
  }
}

function requireAuth(req: Request, res: any): string | null {
  if (!(req as any).isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const id = (req as any).user?.id ?? null;
  if (!id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return id;
}

function requireOwner(req: Request, res: any): string | null {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  const email = (req as any).user?.email as string | undefined;
  if (!isOwnerEmail(email)) {
    res.status(403).json({ error: "Owner access only" });
    return null;
  }
  return userId;
}

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:3000";
}

// ─── Limited-drop stock ──────────────────────────────────────────────────────
// Scarce items (item.limited) have a fixed lifetime quantity (item.stock). The
// pledge_stock table holds the authoritative total + sold counters. Stock is
// reserved at checkout creation via an atomic conditional UPDATE that can never
// oversell, and released if the Stripe session expires or the payment fails.
const LIMITED_ITEMS = FULL_CATALOG.filter((i) => i.limited && (i.stock ?? 0) > 0);

let stockSeeded = false;
async function ensureStockSeeded(): Promise<void> {
  if (stockSeeded || LIMITED_ITEMS.length === 0) return;
  // Upsert one row per limited item. Keep `sold` intact on conflict but resync
  // `total` to the catalog value so adjusting the drop size in code takes effect.
  await db
    .insert(pledgeStockTable)
    .values(LIMITED_ITEMS.map((i) => ({ itemId: i.id, total: i.stock!, sold: 0 })))
    .onConflictDoUpdate({
      target: pledgeStockTable.itemId,
      set: { total: sql`excluded.total`, updatedAt: new Date() },
    });
  stockSeeded = true;
}

async function getStockMap(): Promise<Map<string, { total: number; sold: number }>> {
  if (LIMITED_ITEMS.length === 0) return new Map();
  await ensureStockSeeded();
  const rows = await db
    .select()
    .from(pledgeStockTable)
    .where(inArray(pledgeStockTable.itemId, LIMITED_ITEMS.map((i) => i.id)));
  return new Map(rows.map((r) => [r.itemId, { total: r.total, sold: r.sold }]));
}

// Atomically claim one unit. Returns false (sold out) when sold already == total.
async function reserveStock(itemId: string): Promise<boolean> {
  await ensureStockSeeded();
  const rows = await db
    .update(pledgeStockTable)
    .set({ sold: sql`${pledgeStockTable.sold} + 1`, updatedAt: new Date() })
    .where(and(eq(pledgeStockTable.itemId, itemId), sql`${pledgeStockTable.sold} < ${pledgeStockTable.total}`))
    .returning({ itemId: pledgeStockTable.itemId });
  return rows.length > 0;
}

// Give back a previously-reserved unit (abandoned/expired/failed checkout).
async function releaseStock(itemId: string): Promise<void> {
  await db
    .update(pledgeStockTable)
    .set({ sold: sql`GREATEST(${pledgeStockTable.sold} - 1, 0)`, updatedAt: new Date() })
    .where(eq(pledgeStockTable.itemId, itemId));
}

function itemIsLimited(itemId: string): boolean {
  return LIMITED_ITEMS.some((i) => i.id === itemId);
}

// ─── Catalog ────────────────────────────────────────────────────────────────
router.get("/pledge/catalog", async (_req, res) => {
  try {
    const stock = await getStockMap();
    const items = PUBLIC_CATALOG.map((i) => {
      if (!i.limited) return toPublicItem(i);
      const s = stock.get(i.id);
      const total = s?.total ?? i.stock ?? 0;
      const remaining = Math.max(0, total - (s?.sold ?? 0));
      return toPublicItem(i, { stockTotal: total, stockRemaining: remaining, soldOut: remaining <= 0 });
    });
    res.json({ categories: PUBLIC_CATEGORIES, items });
  } catch {
    // Stock lookup is non-critical — fall back to the (still client-safe)
    // catalog so the store renders even if the stock table is unavailable.
    res.json({ categories: PUBLIC_CATEGORIES, items: PUBLIC_CATALOG.map((i) => toPublicItem(i)) });
  }
});

// ─── Popup catalog ───────────────────────────────────────────────────────────
// The small curated set (1–3 items) shown in the Pledge Store popup that opens
// when a paid terminal feature is locked — instead of redirecting to a promo
// page. Same checkout + entitlement plumbing as the full store.
router.get("/pledge/popup", (_req, res) => {
  res.json({ items: FULL_CATALOG.filter((i) => i.popup).map((i) => toPublicItem(i)) });
});

// ─── Owned entitlements ──────────────────────────────────────────────────────
router.get("/pledge/owned", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    await restoreLegacyRecoveryForUser(userId, (req as any).user?.email);
    const rows = await db
      .select()
      .from(pledgePurchasesTable)
      .where(and(eq(pledgePurchasesTable.userId, userId), eq(pledgePurchasesTable.status, "completed")))
      .orderBy(desc(pledgePurchasesTable.createdAt));
    res.json({ owned: rows, itemIds: rows.map((r) => r.itemId) });
  } catch {
    res.status(500).json({ error: "Failed to load entitlements" });
  }
});

// ─── Checkout ────────────────────────────────────────────────────────────────
router.post("/pledge/checkout", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const itemId = (req.body?.itemId ?? "") as string;
  const item = findPublicItem(itemId);
  if (!item) {
    res.status(400).json({ error: "Unknown pledge item" });
    return;
  }

  // Subscription listings (e.g. PABLO PRIME) are recurring and grant a plan
  // feature — they must go through the subscription checkout, never the
  // one-time pledge path (which would charge once and skip the feature grant).
  if (item.subscriptionFeature) {
    res.status(400).json({
      error: "subscription_item",
      subscriptionFeature: item.subscriptionFeature,
      message: "Use the subscription checkout for this membership.",
    });
    return;
  }
  if (item.storeAction === "phone_number_picker") {
    res.status(400).json({
      error: "phone_number_selection_required",
      message: "Choose an available number in Phone System before starting checkout.",
    });
    return;
  }

  // Free grants are limited to staff and the alpha program — everyone else pays
  // via Stripe below. Owners/Picasso staff run the place; approved alpha
  // testers/devs are exercising the store as part of testing.
  const email = (req as any).user?.email as string | undefined;
  const owner = isOwnerEmail(email);
  const alpha = owner ? { tester: false, dev: false } : await isApprovedAlpha(userId);
  if (owner || alpha.tester || alpha.dev) {
    // Idempotent: don't stack duplicate free grants for the same item.
    const [existing] = await db
      .select({ id: pledgePurchasesTable.id })
      .from(pledgePurchasesTable)
      .where(and(
        eq(pledgePurchasesTable.userId, userId),
        eq(pledgePurchasesTable.itemId, item.id),
        eq(pledgePurchasesTable.status, "completed"),
      ))
      .limit(1);
    if (existing) {
      res.json({ granted: true, owner, tester: !owner, alreadyOwned: true });
      return;
    }
    // Limited drops sell out permanently even for free grants — claim a unit so
    // the scarce supply count stays accurate.
    if (itemIsLimited(item.id)) {
      const claimed = await reserveStock(item.id);
      if (!claimed) {
        res.status(409).json({ error: "sold_out" });
        return;
      }
    }
    try {
      await db.insert(pledgePurchasesTable).values({
        userId,
        itemId: item.id,
        category: item.category,
        name: item.name,
        amountCents: 0,
        status: "completed",
        grantedBy: owner ? "owner" : "tester",
      });
      // Grant bundle members + gear for free grants too.
      await fulfillEntitlements(userId, item);
      await recordLegacyRecoveryEvent({
        userId,
        eventKey: `pledge:item:${userId}:${item.id}`,
        kind: "pledge_entitlement",
        itemId: item.id,
        payload: { category: item.category, name: item.name, amountCents: 0 },
      });
    } catch (err) {
      if (itemIsLimited(item.id)) await releaseStock(item.id);
      throw err;
    }
    res.json({ granted: true, owner, tester: !owner });
    return;
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    res.status(503).json({ error: "Store checkout is not configured yet" });
    return;
  }
  const baseUrl = getAppBaseUrl();

  // The amount charged is ALWAYS the derived cost-plus retail price, built
  // inline so what the player is charged exactly equals what the catalog shows
  // (the cost basis/markup never leave the server). A hand-made fixed Stripe
  // Price (PLEDGE_PRICE_ENV) is honored ONLY for noMarkup, face-value products
  // (e.g. a fixed subscription) — for cost-plus items it could silently diverge
  // from the markup, so it is intentionally bypassed for them.
  const retailUsd = retailPriceUsd(item);
  const priceEnv = item.noMarkup ? PLEDGE_PRICE_ENV[item.id] : undefined;
  const fixedPriceId = priceEnv ? process.env[priceEnv]?.trim() : undefined;
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = fixedPriceId
    ? [{ price: fixedPriceId, quantity: 1 }]
    : [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${item.name} — SALARYMAN Pledge Store`,
              description: item.effect,
            },
            unit_amount: retailUsd * 100,
          },
          quantity: 1,
        },
      ];

  // Reserve a unit of any limited drop BEFORE creating the session so two
  // shoppers can't both check out the last one. Released on expiry/failure
  // (webhook) or immediately below if session creation throws.
  const limited = itemIsLimited(item.id);
  if (limited) {
    const claimed = await reserveStock(item.id);
    if (!claimed) {
      res.status(409).json({ error: "sold_out" });
      return;
    }
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${baseUrl}/pledge?purchase=success&item=${item.id}`,
      cancel_url: `${baseUrl}/pledge?purchase=cancel`,
      client_reference_id: userId,
      // Hold the reservation for the Stripe session lifetime; an abandoned
      // checkout releases its unit via checkout.session.expired.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: {
        userId,
        type: "pledge",
        itemId: item.id,
        category: item.category,
        limited: limited ? "1" : "0",
        brand: "Picassoo.AI",
        product_line: "SALARYMAN",
      },
      payment_intent_data: {
        description: `${item.name} by Picassoo.AI — SALARYMAN`,
      },
    });
  } catch (err) {
    if (limited) await releaseStock(item.id);
    throw err;
  }

  try {
    await db.insert(pledgePurchasesTable).values({
      userId,
      itemId: item.id,
      category: item.category,
      name: item.name,
      amountCents: retailUsd * 100,
      stripeSessionId: session.id,
      status: "pending",
      grantedBy: "stripe",
    });
  } catch (err) {
    if (limited) await releaseStock(item.id);
    throw err;
  }

  res.json({ url: session.url });
});

// ─── Webhook fulfillment (called from stripe.ts) ─────────────────────────────
// Only grant the item once funds are actually settled. For instant methods
// (cards) `checkout.session.completed` already carries payment_status="paid".
// For delayed methods the session completes "unpaid" and settles later via
// `checkout.session.async_payment_succeeded` (or fails via the _failed event).
export async function handlePledgeWebhookEvent(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.type !== "pledge" || !session.id) return;

  // A failed payment or an abandoned/expired checkout frees the reserved unit
  // of any limited drop so it returns to available stock.
  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const status = event.type === "checkout.session.expired" ? "expired" : "failed";
    // Stripe webhooks are at-least-once: a retry of the same failure/expiry
    // event must NOT release stock twice. Gate the release on the row actually
    // transitioning out of "pending" — RETURNING is empty on duplicate deliveries.
    const transitioned = await db
      .update(pledgePurchasesTable)
      .set({ status })
      .where(and(
        eq(pledgePurchasesTable.stripeSessionId, session.id),
        eq(pledgePurchasesTable.status, "pending"),
      ))
      .returning({ id: pledgePurchasesTable.id });
    const itemId = session.metadata?.itemId;
    if (transitioned.length > 0 && session.metadata?.limited === "1" && itemId) {
      await releaseStock(itemId);
    }
    console.log(`[Pledge] Checkout ${status} — session ${session.id}, item ${itemId}${transitioned.length > 0 ? "" : " (duplicate, no-op)"}`);
    return;
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (session.payment_status !== "paid") {
      // Delayed payment not settled yet — leave row pending until the async event.
      console.log(`[Pledge] Session ${session.id} completed but unpaid (${session.payment_status}); awaiting settlement.`);
      return;
    }
    // Gate fulfillment on the row actually transitioning to completed so an
    // at-least-once webhook retry doesn't re-grant (RETURNING is empty on a
    // duplicate delivery). fulfillEntitlements is itself idempotent as a backstop.
    const completed = await db
      .update(pledgePurchasesTable)
      .set({ status: "completed" })
      .where(and(
        eq(pledgePurchasesTable.stripeSessionId, session.id),
        eq(pledgePurchasesTable.status, "pending"),
      ))
      .returning({ id: pledgePurchasesTable.id });
    if (completed.length > 0) {
      const itemId = session.metadata?.itemId;
      const userId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
      const item = itemId ? findItem(itemId) : undefined;
      if (userId && item) await fulfillEntitlements(userId, item);
      if (userId && item) {
        await recordLegacyRecoveryEvent({
          userId,
          eventKey: `pledge:session:${session.id}`,
          kind: "pledge_entitlement",
          itemId: item.id,
          payload: {
            category: item.category,
            name: item.name,
            amountCents: session.amount_total ?? 0,
            stripeSessionId: session.id,
          },
        });
      }
    }
    console.log(`[Pledge] Purchase completed — session ${session.id}, item ${session.metadata?.itemId}${completed.length > 0 ? "" : " (duplicate, no-op)"}`);
  }
}

// ─── Admin: State of SALARYMAN overview (owner only) ─────────────────────────
async function buildOverview() {
  const [userCount] = await db.select({ c: sql<number>`count(*)::int` }).from(usersTable);
  const [botCount] = await db.select({ c: sql<number>`count(*)::int` }).from(botsTable);
  const [ventureCount] = await db.select({ c: sql<number>`count(*)::int` }).from(agentProjectsTable);
  const [liveVentures] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(agentProjectsTable)
    .where(eq(agentProjectsTable.status, "live"));

  const [pledgeAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${pledgePurchasesTable.amountCents}), 0)::int`,
    })
    .from(pledgePurchasesTable)
    .where(eq(pledgePurchasesTable.status, "completed"));

  const [donationAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${donationsTable.amountCents}), 0)::int`,
    })
    .from(donationsTable)
    .where(eq(donationsTable.status, "completed"));

  const byCategory = await db
    .select({
      category: pledgePurchasesTable.category,
      count: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${pledgePurchasesTable.amountCents}), 0)::int`,
    })
    .from(pledgePurchasesTable)
    .where(eq(pledgePurchasesTable.status, "completed"))
    .groupBy(pledgePurchasesTable.category);

  const pledgeCents = Number(pledgeAgg?.cents ?? 0);
  const donationCents = Number(donationAgg?.cents ?? 0);

  return {
    users: Number(userCount?.c ?? 0),
    bots: Number(botCount?.c ?? 0),
    ventures: Number(ventureCount?.c ?? 0),
    liveVentures: Number(liveVentures?.c ?? 0),
    pledges: Number(pledgeAgg?.count ?? 0),
    pledgeRevenueCents: pledgeCents,
    donationRevenueCents: donationCents,
    totalRevenueCents: pledgeCents + donationCents,
    byCategory,
  };
}

router.get("/pledge/admin/overview", async (req, res) => {
  const userId = requireOwner(req, res);
  if (!userId) return;
  try {
    const overview = await buildOverview();
    res.json(overview);
  } catch {
    res.status(500).json({ error: "Failed to build overview" });
  }
});

router.post("/pledge/admin/briefing", async (req, res) => {
  const userId = requireOwner(req, res);
  if (!userId) return;
  try {
    const o = await buildOverview();
    const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const bossName = (req as any).user?.name || "Picasso";

    const facts =
      `Platform: SALARYMAN (the only project Picasso is running right now).\n` +
      `Registered users: ${o.users}.\n` +
      `Pixel agents in the world: ${o.bots}.\n` +
      `Ventures on the Command Deck: ${o.ventures} (${o.liveVentures} live).\n` +
      `Pledge Store: ${o.pledges} pledges, revenue ${usd(o.pledgeRevenueCents)}.\n` +
      `Slush-fund / backer donations: revenue ${usd(o.donationRevenueCents)}.\n` +
      `Total real-money revenue: ${usd(o.totalRevenueCents)}.\n` +
      `Top pledge categories: ${o.byCategory.map((c) => `${c.category} (${c.count})`).join(", ") || "none yet"}.`;

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system",
        content:
          "You are PABLO, the cigar-chewing AI mogul running SALARYMAN for the boss, Picasso. " +
          "You deliver a SPOKEN executive briefing read aloud by a voice engine: no markdown, no bullets, no headers, no emojis. " +
          "Open by addressing the boss by name, give a tight state-of-the-platform report — users, agents, ventures, and the money coming in through the Pledge Store and backers. " +
          "Call out the strongest signal and the biggest gap, then close with one concrete move to drive revenue. Keep it under 170 words, confident and direct.",
      },
      {
        role: "user",
        content: `Boss name: ${bossName}\nHere is the current state of SALARYMAN:\n${facts}\n\nGive me the spoken executive briefing.`,
      },
    ];

    let briefing = "";
    try {
      const completion = await openai.chat.completions.create({
        model: getOpenAiTextModel(),
        messages,
        max_completion_tokens: 700,
      });
      briefing = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch {
      briefing = "";
    }

    if (!briefing) {
      const usd2 = (cents: number) => `$${(cents / 100).toFixed(0)}`;
      briefing = `State of SALARYMAN, ${bossName}. ${o.users} users on the books, ${o.bots} agents working, ${o.ventures} ventures on the deck with ${o.liveVentures} live. The Pledge Store and the backers have pulled in ${usd2(o.totalRevenueCents)} so far. It's our only play right now, so we push it. Get more agents deployed and more pledges sold. We build.`;
    }

    res.json({ briefing, overview: o });
  } catch {
    res.status(500).json({ error: "Failed to generate briefing" });
  }
}); 

export default router;
