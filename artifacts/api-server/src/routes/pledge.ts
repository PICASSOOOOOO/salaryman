import { Router, type IRouter, type Request } from "express";
import {
  db,
  pledgePurchasesTable,
  bankAccountsTable,
  donationsTable,
  agentProjectsTable,
  usersTable,
  botsTable,
  PLEDGE_CATEGORIES,
  type PledgeCategory,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import Stripe from "stripe";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getStripe } from "./stripe";
import { isOwnerEmail } from "../lib/plan";
import { isApprovedAlpha } from "./alpha";
import { spendEarnedFiat } from "../lib/pablo-tax";

const router: IRouter = Router();

// ─── Pledge catalog ───────────────────────────────────────────────────────
// Real-money items sold in the Pledge Store. Each grants an in-game advantage.
// Prices are USD dollars. `effect` is the in-game benefit, surfaced to the
// player and read by game systems from the entitlement ledger as they wire up.
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
  priceUsd: number;
  icon: string;
  spec?: BuildingSpec;
  // Surfaced in the reusable Pledge Store popup that replaces the scattered
  // promo-page redirects when a paid terminal feature is locked. Kept to a
  // tiny curated set (1–3 items) — each maps to a single Stripe price the
  // owner creates by hand (see PLEDGE_PRICE_ENV).
  popup?: boolean;
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
    priceUsd: 49, icon: "🏢",
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
    priceUsd: 79, icon: "🏭",
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
    priceUsd: 199, icon: "🏙️",
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
  { id: "bot_extra_seat", category: "bots", name: "Extra Agent Seat", blurb: "One more pixel agent on your roster.", effect: "Adds +1 deployable agent slot on the Command Deck.", priceUsd: 25, icon: "🤖" },
  { id: "bot_overclock", category: "bots", name: "Agent Overclock", blurb: "Push your agents harder.", effect: "Agents progress ventures faster (higher progress per build cycle).", priceUsd: 39, icon: "⚡" },
  { id: "bot_jean_claw_elite", category: "bots", name: "Jean Claw Elite Squad", blurb: "Jean Claw hand-picks a specialist strike team.", effect: "Unlocks a premium 5-bot squad tuned for building apps and businesses.", priceUsd: 89, icon: "🎩" },

  // WEAPONS — edge in the wasteland / PvP social layer.
  { id: "wpn_briefcase", category: "weapons", name: "Loaded Briefcase", blurb: "Looks corporate. Isn't.", effect: "Self-defense item — survive longer outside the city core.", priceUsd: 19, icon: "💼" },
  { id: "wpn_gasmask", category: "weapons", name: "Corporate Gasmask", blurb: "Breathe through the poison fog.", effect: "Move freely through poison-gas zones without taking damage.", priceUsd: 29, icon: "😷" },
  { id: "wpn_escort", category: "weapons", name: "Private Escort", blurb: "A pixel bodyguard that travels with you.", effect: "Armed escort lets you roam far from home safely.", priceUsd: 59, icon: "🛡️" },

  // FURNITURE — office buffs.
  { id: "furn_standing_desks", category: "furniture", name: "Standing Desk Set", blurb: "Ergonomic, expensive, productive.", effect: "Small permanent productivity buff to all agents in this office.", priceUsd: 15, icon: "🪑" },
  { id: "furn_boardroom", category: "furniture", name: "Glass Boardroom", blurb: "Close deals in style.", effect: "Boosts negotiation / deal outcomes in meetings.", priceUsd: 45, icon: "🛋️" },

  // TECHNOLOGY — platform power-ups.
  { id: "tech_server_rack", category: "technology", name: "Private Server Rack", blurb: "Your own metal.", effect: "Higher API / compute budget for your ventures and agents.", priceUsd: 69, icon: "🖥️" },
  { id: "tech_quantum", category: "technology", name: "Quantum Co-Processor", blurb: "Bleeding edge.", effect: "Unlocks the fastest agent build tier and priority briefings.", priceUsd: 149, icon: "🧬" },

  // OFFICE SUPPLIES — small consumable / cosmetic advantages.
  { id: "sup_espresso", category: "office_supplies", name: "Espresso Machine", blurb: "Fuel the grind.", effect: "Agents take fewer coffee breaks — steadier output.", priceUsd: 12, icon: "☕" },
  { id: "sup_letterhead", category: "office_supplies", name: "Embossed Letterhead", blurb: "First impressions.", effect: "Cosmetic prestige on documents and invoices your ventures send.", priceUsd: 9, icon: "📄" },

  // DECOR — flex.
  { id: "decor_neon", category: "decor", name: "Neon Sign Pack", blurb: "Light up your HQ.", effect: "Animated neon decor for your office interior.", priceUsd: 14, icon: "🌃" },
  { id: "decor_aquarium", category: "decor", name: "Shark Aquarium", blurb: "Subtle.", effect: "Centerpiece decor that raises office prestige.", priceUsd: 34, icon: "🦈" },

  // SKINS — player / UI cosmetics.
  { id: "skin_gold_suit", category: "skins", name: "Gold Pinstripe Suit", blurb: "Dress like you've made it.", effect: "Rare player skin worn across the world.", priceUsd: 24, icon: "🤵" },
  { id: "skin_nebula_ui", category: "skins", name: "Nebula UI Theme", blurb: "Pablo's signature look.", effect: "Applies the Pablo nebula theme across your whole interface.", priceUsd: 18, icon: "🌌" },

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
    priceUsd: 49, icon: "🎧", popup: true,
  },
  {
    id: "term_phone_pass", category: "terminals", name: "Phone System Pass",
    blurb: "Your own AI-run phone line.",
    effect: "Permanently unlocks the full Phone System — dialer, voicemail, call center, and AI secretary. One-time pledge, no subscription.",
    priceUsd: 99, icon: "📞", popup: true,
  },
  { id: "term_retro", category: "terminals", name: "Retro CRT Terminal", blurb: "Green phosphor glow.", effect: "Unlocks the CRT terminal skin for Pablo and the Command Deck.", priceUsd: 16, icon: "📟" },
  { id: "term_holo", category: "terminals", name: "Holo Terminal", blurb: "From the future.", effect: "Premium holographic terminal type with extra panels.", priceUsd: 54, icon: "🔮" },
];

function findItem(id: string): PledgeItem | undefined {
  return PLEDGE_CATALOG.find((i) => i.id === id);
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

// ─── Catalog ────────────────────────────────────────────────────────────────
router.get("/pledge/catalog", (_req, res) => {
  res.json({ categories: PLEDGE_CATEGORIES, items: PLEDGE_CATALOG });
});

// ─── Popup catalog ───────────────────────────────────────────────────────────
// The small curated set (1–3 items) shown in the Pledge Store popup that opens
// when a paid terminal feature is locked — instead of redirecting to a promo
// page. Same checkout + entitlement plumbing as the full store.
router.get("/pledge/popup", (_req, res) => {
  res.json({ items: PLEDGE_CATALOG.filter((i) => i.popup) });
});

// ─── Owned entitlements ──────────────────────────────────────────────────────
router.get("/pledge/owned", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
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
  const item = findItem(itemId);
  if (!item) {
    res.status(400).json({ error: "Unknown pledge item" });
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
    await db.insert(pledgePurchasesTable).values({
      userId,
      itemId: item.id,
      category: item.category,
      name: item.name,
      amountCents: 0,
      status: "completed",
      grantedBy: owner ? "owner" : "tester",
    });
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

  // Prefer the fixed Stripe Price the owner created by hand for this item
  // (PLEDGE_PRICE_ENV). Fall back to an inline price_data line built from
  // priceUsd so the store still works before the owner wires up a price.
  const priceEnv = PLEDGE_PRICE_ENV[item.id];
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
            unit_amount: item.priceUsd * 100,
          },
          quantity: 1,
        },
      ];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items,
    success_url: `${baseUrl}/pledge?purchase=success&item=${item.id}`,
    cancel_url: `${baseUrl}/pledge?purchase=cancel`,
    client_reference_id: userId,
    metadata: {
      userId,
      type: "pledge",
      itemId: item.id,
      category: item.category,
      brand: "Picassoo.AI",
      product_line: "SALARYMAN",
    },
    payment_intent_data: {
      description: `${item.name} by Picassoo.AI — SALARYMAN`,
    },
  });

  await db.insert(pledgePurchasesTable).values({
    userId,
    itemId: item.id,
    category: item.category,
    name: item.name,
    amountCents: item.priceUsd * 100,
    stripeSessionId: session.id,
    status: "pending",
    grantedBy: "stripe",
  });

  res.json({ url: session.url });
});

// ─── In-game vending: buy a pledge item with FIAT (priceUsd × 1000) ──────────
// SPEC A: the in-world vending machine sells Pledge Store items for in-game
// FIAT at ƒ(priceUsd × 1000). Charges EARNED fiat only and grants the
// entitlement immediately. Real-money Stripe checkout (above) stays available.
router.post("/pledge/vend", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const itemId = (req.body?.itemId ?? "") as string;
  const item = findItem(itemId);
  if (!item) {
    res.status(400).json({ error: "Unknown pledge item" });
    return;
  }
  // Already owned? Entitlements are one-time — never charge twice.
  const existing = await db
    .select({ id: pledgePurchasesTable.id })
    .from(pledgePurchasesTable)
    .where(and(
      eq(pledgePurchasesTable.userId, userId),
      eq(pledgePurchasesTable.itemId, item.id),
      eq(pledgePurchasesTable.status, "completed"),
    ))
    .limit(1);
  if (existing.length > 0) {
    res.json({ granted: true, alreadyOwned: true });
    return;
  }

  const priceFiat = item.priceUsd * 1000;
  const paid = await spendEarnedFiat({
    userId,
    amountFiat: priceFiat,
    description: `Vending: ${item.name}`,
  });
  if (!paid.ok) {
    res.status(402).json({ error: "insufficient_fiat", required: priceFiat, spendable: paid.spendable });
    return;
  }

  try {
    await db.insert(pledgePurchasesTable).values({
      userId,
      itemId: item.id,
      category: item.category,
      name: item.name,
      amountCents: 0,
      status: "completed",
      grantedBy: "fiat",
    });
  } catch (err: any) {
    // Payment cleared but the grant write failed — refund the FIAT so we never
    // charge without delivering the entitlement (the spend/grant pair isn't a
    // single DB transaction, so this is the compensating leg).
    const accts = await db.select().from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.currency, "FIAT")));
    const target = [...accts].sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
    if (target) {
      await db.update(bankAccountsTable)
        .set({ balance: target.balance + priceFiat, updatedAt: new Date() })
        .where(eq(bankAccountsTable.id, target.id));
    }
    console.error("[Pledge] vend grant failed, refunded ƒ:", err?.message);
    res.status(500).json({ error: "Vend failed — your florins were refunded." });
    return;
  }
  res.json({ granted: true, fiat: priceFiat, newBalance: paid.newBalance });
});

// ─── Webhook fulfillment (called from stripe.ts) ─────────────────────────────
// Only grant the item once funds are actually settled. For instant methods
// (cards) `checkout.session.completed` already carries payment_status="paid".
// For delayed methods the session completes "unpaid" and settles later via
// `checkout.session.async_payment_succeeded` (or fails via the _failed event).
export async function handlePledgeWebhookEvent(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.type !== "pledge" || !session.id) return;

  if (event.type === "checkout.session.async_payment_failed") {
    await db
      .update(pledgePurchasesTable)
      .set({ status: "failed" })
      .where(eq(pledgePurchasesTable.stripeSessionId, session.id));
    console.log(`[Pledge] Payment failed — session ${session.id}, item ${session.metadata?.itemId}`);
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
    await db
      .update(pledgePurchasesTable)
      .set({ status: "completed" })
      .where(eq(pledgePurchasesTable.stripeSessionId, session.id));
    console.log(`[Pledge] Purchase completed — session ${session.id}, item ${session.metadata?.itemId}`);
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
        model: "gpt-4o-mini",
        messages,
        temperature: 0.8,
        max_tokens: 340,
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
