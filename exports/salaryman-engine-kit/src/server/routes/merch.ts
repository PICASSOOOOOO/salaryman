import { Router, raw } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { merchProductsTable, merchOrdersTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";

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

router.get("/merch/products", async (req, res) => {
  try {
    const products = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.active, true))
      .orderBy(asc(merchProductsTable.sortOrder), asc(merchProductsTable.id));
    res.json(products);
  } catch (err: any) {
    console.error("[Merch] list products error:", err.message);
    res.status(500).json({ error: "Failed to load products" });
  }
});

router.post("/merch/checkout", async (req, res) => {
  try {
    const { productId, size, quantity } = req.body;
    if (!productId) {
      res.status(400).json({ error: "productId required" });
      return;
    }
    const qty = Math.max(1, parseInt(quantity ?? "1", 10) || 1);

    const [product] = await db
      .select()
      .from(merchProductsTable)
      .where(eq(merchProductsTable.id, parseInt(productId, 10)))
      .limit(1);

    if (!product || !product.active) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();
    const userId = req.isAuthenticated?.() ? (req.user as any)?.id : undefined;

    const metadata: Record<string, string> = {
      productId: String(product.id),
      productName: product.name,
      type: "merch",
    };
    if (size) metadata.size = String(size);
    if (userId) metadata.userId = userId;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: product.price,
            product_data: {
              name: product.name + (size ? ` (${size})` : ""),
              description: product.description || undefined,
              images: Array.isArray(product.images) && (product.images as string[]).length > 0
                ? [(product.images as string[])[0]]
                : undefined,
            },
          },
          quantity: qty,
        },
      ],
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "NL", "SE", "NZ"],
      },
      success_url: `${baseUrl}/?merch_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?merch_cancel=1`,
      client_reference_id: userId ?? undefined,
      metadata,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[Merch] checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/merch/orders", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const userId = (req.user as any)?.id;
    const orders = await db
      .select()
      .from(merchOrdersTable)
      .where(eq(merchOrdersTable.userId, userId))
      .orderBy(desc(merchOrdersTable.createdAt));
    res.json(orders);
  } catch (err: any) {
    console.error("[Merch] list orders error:", err.message);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

router.get("/merch/admin/orders", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const orders = await db
      .select()
      .from(merchOrdersTable)
      .orderBy(desc(merchOrdersTable.createdAt));
    res.json(orders);
  } catch (err: any) {
    console.error("[Merch] admin list orders error:", err.message);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

router.get("/merch/admin/products", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const products = await db
      .select()
      .from(merchProductsTable)
      .orderBy(asc(merchProductsTable.sortOrder), asc(merchProductsTable.id));
    res.json(products);
  } catch (err: any) {
    console.error("[Merch] admin list products error:", err.message);
    res.status(500).json({ error: "Failed to load products" });
  }
});

router.post("/merch/admin/products", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const { name, description, price, images, sizes, category, active, sortOrder } = req.body;
    if (!name || price === undefined) {
      res.status(400).json({ error: "name and price required" });
      return;
    }
    const [product] = await db
      .insert(merchProductsTable)
      .values({
        name: String(name),
        description: String(description ?? ""),
        price: parseInt(String(price), 10),
        images: Array.isArray(images) ? images : [],
        sizes: Array.isArray(sizes) ? sizes : [],
        category: String(category ?? "apparel"),
        active: active !== false,
        sortOrder: parseInt(String(sortOrder ?? 0), 10),
      })
      .returning();
    res.json(product);
  } catch (err: any) {
    console.error("[Merch] create product error:", err.message);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.put("/merch/admin/products/:id", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description, price, images, sizes, category, active, sortOrder } = req.body;
    const updates: Partial<typeof merchProductsTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name);
    if (description !== undefined) updates.description = String(description);
    if (price !== undefined) updates.price = parseInt(String(price), 10);
    if (images !== undefined) updates.images = Array.isArray(images) ? images : [];
    if (sizes !== undefined) updates.sizes = Array.isArray(sizes) ? sizes : [];
    if (category !== undefined) updates.category = String(category);
    if (active !== undefined) updates.active = Boolean(active);
    if (sortOrder !== undefined) updates.sortOrder = parseInt(String(sortOrder), 10);

    const [product] = await db
      .update(merchProductsTable)
      .set(updates)
      .where(eq(merchProductsTable.id, id))
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  } catch (err: any) {
    console.error("[Merch] update product error:", err.message);
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/merch/admin/products/:id", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const id = parseInt(req.params.id, 10);
    await db
      .update(merchProductsTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(merchProductsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Merch] delete product error:", err.message);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

router.patch("/merch/admin/orders/:id/status", async (req, res) => {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    const [order] = await db
      .update(merchOrdersTable)
      .set({ status: String(status), updatedAt: new Date() })
      .where(eq(merchOrdersTable.id, id))
      .returning();
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (err: any) {
    console.error("[Merch] update order status error:", err.message);
    res.status(500).json({ error: "Failed to update order" });
  }
});

export async function handleMerchWebhookEvent(event: Stripe.Event): Promise<void> {
  if (event.type !== "checkout.session.completed") return;

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.type !== "merch") return;

  try {
    const productId = parseInt(session.metadata?.productId ?? "0", 10);
    const productName = session.metadata?.productName ?? "Unknown";
    const size = session.metadata?.size ?? null;
    const userId = session.client_reference_id || session.metadata?.userId || null;
    const shipping = (session as any).shipping_details;

    await db.insert(merchOrdersTable).values({
      userId: userId ?? undefined,
      stripeSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? undefined,
      productId,
      productName,
      size: size ?? undefined,
      quantity: 1,
      amountTotal: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      status: "paid",
      shippingName: shipping?.name ?? undefined,
      shippingEmail: session.customer_details?.email ?? undefined,
      shippingLine1: shipping?.address?.line1 ?? undefined,
      shippingLine2: shipping?.address?.line2 ?? undefined,
      shippingCity: shipping?.address?.city ?? undefined,
      shippingState: shipping?.address?.state ?? undefined,
      shippingPostalCode: shipping?.address?.postal_code ?? undefined,
      shippingCountry: shipping?.address?.country ?? undefined,
    }).onConflictDoNothing();

    console.log(`[Merch] Order recorded for product ${productName} (session ${session.id})`);
  } catch (err: any) {
    console.error("[Merch] Failed to record order:", err.message);
  }
}

export default router;
