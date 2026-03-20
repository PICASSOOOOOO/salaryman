import { Router, raw } from "express";
import Stripe from "stripe";
import { grantFeature, revokeFeatureBySubscription, FEATURE_CATALOG } from "../lib/plan";
import { FEATURE_KEYS, type FeatureKey, db, donationsTable, orgMembersTable, organizationsTable, orgFeatureGrantsTable } from "@workspace/db";
import { eq, sum, desc, and } from "drizzle-orm";
import { handleMerchWebhookEvent } from "./merch";
import { handleSeasonPassWebhookEvent } from "./salaryman-season";

const router = Router();

const FEATURE_PRICE_ENV: Record<FeatureKey, string> = {
  live_listen: "STRIPE_PRICE_LIVE_LISTEN",
  screen_scan: "STRIPE_PRICE_SCREEN_SCAN",
  say_this: "STRIPE_PRICE_SAY_THIS",
  phone_system: "STRIPE_PRICE_PHONE_SYSTEM",
};

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

function getPriceIdForFeature(feature: FeatureKey): string | undefined {
  return process.env[FEATURE_PRICE_ENV[feature]];
}

const DONATION_TIERS = [
  { id: "slush_2", label: "STREET INFORMANT", amountCents: 200, badge: "Street Informant" },
  { id: "slush_5", label: "SHADOW INVESTOR", amountCents: 500, badge: "Shadow Investor" },
  { id: "slush_10", label: "CORPORATE BENEFACTOR", amountCents: 1000, badge: "Corporate Benefactor" },
  { id: "slush_25", label: "MEGACORP PATRON", amountCents: 2500, badge: "Megacorp Patron" },
];

function getDonorTitle(totalCents: number): string {
  if (totalCents >= 5000) return "Megacorp Patron";
  if (totalCents >= 2000) return "Corporate Benefactor";
  if (totalCents >= 1000) return "Shadow Investor";
  if (totalCents >= 200) return "Street Informant";
  return "";
}

router.post("/stripe/create-checkout-session", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const feature = req.body?.feature as FeatureKey | undefined;
  if (!feature || !FEATURE_KEYS.includes(feature)) {
    res.status(400).json({ error: "Invalid feature", validFeatures: [...FEATURE_KEYS] });
    return;
  }

  const priceId = getPriceIdForFeature(feature);
  if (!priceId) {
    res.status(500).json({ error: `Pricing for ${FEATURE_CATALOG[feature].name} not configured yet` });
    return;
  }

  const user = req.user;
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

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/upgrade?checkout=success&feature=${feature}`,
    cancel_url: `${baseUrl}/upgrade?checkout=cancel`,
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
    finalAmountCents = Math.min(Math.round(amountCents), 100000);
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
        } else if (type === "donation") {
          if (userId && session.id) {
            await db
              .update(donationsTable)
              .set({ status: "completed" })
              .where(eq(donationsTable.stripeSessionId, session.id));
            console.log(`[Stripe] Donation completed for user ${userId} — session ${session.id}`);
          }
        } else if (type === "season_pass") {
          await handleSeasonPassWebhookEvent(event as any);
        } else if (userId && feature && FEATURE_KEYS.includes(feature)) {
          const grantedBy = session.metadata?.grantedBy ?? "stripe";
          const orgIdMeta = session.metadata?.orgId;
          await grantFeature(userId, feature, grantedBy, subscriptionId);
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
        const userId = await revokeFeatureBySubscription(subId);
        if (userId) {
          console.log(`[Stripe] User ${userId} lost feature (subscription ${subId} deleted)`);
        } else {
          console.warn("[Stripe] subscription.deleted but no matching feature found for sub", subId);
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
