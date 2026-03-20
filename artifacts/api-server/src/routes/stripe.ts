import { Router, raw } from "express";
import Stripe from "stripe";
import { grantFeature, revokeFeatureBySubscription, FEATURE_CATALOG } from "../lib/plan";
import { FEATURE_KEYS, type FeatureKey } from "@workspace/db";
import { handleMerchWebhookEvent } from "./merch";

const router = Router();

const FEATURE_PRICE_ENV: Record<FeatureKey, string> = {
  live_listen: "STRIPE_PRICE_LIVE_LISTEN",
  screen_scan: "STRIPE_PRICE_SCREEN_SCAN",
  say_this: "STRIPE_PRICE_SAY_THIS",
  phone_system: "STRIPE_PRICE_PHONE_SYSTEM",
};

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

function getPriceIdForFeature(feature: FeatureKey): string | undefined {
  return process.env[FEATURE_PRICE_ENV[feature]];
}

function featureKeyFromPriceId(priceId: string): FeatureKey | undefined {
  for (const key of FEATURE_KEYS) {
    if (process.env[FEATURE_PRICE_ENV[key]] === priceId) return key;
  }
  return undefined;
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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/upgrade?checkout=success&feature=${feature}`,
    cancel_url: `${baseUrl}/upgrade?checkout=cancel`,
    client_reference_id: user.id,
    metadata: { userId: user.id, feature },
  });

  res.json({ url: session.url });
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

        if (session.metadata?.type === "merch") {
          await handleMerchWebhookEvent(event);
        } else {
          const userId = session.client_reference_id || session.metadata?.userId;
          const feature = session.metadata?.feature as FeatureKey | undefined;
          const subscriptionId = typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription as any)?.id;

          if (userId && feature && FEATURE_KEYS.includes(feature)) {
            await grantFeature(userId, feature, "stripe", subscriptionId);
            console.log(`[Stripe] User ${userId} activated ${feature} (sub: ${subscriptionId})`);
          } else {
            console.warn("[Stripe] checkout.session.completed but missing userId or feature", { userId, feature });
          }
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
        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : (invoice.subscription as any)?.id;
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

export default router;
