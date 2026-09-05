import { Router, raw } from "express";
import Stripe from "stripe";
import { grantFeature, revokeFeatureBySubscription, FEATURE_CATALOG, resolveFeatureKey, hasFeature, isUsdPaidFeature } from "../lib/plan";
import { FEATURE_KEYS, type FeatureKey, db, donationsTable, fiatTopupsTable, phoneNumberPurchasesTable, phoneNumbersTable, usersTable, bankAccountsTable, bankTransactionsTable, orgMembersTable, organizationsTable, orgFeatureGrantsTable, botMarketplaceTable, botSubscriptionsTable, botsTable } from "@workspace/db";
import { eq, sum, desc, and, or, isNotNull, lt, sql, inArray } from "drizzle-orm";
import { handleMerchWebhookEvent } from "./merch";
import { handleSeasonPassWebhookEvent } from "./salaryman-season";
import { handlePledgeWebhookEvent } from "./pledge";
import { handleItemWebhookEvent } from "./items";
import { ensureFiatAccounts, spendFiat } from "../lib/fiat-wallet";
import { assertPhoneNumberAvailable, provisionPaidPhoneNumber } from "../lib/phone-number-service";
import { canUsePlatformTwilio } from "../lib/platform-twilio-access";
import { isSupportedCountry } from "../lib/phone";

const router = Router();

const FEATURE_PRICE_ENV: Record<FeatureKey, string> = {
  live_listen: "STRIPE_PRICE_LIVE_LISTEN",
  screen_scan: "STRIPE_PRICE_SCREEN_SCAN",
  say_this: "STRIPE_PRICE_SAY_THIS",
  phone_system: "STRIPE_PRICE_PHONE_SYSTEM",
  claw_bot: "STRIPE_PRICE_CLAW_BOT",
};

const BOT_PRICE_ENV: Record<string, string> = {
  "closer-x":  "STRIPE_PRICE_BOT_CLOSER_X",
  "resolve-7": "STRIPE_PRICE_BOT_RESOLVE_7",
  "ink-9":     "STRIPE_PRICE_BOT_INK_9",
  "recruit-8": "STRIPE_PRICE_BOT_RECRUIT_8",
};

function getPriceIdForBot(slug: string): string | undefined {
  const envKey = BOT_PRICE_ENV[slug];
  if (!envKey) return undefined;
  return process.env[envKey];
}

// ── Real-money FIAT top-up packs ──────────────────────────────────────────────
// USD → in-game server-bank ƒ at 1000ƒ = $1. Amounts are AUTHORITATIVE here; the
// client only sends a packId so a tampered amount can never mint extra ƒ. Stripe
// enforces a ~$0.50 minimum charge, so the smallest sellable pack is 500ƒ ($0.50)
// rather than the spec's 50ƒ ($0.05). Proceeds land in the connected Stripe
// account (owner / Picasso) like every other charge.
const FIAT_TOPUP_PACKS = [
  { id: "topup_500",   fiat: 500,   usdCents: 50 },
  { id: "topup_5000",  fiat: 5000,  usdCents: 500 },
  { id: "topup_10000", fiat: 10000, usdCents: 1000 },
] as const;
const FIAT_PER_USD = 1000;
const CASHOUT_FEE_BPS = 500;
const CASHOUT_MIN_FIAT = 5000;
const CASHOUT_ELIGIBLE_KINDS = ["fiat_topup", "wage", "world_job", "world_sale", "rec_reward", "income", "payroll"] as const;

const PHONE_NUMBER_PRICE_CENTS = 1000;

async function getPhoneNumberPriceId(stripe: Stripe): Promise<string> {
  const products = await stripe.products.search({ query: "metadata['salaryman_type']:'phone_number'" });
  let product = products.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: "SALARYMAN custom phone number",
      description: "One-time purchase of one custom Twilio phone number. Phone System subscription required.",
      metadata: { salaryman_type: "phone_number" },
    });
  }
  const prices = await stripe.prices.list({ product: product.id, active: true, type: "one_time", limit: 100 });
  const existing = prices.data.find((price) => price.currency === "usd" && price.unit_amount === PHONE_NUMBER_PRICE_CENTS);
  if (existing) return existing.id;
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: PHONE_NUMBER_PRICE_CENTS,
  });
  return price.id;
}

async function activateBotSubscription(userId: string, marketplaceItemId: number, stripeSubscriptionId: string): Promise<void> {
  const [item] = await db
    .select()
    .from(botMarketplaceTable)
    .where(eq(botMarketplaceTable.id, marketplaceItemId));
  if (!item) return;

  const existing = await db
    .select()
    .from(botSubscriptionsTable)
    .where(
      and(
        eq(botSubscriptionsTable.userId, userId),
        eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId)
      )
    );

  if (existing.length > 0 && existing[0].botId) {
    await db
      .update(botSubscriptionsTable)
      .set({ status: "active", stripeSubscriptionId })
      .where(
        and(
          eq(botSubscriptionsTable.userId, userId),
          eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId)
        )
      );
    await db
      .update(botsTable)
      .set({ status: "active" })
      .where(eq(botsTable.id, existing[0].botId));
    return;
  }

  const [bot] = await db
    .insert(botsTable)
    .values({
      ownerId: userId,
      name: item.name,
      personality: item.personality,
      systemPrompt: item.systemPrompt,
      permissions: item.permissions,
      marketplaceItemId: item.id,
    })
    .returning();

  if (existing.length > 0) {
    await db
      .update(botSubscriptionsTable)
      .set({ botId: bot.id, status: "active", stripeSubscriptionId })
      .where(
        and(
          eq(botSubscriptionsTable.userId, userId),
          eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId)
        )
      );
  } else {
    await db.insert(botSubscriptionsTable).values({
      userId,
      marketplaceItemId: item.id,
      botId: bot.id,
      status: "active",
      stripeSubscriptionId,
    });
  }
}

async function deactivateBotSubscription(stripeSubscriptionId: string): Promise<string | null> {
  const [sub] = await db
    .select()
    .from(botSubscriptionsTable)
    .where(eq(botSubscriptionsTable.stripeSubscriptionId, stripeSubscriptionId));
  if (!sub) return null;

  await db
    .update(botSubscriptionsTable)
    .set({ status: "canceled" })
    .where(eq(botSubscriptionsTable.stripeSubscriptionId, stripeSubscriptionId));

  if (sub.botId) {
    await db
      .update(botsTable)
      .set({ status: "paused" })
      .where(eq(botsTable.id, sub.botId));
  }

  return sub.userId;
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key);
}

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:3000";
}

// PABLO PRIME — single $149/mo bundle that grants every paid feature via
// BUNDLED_BY_PABLO in lib/plan.ts. getPriceIdForFeature() lists active prices
// on the product found via metadata search and uses the first one (the $149
// monthly price), so no hardcoded product IDs are needed here.
const FEATURE_PRODUCT_IDS: Partial<Record<FeatureKey, string>> = {};

const priceIdCache: Partial<Record<FeatureKey, string>> = {};
const productIdCache: Partial<Record<FeatureKey, string>> = {};

async function ensureProductForFeature(feature: FeatureKey): Promise<string | undefined> {
  if (FEATURE_PRODUCT_IDS[feature]) return FEATURE_PRODUCT_IDS[feature];
  if (productIdCache[feature]) return productIdCache[feature];

  try {
    const stripe = getStripe();
    const catalog = FEATURE_CATALOG[feature];

    const existing = await stripe.products.search({ query: `metadata['feature']:'${feature}'`, limit: 1 });
    if (existing.data.length > 0) {
      productIdCache[feature] = existing.data[0].id;
      console.log(`[Stripe] Found existing product for ${feature}: ${existing.data[0].id}`);
      return existing.data[0].id;
    }

    const product = await stripe.products.create({
      name: `${catalog.name} — THE SALARYMAN PLATFORM`,
      description: catalog.desc,
      tax_code: "txcd_10000000",
      metadata: { feature, brand: "Picasso.AI", product_line: "SALARYMAN" },
    });
    productIdCache[feature] = product.id;
    FEATURE_PRODUCT_IDS[feature] = product.id;
    console.log(`[Stripe] Created product for ${feature}: ${product.id}`);
    return product.id;
  } catch (err) {
    console.error(`[Stripe] Failed to ensure product for ${feature}:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

async function getPriceIdForFeature(feature: FeatureKey): Promise<string | undefined> {
  const envPrice = process.env[FEATURE_PRICE_ENV[feature]];
  const catalog = FEATURE_CATALOG[feature];
  const expectedUnitAmount = catalog.price * 100;
  const priceMatches = (price: Stripe.Price) =>
    price.active &&
    price.currency.toLowerCase() === "usd" &&
    price.unit_amount === expectedUnitAmount &&
    price.type === "recurring" &&
    price.recurring?.interval === "month";

  if (envPrice) {
    try {
      const configured = await getStripe().prices.retrieve(envPrice);
      if (priceMatches(configured)) return configured.id;
      console.error(`[Stripe] Ignoring invalid configured price for ${feature}; expected USD ${catalog.price}/month`);
    } catch (error) {
      console.error(`[Stripe] Could not validate configured price for ${feature}:`, error instanceof Error ? error.message : error);
    }
  }

  if (priceIdCache[feature]) return priceIdCache[feature];

  const productId = await ensureProductForFeature(feature);
  if (!productId) return undefined;

  try {
    const stripe = getStripe();
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    const matchingPrice = prices.data.find(priceMatches);
    if (matchingPrice) {
      priceIdCache[feature] = matchingPrice.id;
      console.log(`[Stripe] Resolved verified USD price for ${feature}: ${matchingPrice.id}`);
      return matchingPrice.id;
    }

    const newPrice = await stripe.prices.create({
      product: productId,
      unit_amount: catalog.price * 100,
      currency: "usd",
      recurring: { interval: "month" },
    });
    priceIdCache[feature] = newPrice.id;
    console.log(`[Stripe] Created price for ${feature}: ${newPrice.id}`);
    return newPrice.id;
  } catch (err) {
    console.error(`[Stripe] Failed to resolve price for ${feature}:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

// PABLO'S SLUSH FUND — investor program. Each tier is a one-time contribution
// that grants in-game perks (passes, property, vehicles, weapons, custom
// layouts) and, at higher tiers, real-world merch and physical terminals.
// Perk fulfillment for physical goods is best-effort and tracked off-ledger.
const DONATION_TIERS = [
  { id: "slush_5",     label: "STREET INFORMANT",   amountCents: 500,     badge: "Street Informant" },
  { id: "slush_25",    label: "SHADOW INVESTOR",    amountCents: 2500,    badge: "Shadow Investor" },
  { id: "slush_100",   label: "CORPORATE BENEFACTOR", amountCents: 10000, badge: "Corporate Benefactor" },
  { id: "slush_500",   label: "MEGACORP PATRON",    amountCents: 50000,   badge: "Megacorp Patron" },
  { id: "slush_2500",  label: "CARTEL FOUNDER",     amountCents: 250000,  badge: "Cartel Founder" },
  { id: "slush_10000", label: "PABLO INNER CIRCLE", amountCents: 1000000, badge: "Pablo Inner Circle" },
];

function getDonorTitle(totalCents: number): string {
  if (totalCents >= 1000000) return "Pablo Inner Circle";
  if (totalCents >=  250000) return "Cartel Founder";
  if (totalCents >=   50000) return "Megacorp Patron";
  if (totalCents >=   10000) return "Corporate Benefactor";
  if (totalCents >=    2500) return "Shadow Investor";
  if (totalCents >=     500) return "Street Informant";
  return "";
}

router.post("/stripe/create-checkout-session", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const rawFeature = req.body?.feature as string | undefined;
  const feature = rawFeature ? resolveFeatureKey(rawFeature) : undefined;
  if (!feature || !isUsdPaidFeature(feature)) {
    res.status(400).json({ error: "Only paid Phone System and Automation Pixel Agent subscriptions are sold here", validFeatures: ["phone_system", "claw_bot"] });
    return;
  }

  const priceId = await getPriceIdForFeature(feature);
  if (!priceId) {
    res.status(500).json({ error: `Pricing for ${FEATURE_CATALOG[feature].name} not configured yet` });
    return;
  }

  const user = req.user;
  if (await hasFeature(user.id, user.email, feature)) {
    res.status(409).json({
      error: "already_active",
      message: `${FEATURE_CATALOG[feature].name} is already active on this account.`,
    });
    return;
  }
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();

  const featureName = FEATURE_CATALOG[feature].name;

  // Check if user is in an org with company billing enabled
  const billingMode = req.body?.billingMode as "company" | "individual" | undefined;
  let orgStripeCustomerId: string | null = null;
  let orgId: number | null = null;
  let grantedByValue = "stripe";

  if (billingMode === "company") {
    const memberRows = await db
      .select({ orgId: orgMembersTable.orgId, featureBilling: orgMembersTable.featureBilling })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, user.id), eq(orgMembersTable.status, "active")));

    if (memberRows.length > 0 && memberRows[0].featureBilling === "company") {
      const orgRows = await db
        .select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, memberRows[0].orgId));
      if (orgRows.length > 0 && orgRows[0].stripeCustomerId) {
        orgStripeCustomerId = orgRows[0].stripeCustomerId;
        orgId = orgRows[0].id;
        grantedByValue = `org:${orgId}`;
      }
    }
  }

  const checkoutReturnPath = feature === "claw_bot" ? "/pledge?view=prime" : "/pricing";
  const checkoutReturnSeparator = checkoutReturnPath.includes("?") ? "&" : "?";
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}${checkoutReturnPath}${checkoutReturnSeparator}checkout=success&feature=${feature}`,
    cancel_url: `${baseUrl}${checkoutReturnPath}${checkoutReturnSeparator}checkout=cancel`,
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
      feature,
      brand: "Picassoo.AI",
      product_line: "SALARYMAN",
      grantedBy: grantedByValue,
      ...(orgId ? { orgId: String(orgId) } : {}),
    },
    // NOTE: The bank statement descriptor "PICASSO AI LLC" must be configured at the
    // account level in the Stripe Dashboard (Settings → Account details → Statement descriptor).
    // Stripe does not allow overriding the static statement descriptor per-charge for card
    // subscriptions via API — only suffix customization is supported for card flows.
    payment_intent_data: {
      description: `${featureName} by Picassoo.AI — SALARYMAN`,
    },
    subscription_data: {
      description: `${featureName} by Picassoo.AI — SALARYMAN`,
      metadata: {
        brand: "Picassoo.AI",
        product_line: "SALARYMAN",
        feature,
        ...(orgId ? { orgId: String(orgId) } : {}),
      },
    },
  };

  if (orgStripeCustomerId) {
    sessionParams.customer = orgStripeCustomerId;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  res.json({ url: session.url });
});

router.post("/stripe/create-bot-checkout-session", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { marketplaceItemId } = req.body as { marketplaceItemId?: number };
  if (!marketplaceItemId || typeof marketplaceItemId !== "number") {
    res.status(400).json({ error: "marketplaceItemId required" });
    return;
  }

  const [item] = await db
    .select()
    .from(botMarketplaceTable)
    .where(eq(botMarketplaceTable.id, marketplaceItemId));

  if (!item) {
    res.status(404).json({ error: "Marketplace item not found" });
    return;
  }

  if (item.priceMonthly === 0) {
    res.status(400).json({ error: "This bot is free — use the activate endpoint directly" });
    return;
  }

  const user = req.user;

  const existingSub = await db
    .select()
    .from(botSubscriptionsTable)
    .where(
      and(
        eq(botSubscriptionsTable.userId, user.id),
        eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId)
      )
    );

  if (existingSub.length > 0 && existingSub[0].status === "active") {
    res.status(409).json({ error: "Already subscribed to this bot", alreadyActive: true });
    return;
  }

  const priceId = getPriceIdForBot(item.slug);
  if (!priceId) {
    res.status(503).json({
      error: `Checkout for this bot is not currently available. Please try again later or contact support.`,
    });
    return;
  }
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/bot-factory?checkout=success&botSlug=${item.slug}`,
    cancel_url: `${baseUrl}/bot-factory?checkout=cancel`,
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
      type: "bot_subscription",
      marketplaceItemId: String(marketplaceItemId),
      botSlug: item.slug,
      brand: "Picassoo.AI",
      product_line: "SALARYMAN",
    },
    subscription_data: {
      description: `${item.name} by Picassoo.AI — SALARYMAN Bot Factory`,
      metadata: {
        brand: "Picassoo.AI",
        product_line: "SALARYMAN",
        marketplaceItemId: String(marketplaceItemId),
        botSlug: item.slug,
      },
    },
  });

  res.json({ url: session.url });
});

router.post("/stripe/create-donation-session", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { amountCents, tierId } = req.body as { amountCents?: number; tierId?: string };

  let finalAmountCents: number;
  let tierLabel: string | undefined;

  if (tierId) {
    const tier = DONATION_TIERS.find(t => t.id === tierId);
    if (!tier) {
      res.status(400).json({ error: "Invalid tier" });
      return;
    }
    finalAmountCents = tier.amountCents;
    tierLabel = tier.badge;
  } else if (amountCents && typeof amountCents === "number" && amountCents >= 100) {
    // Cap at $10,000 to match the top investor tier (PABLO INNER CIRCLE).
    finalAmountCents = Math.min(Math.round(amountCents), 1000000);
    tierLabel = undefined;
  } else {
    res.status(400).json({ error: "Invalid amount — minimum $1.00" });
    return;
  }

  const user = req.user;
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Pablo's Slush Fund",
            description: tierLabel ?? "Custom donation — thanks for backing the mission.",
          },
          unit_amount: finalAmountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/world?donation=success`,
    cancel_url: `${baseUrl}/world?donation=cancel`,
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
      type: "donation",
      amountCents: String(finalAmountCents),
      tier: tierLabel ?? "",
    },
  });

  await db.insert(donationsTable).values({
    userId: user.id,
    stripeSessionId: session.id,
    amountCents: finalAmountCents,
    tier: tierLabel ?? null,
    status: "pending",
  });

  res.json({ url: session.url });
});

router.get("/stripe/donation-history", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = req.user.id;
  const history = await db
    .select()
    .from(donationsTable)
    .where(eq(donationsTable.userId, userId))
    .orderBy(desc(donationsTable.createdAt))
    .limit(50);

  const totalResult = await db
    .select({ total: sum(donationsTable.amountCents) })
    .from(donationsTable)
    .where(eq(donationsTable.userId, userId));

  const totalCents = Number(totalResult[0]?.total ?? 0);
  const donorTitle = getDonorTitle(totalCents);

  res.json({ history, totalCents, donorTitle });
});

// Direct USD→FIAT sale is retired. USD checkout for gameplay merchandise stays
// in the Pledge Store; keep old top-up settlement/history code below only so an
// already-paid Stripe session can still reconcile safely.
router.get("/stripe/fiat-topup-packs", (_req, res) => {
  res.json({ packs: FIAT_TOPUP_PACKS, fiatPerUsd: 1000 });
});

router.post("/stripe/create-phone-number-session", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const user = req.user;
  if (!(await hasFeature(user.id, user.email, "phone_system"))) {
    res.status(403).json({ error: "Phone System subscription required", feature: "phone_system" });
    return;
  }
  if (!(await canUsePlatformTwilio(user.id, user.email))) {
    res.status(403).json({ error: "Platform phone system is restricted to authorized organizations.", code: "TWILIO_ORG_RESTRICTED" });
    return;
  }
  const { phoneNumber, countryCode, label, requestId } = req.body as Record<string, string | undefined>;
  if (
    !phoneNumber || !/^\+[1-9]\d{6,14}$/.test(phoneNumber)
    || !countryCode || !isSupportedCountry(countryCode)
    || !requestId || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)
  ) {
    res.status(400).json({ error: "Invalid number purchase request" });
    return;
  }
  if (countryCode === "VN" && !process.env.TWILIO_REGULATORY_BUNDLE_SID) {
    res.status(409).json({ error: "A verified Twilio regulatory bundle is required before buying a Vietnam number." });
    return;
  }
  try {
    await assertPhoneNumberAvailable(phoneNumber, countryCode);
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Number is unavailable" });
    return;
  }

  const stripe = getStripe();
  const reservationId = `reservation:${user.id}:${requestId}`;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${phoneNumber}::text))`);
      const [pending] = await tx.select({ id: phoneNumberPurchasesTable.id })
        .from(phoneNumberPurchasesTable)
        .where(and(
          eq(phoneNumberPurchasesTable.phoneNumber, phoneNumber),
          sql`${phoneNumberPurchasesTable.status} in ('pending', 'processing')`,
        )).limit(1);
      if (pending) throw new Error("PHONE_NUMBER_ALREADY_RESERVED");
      await tx.insert(phoneNumberPurchasesTable).values({
        userId: user.id,
        stripeSessionId: reservationId,
        phoneNumber,
        countryCode,
        label: (label || "main").slice(0, 64),
        amountCents: PHONE_NUMBER_PRICE_CENTS,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_NUMBER_ALREADY_RESERVED") {
      res.status(409).json({ error: "That number is already reserved by another checkout." });
      return;
    }
    throw error;
  }
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: await getPhoneNumberPriceId(stripe), quantity: 1 }],
      success_url: `${getAppBaseUrl()}/phone?tab=numbers&number_checkout=success`,
      cancel_url: `${getAppBaseUrl()}/phone?tab=numbers&number_checkout=cancel`,
      client_reference_id: user.id,
      metadata: {
        type: "phone_number", userId: user.id, phoneNumber, countryCode,
        label: (label || "main").slice(0, 64),
        amountCents: String(PHONE_NUMBER_PRICE_CENTS), requestId,
      },
    }, { idempotencyKey: `phone-number:${user.id}:${requestId}` });
    await db.update(phoneNumberPurchasesTable).set({ stripeSessionId: session.id })
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, reservationId));
  } catch (error) {
    await db.delete(phoneNumberPurchasesTable).where(eq(phoneNumberPurchasesTable.stripeSessionId, reservationId));
    throw error;
  }
  res.json({ url: session.url });
});

async function fulfilPhoneNumberPurchase(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const userId = session.client_reference_id || session.metadata?.userId;
  const phoneNumber = session.metadata?.phoneNumber;
  const countryCode = session.metadata?.countryCode;
  const label = (session.metadata?.label || "main").slice(0, 64);
  if (
    !userId || !phoneNumber || !countryCode
    || session.amount_total !== PHONE_NUMBER_PRICE_CENTS
    || session.currency !== "usd"
  ) throw new Error(`PHONE_NUMBER_RECONCILIATION_REJECTED:${session.id}`);

  await db.insert(phoneNumberPurchasesTable).values({
    userId, stripeSessionId: session.id, phoneNumber, countryCode, label,
    amountCents: PHONE_NUMBER_PRICE_CENTS,
  }).onConflictDoNothing();

  const [buyer] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const currentlyAuthorized = buyer
    && await hasFeature(userId, buyer.email, "phone_system")
    && await canUsePlatformTwilio(userId, buyer.email);
  if (!currentlyAuthorized) {
    await db.update(phoneNumberPurchasesTable)
      .set({ status: "authorization_failed", failureReason: "Phone System access is no longer authorized" })
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, session.id));
    return;
  }

  const [existingNumber] = await db
    .select({ id: phoneNumbersTable.id, userId: phoneNumbersTable.userId, twilioSid: phoneNumbersTable.twilioSid })
    .from(phoneNumbersTable)
    .where(eq(phoneNumbersTable.number, phoneNumber))
    .limit(1);
  if (existingNumber?.userId === userId) {
    await db.update(phoneNumberPurchasesTable)
      .set({ status: "completed", twilioSid: existingNumber.twilioSid, completedAt: new Date(), failureReason: null })
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, session.id));
    return;
  }

  const leaseCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const [claimed] = await db.update(phoneNumberPurchasesTable)
    .set({ status: "processing", failureReason: null, createdAt: new Date() })
    .where(and(
      eq(phoneNumberPurchasesTable.stripeSessionId, session.id),
      or(
        eq(phoneNumberPurchasesTable.status, "pending"),
        and(
          eq(phoneNumberPurchasesTable.status, "processing"),
          or(
            isNotNull(phoneNumberPurchasesTable.twilioSid),
            lt(phoneNumberPurchasesTable.createdAt, leaseCutoff),
          ),
        ),
      ),
    ))
    .returning();
  if (!claimed) {
    const [current] = await db.select({ status: phoneNumberPurchasesTable.status })
      .from(phoneNumberPurchasesTable)
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, session.id))
      .limit(1);
    if (current?.status === "completed" || current?.status === "authorization_failed") return;
    throw new Error(`PHONE_NUMBER_FULFILLMENT_BUSY:${session.id}`);
  }

  try {
    const provisioned = await provisionPaidPhoneNumber({
      userId, phoneNumber, countryCode, label, stripeSessionId: session.id,
    });
    await db.update(phoneNumberPurchasesTable)
      .set({ status: "completed", twilioSid: provisioned.sid, completedAt: new Date(), failureReason: null })
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, session.id));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Provisioning failed";
    await db.update(phoneNumberPurchasesTable)
      .set({ status: "pending", failureReason: reason.slice(0, 256) })
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, session.id));
    throw error;
  }
}

async function markPhoneNumberPurchaseTerminal(session: Stripe.Checkout.Session, status: "failed" | "cancelled"): Promise<void> {
  await db.update(phoneNumberPurchasesTable)
    .set({ status, failureReason: status === "failed" ? "Stripe payment failed" : "Stripe checkout expired" })
    .where(eq(phoneNumberPurchasesTable.stripeSessionId, session.id));
}

// Start a Stripe checkout for a fixed FIAT pack. The client sends only a packId;
// the ƒ amount and price are resolved server-side so the charge can never be
// manipulated. A pending row is pre-inserted and fulfilled exactly once by the
// webhook on confirmed payment.
router.post("/stripe/create-topup-session", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const { packId, source, requestId } = req.body as { packId?: string; source?: string; requestId?: string };
  const pack = FIAT_TOPUP_PACKS.find((p) => p.id === packId);
  if (source !== "atm" || !pack || !requestId || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
    res.status(400).json({ error: "ATM Stripe purchase requires a valid pack and request" });
    return;
  }
  const user = req.user;
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `BANCO OMBRA — ƒ${pack.fiat.toLocaleString()} FIAT`,
          description: `ATM card purchase: ƒ${pack.fiat.toLocaleString()} credited after Stripe settlement.`,
        },
        unit_amount: pack.usdCents,
      },
      quantity: 1,
    }],
    success_url: `${baseUrl}/game/bank?topup=return&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/game/bank?topup=cancel`,
    client_reference_id: user.id,
    metadata: {
      userId: user.id, type: "fiat_topup", source: "atm", packId: pack.id,
      fiatAmount: String(pack.fiat), amountCents: String(pack.usdCents), requestId,
    },
  }, { idempotencyKey: `fiat-topup:${user.id}:${requestId}` });
  await db.insert(fiatTopupsTable).values({
    userId: user.id, stripeSessionId: session.id, packId: pack.id,
    amountCents: pack.usdCents, fiatAmount: pack.fiat, status: "pending",
  }).onConflictDoNothing();
  res.json({ url: session.url });
});

router.get("/stripe/topup-history", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const history = await db
    .select()
    .from(fiatTopupsTable)
    .where(eq(fiatTopupsTable.userId, req.user.id))
    .orderBy(desc(fiatTopupsTable.createdAt))
    .limit(50);
  res.json({ history });
});

router.get("/stripe/connect/status", async (req, res) => {
  if (!req.isAuthenticated?.()) return void res.status(401).json({ error: "Login required" });
  const [user] = await db.select({
    accountId: usersTable.stripeConnectAccountId,
  }).from(usersTable).where(eq(usersTable.id, req.user.id)).limit(1);
  if (!user?.accountId) return void res.json({ connected: false, payoutsEnabled: false });
  const account = await getStripe().accounts.retrieve(user.accountId);
  const payoutsEnabled = account.payouts_enabled === true && account.details_submitted === true;
  await db.update(usersTable).set({ stripeConnectPayoutsEnabled: payoutsEnabled }).where(eq(usersTable.id, req.user.id));
  res.json({
    connected: true,
    payoutsEnabled,
    detailsSubmitted: account.details_submitted === true,
    country: account.country ?? null,
    currency: account.default_currency?.toUpperCase() ?? "USD",
  });
});

router.post("/stripe/connect/onboard", async (req, res) => {
  if (!req.isAuthenticated?.()) return void res.status(401).json({ error: "Login required" });
  const stripe = getStripe();
  const [user] = await db.select({
    email: usersTable.email,
    accountId: usersTable.stripeConnectAccountId,
  }).from(usersTable).where(eq(usersTable.id, req.user.id)).limit(1);
  let accountId = user?.accountId ?? null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user?.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      metadata: { salarymanUserId: req.user.id },
    }, { idempotencyKey: `connect-account:${req.user.id}` });
    accountId = account.id;
    await db.update(usersTable).set({ stripeConnectAccountId: accountId }).where(eq(usersTable.id, req.user.id));
  }
  const baseUrl = getAppBaseUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${baseUrl}/game?stripe_connect=refresh`,
    return_url: `${baseUrl}/game?stripe_connect=return`,
  });
  res.json({ url: link.url });
});

router.post("/stripe/connect/cashout", async (req, res) => {
  if (!req.isAuthenticated?.()) return void res.status(401).json({ error: "Login required" });
  const amountFiat = Math.round(Number(req.body?.amountFiat));
  const requestId = String(req.body?.requestId ?? "");
  if (!Number.isInteger(amountFiat) || amountFiat < CASHOUT_MIN_FIAT || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
    return void res.status(400).json({ error: `Minimum cash-out is ƒ${CASHOUT_MIN_FIAT.toLocaleString()}` });
  }
  const [user] = await db.select({
    accountId: usersTable.stripeConnectAccountId,
  }).from(usersTable).where(eq(usersTable.id, req.user.id)).limit(1);
  const accountId = user?.accountId;
  if (!accountId) return void res.status(409).json({ error: "Connect your Stripe account first", code: "STRIPE_CONNECT_REQUIRED" });
  const stripe = getStripe();
  const connected = await stripe.accounts.retrieve(accountId);
  if (!connected.payouts_enabled || !connected.details_submitted) {
    return void res.status(409).json({ error: "Finish Stripe onboarding before cashing out", code: "STRIPE_PAYOUTS_DISABLED" });
  }
  const grossUsdCents = Math.floor((amountFiat * 100) / FIAT_PER_USD);
  const feeCents = Math.max(1, Math.ceil(grossUsdCents * CASHOUT_FEE_BPS / 10_000));
  const netUsdCents = grossUsdCents - feeCents;
  if (netUsdCents <= 0) return void res.status(400).json({ error: "Cash-out is below the Stripe transfer minimum" });

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}), 42002)`);
    const prior = await tx.select({ id: bankTransactionsTable.id }).from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.userId, req.user.id), sql`${bankTransactionsTable.description} LIKE ${`%[request:${requestId}]`}`)).limit(1);
    if (prior.length > 0) return { type: "ok" as const, duplicate: true };
    const rows = await tx.select({ kind: bankTransactionsTable.kind, amount: bankTransactionsTable.amount })
      .from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.userId, req.user.id), inArray(bankTransactionsTable.kind, [...CASHOUT_ELIGIBLE_KINDS, "fiat_cashout"])));
    const eligibleEarned = rows.reduce((total, row) => row.amount > 0 ? total + row.amount : total, 0);
    const alreadyCashedOut = rows.reduce((total, row) => row.kind === "fiat_cashout" && row.amount < 0 ? total + Math.abs(row.amount) : total, 0);
    const available = Math.max(0, eligibleEarned - alreadyCashedOut);
    if (available < amountFiat) return { type: "ineligible" as const, available };
    const debit = await spendFiat(tx, {
      userId: req.user.id,
      amountFiat,
      kind: "fiat_cashout",
      description: `STRIPE CONNECT CASH-OUT $${(netUsdCents / 100).toFixed(2)} USD`,
      idempotencyKey: requestId,
    });
    if (!debit.ok) return { type: "insufficient" as const, available: debit.spendable };
    const transfer = await stripe.transfers.create({
      amount: netUsdCents,
      currency: "usd",
      destination: accountId,
      description: `SALARYMAN ATM cash-out for ${req.user.id}`,
      metadata: { salarymanUserId: req.user.id, requestId, amountFiat: String(amountFiat), feeCents: String(feeCents) },
    }, { idempotencyKey: `fiat-cashout:${req.user.id}:${requestId}` });
    return { type: "ok" as const, transferId: transfer.id, balance: debit.newBalance };
  });
  if (result.type === "ineligible") return void res.status(409).json({ error: "Not enough cash-out-eligible FIAT", eligibleFiat: result.available });
  if (result.type === "insufficient") return void res.status(409).json({ error: "Insufficient FIAT balance", spendableFiat: result.available });
  res.json({ ok: true, duplicate: result.duplicate ?? false, amountFiat, grossUsdCents, feeCents, netUsdCents, balance: "balance" in result ? result.balance : undefined });
});

// Fulfil a confirmed FIAT top-up exactly once. Idempotent: the conditional
// UPDATE (pending → completed) only fires when the row is still pending, so a
// duplicate webhook delivery can't double-credit. Credits the player's checking
// account atomically (balance = balance + ƒ).
async function fulfilFiatTopup(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") {
    console.log(`[Stripe] fiat_topup ${session.id} is not settled (${session.payment_status ?? "unknown"}) — leaving pending`);
    return;
  }
  const userId = session.client_reference_id || session.metadata?.userId;
  if (!userId || !session.id) {
    console.warn("[Stripe] fiat_topup completed but missing userId/session");
    return;
  }
  const [known] = await db
    .select({ id: fiatTopupsTable.id })
    .from(fiatTopupsTable)
    .where(eq(fiatTopupsTable.stripeSessionId, session.id))
    .limit(1);
  if (!known) {
    const pack = FIAT_TOPUP_PACKS.find((candidate) => candidate.id === session.metadata?.packId);
    if (!pack || session.amount_total !== pack.usdCents || session.currency !== "usd") {
      throw new Error(`FIAT_TOPUP_RECONCILIATION_REJECTED:${session.id}`);
    }
    await db.insert(fiatTopupsTable).values({
      userId,
      stripeSessionId: session.id,
      packId: pack.id,
      amountCents: pack.usdCents,
      fiatAmount: pack.fiat,
      status: "pending",
    }).onConflictDoNothing();
  }

  // Claim + credit must be ONE atomic transaction: if the bank credit throws,
  // the pending→completed flip rolls back too, so a Stripe webhook retry can
  // re-claim and credit. (Marking completed outside the tx would strand paid
  // users with no FIAT on any transient credit failure.) The conditional
  // UPDATE inside the tx is also what makes duplicate webhooks idempotent: the
  // second concurrent webhook blocks on the row lock, then sees status !=
  // 'pending' and claims nothing.
  const credited = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(fiatTopupsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(fiatTopupsTable.stripeSessionId, session.id), eq(fiatTopupsTable.status, "pending")))
      .returning();

    if (!claimed) {
      const [existing] = await tx
        .select({ status: fiatTopupsTable.status })
        .from(fiatTopupsTable)
        .where(eq(fiatTopupsTable.stripeSessionId, session.id))
        .limit(1);
      if (!existing) {
        throw new Error(`FIAT_TOPUP_RESERVATION_MISSING:${session.id}`);
      }
      return null;
    }

    const fiat = claimed.fiatAmount;
    const accounts = await ensureFiatAccounts(tx, userId);
    const checking = accounts.find((account) => account.kind === "checking") ?? accounts[0];
    if (!checking) throw new Error(`FIAT_ACCOUNT_INITIALIZATION_FAILED:${userId}`);
    const [updated] = await tx
      .update(bankAccountsTable)
      .set({ balance: sql`${bankAccountsTable.balance} + ${fiat}`, updatedAt: new Date() })
      .where(eq(bankAccountsTable.id, checking.id))
      .returning({ balance: bankAccountsTable.balance });
    const balAfter = updated?.balance ?? checking.balance + fiat;
    await tx.insert(bankTransactionsTable).values({
      userId,
      accountId: checking.id,
      kind: "fiat_topup",
      description: `REAL-MONEY TOP-UP: +ƒ${fiat.toLocaleString()} ($${(claimed.amountCents / 100).toFixed(2)} USD)`,
      amount: fiat,
      balanceAfter: balAfter,
    });
    return fiat;
  });

  if (credited == null) {
    console.log(`[Stripe] fiat_topup ${session.id} already fulfilled or unknown — skipping credit`);
    return;
  }
  console.log(`[Stripe] fiat_topup fulfilled: user ${userId} +ƒ${credited} — session ${session.id}`);
}

async function markFiatTopupTerminal(session: Stripe.Checkout.Session, status: "failed" | "cancelled"): Promise<void> {
  if (!session.id || session.metadata?.type !== "fiat_topup") return;
  await db
    .update(fiatTopupsTable)
    .set({ status })
    .where(and(eq(fiatTopupsTable.stripeSessionId, session.id), eq(fiatTopupsTable.status, "pending")));
}

router.post(
  "/stripe/webhook",
  raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      res.status(400).json({ error: "Missing signature or webhook secret" });
      return;
    }

    const stripe = getStripe();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      console.error("Stripe webhook signature verification failed:", message);
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }

    switch (event.type) {
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed": {
        // Delayed payment methods settle (or fail) after the session completes.
        // Route pledge sessions to their handler so entitlements are only
        // granted on settled funds and revoked/marked failed otherwise.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === "pledge") {
          await handlePledgeWebhookEvent(event);
        } else if (session.metadata?.type === "item") {
          await handleItemWebhookEvent(event);
        } else if (session.metadata?.type === "fiat_topup") {
          if (event.type === "checkout.session.async_payment_succeeded") await fulfilFiatTopup(session);
          else await markFiatTopupTerminal(session, "failed");
        } else if (session.metadata?.type === "phone_number") {
          if (event.type === "checkout.session.async_payment_succeeded") await fulfilPhoneNumberPurchase(session);
          else await markPhoneNumberPurchaseTerminal(session, "failed");
        }
        break;
      }
      case "checkout.session.expired": {
        // An abandoned/expired checkout releases any reserved limited-drop stock.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === "pledge") {
          await handlePledgeWebhookEvent(event);
        } else if (session.metadata?.type === "fiat_topup") {
          await markFiatTopupTerminal(session, "cancelled");
        } else if (session.metadata?.type === "phone_number") {
          await markPhoneNumberPurchaseTerminal(session, "cancelled");
        }
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        const type = session.metadata?.type;
        const feature = session.metadata?.feature as FeatureKey | undefined;
        const subscriptionId = typeof (session as any).subscription === "string"
          ? (session as any).subscription
          : (session as any).subscription?.id;

        if (type === "merch") {
          await handleMerchWebhookEvent(event);
        } else if (type === "pledge") {
          await handlePledgeWebhookEvent(event);
        } else if (type === "item") {
          await handleItemWebhookEvent(event);
        } else if (type === "donation") {
          if (userId && session.id) {
            await db
              .update(donationsTable)
              .set({ status: "completed" })
              .where(eq(donationsTable.stripeSessionId, session.id));
            console.log(`[Stripe] Donation completed for user ${userId} — session ${session.id}`);
          }
        } else if (type === "fiat_topup") {
          await fulfilFiatTopup(session);
        } else if (type === "phone_number") {
          await fulfilPhoneNumberPurchase(session);
        } else if (type === "season_pass") {
          await handleSeasonPassWebhookEvent(event as any);
        } else if (type === "bot_subscription") {
          const marketplaceItemIdStr = session.metadata?.marketplaceItemId;
          const marketplaceItemId = marketplaceItemIdStr ? parseInt(marketplaceItemIdStr) : NaN;
          if (userId && !isNaN(marketplaceItemId) && subscriptionId) {
            await activateBotSubscription(userId, marketplaceItemId, subscriptionId);
            console.log(`[Stripe] Bot subscription activated for user ${userId}, marketplace item ${marketplaceItemId} (sub: ${subscriptionId})`);
          } else {
            console.warn("[Stripe] bot_subscription checkout.completed but missing data", { userId, marketplaceItemId, subscriptionId });
          }
        } else if (userId && !feature && subscriptionId) {
          // Stripe Payment Link fallback — when a customer subscribes via a
          // hosted payment link (e.g. the PABLO PRIME buy.stripe.com link),
          // the session has no `metadata.feature` because we can't inject
          // metadata into payment-link checkouts. Resolve the feature by
          // matching the subscription's product against FEATURE_PRODUCT_IDS.
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price.product"] });
            const productId = (() => {
              const item = sub.items?.data?.[0];
              if (!item) return undefined;
              const product = (item.price as any)?.product;
              return typeof product === "string" ? product : product?.id;
            })();
            const matchedFeature = (Object.entries(FEATURE_PRODUCT_IDS) as [FeatureKey, string][])
              .find(([, pid]) => pid === productId)?.[0];
            if (matchedFeature) {
              await grantFeature(userId, matchedFeature, "stripe-payment-link", subscriptionId);
              console.log(`[Stripe] Payment-link grant: user ${userId} → ${matchedFeature} (sub: ${subscriptionId}, product: ${productId})`);
            } else {
              console.warn("[Stripe] Payment-link checkout — no matching feature for product", { userId, productId, subscriptionId });
            }
          } catch (err) {
            console.error("[Stripe] Payment-link fallback failed:", err instanceof Error ? err.message : err);
          }
        } else if (userId && feature && (FEATURE_KEYS.includes(feature) || resolveFeatureKey(feature))) {
          const resolvedFeature = resolveFeatureKey(feature) ?? feature as FeatureKey;
          const grantedBy = session.metadata?.grantedBy ?? "stripe";
          const orgIdMeta = session.metadata?.orgId;
          await grantFeature(userId, resolvedFeature, grantedBy, subscriptionId);
          console.log(`[Stripe] User ${userId} activated ${feature} (sub: ${subscriptionId}, grantedBy: ${grantedBy})`);

          if (orgIdMeta) {
            const parsedOrgId = parseInt(orgIdMeta);
            if (!isNaN(parsedOrgId)) {
              await db
                .insert(orgFeatureGrantsTable)
                .values({ orgId: parsedOrgId, featureKey: feature, stripeSubscriptionId: subscriptionId ?? null })
                .onConflictDoUpdate({
                  target: [orgFeatureGrantsTable.orgId, orgFeatureGrantsTable.featureKey],
                  set: { stripeSubscriptionId: subscriptionId ?? null, grantedAt: new Date() },
                });

              const companyMembers = await db
                .select()
                .from(orgMembersTable)
                .where(
                  and(
                    eq(orgMembersTable.orgId, parsedOrgId),
                    eq(orgMembersTable.status, "active"),
                    eq(orgMembersTable.featureBilling, "company")
                  )
                );

              for (const m of companyMembers) {
                if (m.userId !== userId) {
                  await grantFeature(m.userId, feature as FeatureKey, grantedBy, subscriptionId ?? undefined);
                }
              }
              console.log(`[Stripe] Org ${parsedOrgId}: granted ${feature} to ${companyMembers.length} company-billing members`);
            }
          }
        } else {
          console.warn("[Stripe] checkout.session.completed but missing userId or feature", { userId, feature });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subId = subscription.id;

        const botUserId = await deactivateBotSubscription(subId);
        if (botUserId) {
          console.log(`[Stripe] Bot subscription deactivated for user ${botUserId} (sub: ${subId})`);
          break;
        }

        const featureUserId = await revokeFeatureBySubscription(subId);
        if (featureUserId) {
          console.log(`[Stripe] User ${featureUserId} lost feature (subscription ${subId} deleted)`);
        } else {
          console.warn("[Stripe] subscription.deleted but no matching bot or feature found for sub", subId);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof (invoice as any).subscription === "string"
          ? (invoice as any).subscription
          : (invoice as any).subscription?.id;
        if (subId && (invoice.billing_reason === "subscription_cycle" || invoice.billing_reason === "subscription_create")) {
          console.log(`[Stripe] Payment succeeded for subscription ${subId}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[Stripe] Payment failed for invoice ${invoice.id} — customer ${invoice.customer}`);
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  }
);

export { DONATION_TIERS, getDonorTitle };
export default router;
