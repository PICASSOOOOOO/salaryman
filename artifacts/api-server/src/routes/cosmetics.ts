import { Router, raw } from "express";
import Stripe from "stripe";
import { db, cosmeticCatalogTable, playerCosmeticsTable, cryptoPurchasesTable, playerCryptoBalanceTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getSpendableFiat, spendFiat } from "../lib/fiat-wallet";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key);
}

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:3000";
}

const CRYPTO_BUNDLES = [
  { id: "crypto_500",  label: "MICRO STACK",  amount: 500,  cents: 499,  popular: false },
  { id: "crypto_1200", label: "BLOCK STACK",  amount: 1200, cents: 999,  popular: true  },
  { id: "crypto_2500", label: "MEGA STACK",   amount: 2500, cents: 1999, popular: false },
] as const;

const COSMETIC_CATALOG_DATA = [
  { id: "skin_neon_runner",      name: "NEON RUNNER SKIN",      category: "skin",    description: "Electric blue trim. Glows in the dark.", priceCrypto: 800,  rarity: "rare",      colorHex: "#00ccff", iconEmoji: "⚡" },
  { id: "skin_void_ghost",       name: "VOID GHOST SKIN",       category: "skin",    description: "Pure black. Almost invisible at night.",  priceCrypto: 1200, rarity: "epic",      colorHex: "#110022", iconEmoji: "👻" },
  { id: "skin_chrome_executive", name: "CHROME EXECUTIVE",      category: "skin",    description: "Mirrored chrome. PABLO approved.",        priceCrypto: 600,  rarity: "uncommon",  colorHex: "#cccccc", iconEmoji: "🪞" },
  { id: "skin_toxic_waste",      name: "TOXIC WASTE SKIN",      category: "skin",    description: "Radioactive green. Hazmat aesthetic.",    priceCrypto: 500,  rarity: "uncommon",  colorHex: "#44ff00", iconEmoji: "☢️" },
  { id: "skin_bloodrush",        name: "BLOODRUSH SKIN",        category: "skin",    description: "Deep crimson. War-worn operative.",       priceCrypto: 700,  rarity: "rare",      colorHex: "#cc1122", iconEmoji: "🩸" },
  { id: "skin_gold_corp",        name: "GOLD CORP SKIN",        category: "skin",    description: "24-karat. Reserved for the elite.",      priceCrypto: 2000, rarity: "legendary", colorHex: "#ffaa00", iconEmoji: "👑" },
  { id: "wrap_rust_devil",       name: "RUST DEVIL WRAP",       category: "vehicle", description: "Battle-scarred rust. Wasteland survivor.", priceCrypto: 400, rarity: "common",    colorHex: "#aa5533", iconEmoji: "🔴" },
  { id: "wrap_neon_phantom",     name: "NEON PHANTOM WRAP",     category: "vehicle", description: "Hot pink neon. Unmistakable on the road.", priceCrypto: 900, rarity: "rare",      colorHex: "#ff44cc", iconEmoji: "🌸" },
  { id: "wrap_stealth_black",    name: "STEALTH BLACK WRAP",    category: "vehicle", description: "Matte black. No reflections. No witnesses.", priceCrypto: 650, rarity: "uncommon", colorHex: "#222233", iconEmoji: "🖤" },
  { id: "wrap_corp_white",       name: "CORP WHITE WRAP",       category: "vehicle", description: "PABLO CORP official livery. Intimidating.", priceCrypto: 500, rarity: "uncommon", colorHex: "#f0f0f0", iconEmoji: "🤍" },
  { id: "emote_salute",          name: "CORP SALUTE",           category: "emote",   description: "The PABLO CORP mandatory greeting.",     priceCrypto: 200,  rarity: "common",    colorHex: "#00ff41", iconEmoji: "🫡" },
  { id: "emote_glitch",          name: "SYSTEM GLITCH",         category: "emote",   description: "Replicant error state. Unsettling.",     priceCrypto: 450,  rarity: "uncommon",  colorHex: "#33ffaa", iconEmoji: "💫" },
  { id: "emote_kneel",           name: "SUBMISSION PROTOCOL",   category: "emote",   description: "For when you want to be ironic.",        priceCrypto: 350,  rarity: "common",    colorHex: "#ffcc00", iconEmoji: "🙇" },
  { id: "emote_taunt",           name: "WASTELAND TAUNT",       category: "emote",   description: "Outlaw classic. Disrespectful. Perfect.", priceCrypto: 300, rarity: "common",    colorHex: "#88ff44", iconEmoji: "🤙" },
  { id: "theme_blood_moon",      name: "BLOOD MOON UI THEME",   category: "theme",   description: "Deep red terminals. Ominous aesthetic.",  priceCrypto: 550, rarity: "uncommon",  colorHex: "#cc2200", iconEmoji: "🌕" },
  { id: "theme_void_core",       name: "VOID CORE UI THEME",    category: "theme",   description: "Ultra-dark purple. Replicant-tier look.", priceCrypto: 750, rarity: "rare",      colorHex: "#4400cc", iconEmoji: "🌌" },
  { id: "theme_gold_corp",       name: "GOLD CORP UI THEME",    category: "theme",   description: "Gold terminals. Maximum corpo vibes.",    priceCrypto: 1000, rarity: "epic",     colorHex: "#ffaa00", iconEmoji: "✨" },
  { id: "weapon_crimson_blade",  name: "CRIMSON BLADE SKIN",    category: "weapon",  description: "Blood-red edge. Custom-forged in the wastes.", priceCrypto: 450, rarity: "uncommon", colorHex: "#cc1122", iconEmoji: "🗡️" },
  { id: "weapon_neon_lance",     name: "NEON LANCE SKIN",       category: "weapon",  description: "Prism Lance variant. Cyan glow trail.",  priceCrypto: 700,  rarity: "rare",      colorHex: "#00ffff", iconEmoji: "💠" },
  { id: "weapon_ghost_blade",    name: "GHOST BLADE SKIN",      category: "weapon",  description: "Translucent edge. Spectral residue.",    priceCrypto: 1100, rarity: "epic",      colorHex: "#aaeeff", iconEmoji: "👁️" },
];

async function getOrCreateBalance(userId: string): Promise<number> {
  const [row] = await db.select().from(playerCryptoBalanceTable).where(eq(playerCryptoBalanceTable.userId, userId));
  if (row) return row.balance;
  await db.insert(playerCryptoBalanceTable).values({ userId, balance: 0 }).onConflictDoNothing();
  return 0;
}

async function addCrypto(userId: string, amount: number): Promise<number> {
  const current = await getOrCreateBalance(userId);
  const newBal = current + amount;
  await db.insert(playerCryptoBalanceTable)
    .values({ userId, balance: newBal })
    .onConflictDoUpdate({
      target: [playerCryptoBalanceTable.userId],
      set: { balance: newBal, updatedAt: new Date() },
    });
  return newBal;
}

async function spendCrypto(userId: string, amount: number): Promise<{ ok: boolean; balance: number }> {
  const current = await getOrCreateBalance(userId);
  if (current < amount) return { ok: false, balance: current };
  const newBal = current - amount;
  await db.insert(playerCryptoBalanceTable)
    .values({ userId, balance: newBal })
    .onConflictDoUpdate({
      target: [playerCryptoBalanceTable.userId],
      set: { balance: newBal, updatedAt: new Date() },
    });
  return { ok: true, balance: newBal };
}

router.get("/cosmetics/bundles", (_req, res) => {
  res.json({ bundles: [] });
});

router.get("/cosmetics/balance", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const balance = await getSpendableFiat(req.user.id);
    res.json(balance);
  } catch (err: any) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/cosmetics/catalog", async (_req, res) => {
  try {
    res.json({ items: COSMETIC_CATALOG_DATA });
  } catch (err: any) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/cosmetics/inventory", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const owned = await db.select().from(playerCosmeticsTable).where(eq(playerCosmeticsTable.userId, req.user.id));
    res.json({ inventory: owned });
  } catch (err: any) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/cosmetics/buy", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const { cosmeticId } = req.body;
  if (!cosmeticId) {
    res.status(400).json({ error: "cosmeticId required" });
    return;
  }
  const item = COSMETIC_CATALOG_DATA.find(c => c.id === cosmeticId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx.select().from(playerCosmeticsTable)
        .where(and(eq(playerCosmeticsTable.userId, req.user.id), eq(playerCosmeticsTable.cosmeticId, cosmeticId)));
      if (existing.length > 0) return { type: "owned" as const };
      const paid = await spendFiat(tx, {
        userId: req.user.id,
        amountFiat: item.priceCrypto,
        description: `Cosmetic: ${item.name}`,
        kind: "cosmetic",
      });
      if (!paid.ok) return { type: "insufficient" as const, paid };
      const inserted = await tx
        .insert(playerCosmeticsTable)
        .values({ userId: req.user.id, cosmeticId, equipped: false })
        .onConflictDoNothing()
        .returning({ id: playerCosmeticsTable.id });
      if (inserted.length === 0) throw new Error("COSMETIC_ALREADY_OWNED");
      return { type: "ok" as const, paid };
    });
    if (result.type === "owned") {
      res.status(409).json({ error: "Already owned" });
      return;
    }
    if (result.type === "insufficient") {
      res.status(402).json({ error: "Insufficient FIAT balance", spendable: result.paid.spendable });
      return;
    }
    res.json({ ok: true, newBalance: result.paid.newBalance, spendable: result.paid.spendable });
  } catch (err: any) {
    if (err?.message === "COSMETIC_ALREADY_OWNED") {
      res.status(409).json({ error: "Already owned" });
      return;
    }
    console.error("[cosmetics] buy error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/cosmetics/equip", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const { cosmeticId, equipped } = req.body;
  if (!cosmeticId || equipped === undefined) {
    res.status(400).json({ error: "cosmeticId and equipped required" });
    return;
  }
  const item = COSMETIC_CATALOG_DATA.find(c => c.id === cosmeticId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  try {
    if (equipped) {
      await db.update(playerCosmeticsTable)
        .set({ equipped: false })
        .where(and(
          eq(playerCosmeticsTable.userId, req.user.id),
          eq(playerCosmeticsTable.equipped, true),
        ));

      const sameCategory = COSMETIC_CATALOG_DATA.filter(c => c.category === item.category).map(c => c.id);
      for (const cid of sameCategory) {
        try {
          await db.update(playerCosmeticsTable)
            .set({ equipped: false })
            .where(and(eq(playerCosmeticsTable.userId, req.user.id), eq(playerCosmeticsTable.cosmeticId, cid)));
        } catch {}
      }
    }

    const updated = await db.update(playerCosmeticsTable)
      .set({ equipped: !!equipped })
      .where(and(eq(playerCosmeticsTable.userId, req.user.id), eq(playerCosmeticsTable.cosmeticId, cosmeticId)))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "Item not owned" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[cosmetics] equip error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/cosmetics/checkout", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  res.status(410).json({
    error: "Legacy cosmetic currency packs are retired. Use Banco Ombra FIAT top-ups.",
    redirect: "/game/bank",
  });
});

router.post(
  "/cosmetics/webhook",
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
      console.error("Stripe webhook (cosmetics) verification failed:", message);
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.type === "crypto_bundle") {
        const userId = session.client_reference_id || session.metadata?.userId;
        const bundleId = session.metadata?.bundleId;
        const cryptoAmount = parseInt(session.metadata?.cryptoAmount ?? "0", 10);
        if (userId && cryptoAmount > 0) {
          await addCrypto(userId, cryptoAmount);
          await db.update(cryptoPurchasesTable)
            .set({ status: "completed" })
            .where(eq(cryptoPurchasesTable.stripeSessionId, session.id));
          console.log(`[Cosmetics] User ${userId} received ${cryptoAmount} FIAT (bundle: ${bundleId})`);
        }
      }
    }
    res.json({ received: true });
  }
);

router.get("/cosmetics/history", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const history = await db.select().from(cryptoPurchasesTable)
      .where(eq(cryptoPurchasesTable.userId, req.user.id));
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
