import { Router, raw } from "express";
import Stripe from "stripe";
import { setUserTier } from "../lib/plan";

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

router.post("/stripe/create-checkout-session", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    res.status(500).json({ error: "Stripe price not configured" });
    return;
  }

  const user = req.user;
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/upgrade?checkout=success`,
    cancel_url: `${baseUrl}/upgrade?checkout=cancel`,
    client_reference_id: user.id,
    metadata: { userId: user.id },
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
        const userId = session.client_reference_id || session.metadata?.userId;
        if (userId) {
          await setUserTier(userId, "pro", "stripe");
          console.log(`[Stripe] User ${userId} upgraded to pro`);
        } else {
          console.warn("[Stripe] checkout.session.completed but no userId found");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
        const stripe2 = getStripe();
        const sessions = await stripe2.checkout.sessions.list({
          customer: customerId,
          limit: 10,
        });
        const userId =
          sessions.data.find(s => s.client_reference_id)?.client_reference_id ||
          sessions.data.find(s => s.metadata?.userId)?.metadata?.userId;
        if (userId) {
          await setUserTier(userId, "free", "stripe");
          console.log(`[Stripe] User ${userId} downgraded to free`);
        } else {
          console.warn("[Stripe] subscription.deleted but no userId found for customer", customerId);
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  }
);

export default router;
