import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  orgPaymentConnectionsTable,
  orgPaymentsTable,
  organizationsTable,
} from "@workspace/db";
import {
  BeginOrganizationStripeOnboardingResponse,
  CreateOrganizationPaymentCheckoutBody,
  CreateOrganizationPaymentCheckoutResponse,
  GetOrganizationPaymentsResponse,
} from "@workspace/api-zod";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { getStripe } from "./stripe";

const router = Router();
const STRIPE_PROVIDER = "stripe";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String((req.user as { id: string }).id);
}

async function resolveAuthorizedOrg(
  userId: string,
  permission: "finance.view" | "finance.manage",
  res: Response,
): Promise<number | null> {
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) {
    res.status(404).json({ error: "No active organization found" });
    return null;
  }
  const gate = await canDoInOrg(userId, orgId, permission);
  if (!gate.allowed) {
    res.status(403).json({ error: `Requires ${permission} permission` });
    return null;
  }
  return orgId;
}

function appBaseUrl(): string {
  const base = process.env.APP_BASE_URL
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:3000");
  return base.replace(/\/+$/, "");
}

function paymentResponse(payment: typeof orgPaymentsTable.$inferSelect) {
  return {
    id: payment.id,
    provider: STRIPE_PROVIDER as const,
    description: payment.description,
    amountMinor: payment.amountMinor,
    refundedMinor: payment.refundedMinor,
    currency: "usd" as const,
    status: payment.status,
    createdAt: payment.createdAt,
    settledAt: payment.settledAt,
  };
}

function accountMatchesOrganization(account: Stripe.Account, orgId: number): boolean {
  return account.metadata?.salarymanOrgId === String(orgId);
}

function stripeAccountFlags(account: Stripe.Account) {
  return {
    chargesEnabled: account.charges_enabled === true && account.details_submitted === true,
    payoutsEnabled:
      account.payouts_enabled === true && account.capabilities?.transfers === "active",
  };
}

router.get("/orgs/current/payments", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const orgId = await resolveAuthorizedOrg(userId, "finance.view", res);
  if (!orgId) return;

  const [organization] = await db
    .select({ name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!organization) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const [connection] = await db
    .select()
    .from(orgPaymentConnectionsTable)
    .where(and(
      eq(orgPaymentConnectionsTable.orgId, orgId),
      eq(orgPaymentConnectionsTable.provider, STRIPE_PROVIDER),
    ))
    .limit(1);

  let chargesEnabled = false;
  let payoutsEnabled = false;
  if (connection) {
    try {
      const account = await getStripe().accounts.retrieve(connection.providerAccountId);
      if (!accountMatchesOrganization(account, orgId)) {
        res.status(409).json({ error: "The connected Stripe account does not match this organization" });
        return;
      }
      ({ chargesEnabled, payoutsEnabled } = stripeAccountFlags(account));
      await db
        .update(orgPaymentConnectionsTable)
        .set({
          accountStatus: account.requirements?.disabled_reason
            ? "restricted"
            : chargesEnabled && payoutsEnabled
              ? "active"
              : "onboarding",
          chargesEnabled,
          payoutsEnabled,
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orgPaymentConnectionsTable.id, connection.id));
    } catch (error) {
      req.log.error({ err: error, orgId }, "Could not verify organization Stripe connection");
      res.status(502).json({ error: "Could not verify the organization's Stripe connection" });
      return;
    }
  }

  const [summary] = await db
    .select({
      confirmedMinor: sql<number>`coalesce(sum(case when ${orgPaymentsTable.status} in ('paid', 'partially_refunded', 'refunded', 'disputed', 'dispute_won', 'dispute_lost') then ${orgPaymentsTable.amountMinor} else 0 end), 0)`,
      refundedMinor: sql<number>`coalesce(sum(${orgPaymentsTable.refundedMinor}), 0)`,
      settledCount: sql<number>`count(*) filter (where ${orgPaymentsTable.status} in ('paid', 'partially_refunded', 'refunded', 'disputed', 'dispute_won', 'dispute_lost'))`,
      disputedCount: sql<number>`count(*) filter (where ${orgPaymentsTable.status} = 'disputed')`,
    })
    .from(orgPaymentsTable)
    .where(eq(orgPaymentsTable.orgId, orgId));

  const payments = await db
    .select()
    .from(orgPaymentsTable)
    .where(eq(orgPaymentsTable.orgId, orgId))
    .orderBy(desc(orgPaymentsTable.createdAt))
    .limit(50);

  res.json(GetOrganizationPaymentsResponse.parse({
    organizationId: orgId,
    organizationName: organization.name,
    connected: Boolean(connection),
    chargesEnabled,
    payoutsEnabled,
    currency: "usd",
    summary: {
      confirmedMinor: Number(summary?.confirmedMinor ?? 0),
      refundedMinor: Number(summary?.refundedMinor ?? 0),
      settledCount: Number(summary?.settledCount ?? 0),
      disputedCount: Number(summary?.disputedCount ?? 0),
    },
    payments: payments.map(paymentResponse),
  }));
});

router.post("/orgs/current/payments/connect", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const orgId = await resolveAuthorizedOrg(userId, "finance.manage", res);
  if (!orgId) return;

  const [organization] = await db
    .select({
      contactEmail: organizationsTable.contactEmail,
      name: organizationsTable.name,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!organization) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const stripe = getStripe();
  let [connection] = await db
    .select()
    .from(orgPaymentConnectionsTable)
    .where(and(
      eq(orgPaymentConnectionsTable.orgId, orgId),
      eq(orgPaymentConnectionsTable.provider, STRIPE_PROVIDER),
    ))
    .limit(1);

  if (!connection) {
    const account = await stripe.accounts.create(
      {
        type: "express",
        email: organization.contactEmail ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          salarymanOrgId: String(orgId),
          salarymanProduct: "organization_payments",
        },
      },
      { idempotencyKey: `organization-stripe-connect:${orgId}` },
    );
    const [inserted] = await db
      .insert(orgPaymentConnectionsTable)
      .values({
        orgId,
        provider: STRIPE_PROVIDER,
        providerAccountId: account.id,
        accountStatus: "onboarding",
        connectedByUserId: userId,
      })
      .onConflictDoNothing({
        target: [orgPaymentConnectionsTable.orgId, orgPaymentConnectionsTable.provider],
      })
      .returning();
    connection = inserted;
    if (!connection) {
      [connection] = await db
        .select()
        .from(orgPaymentConnectionsTable)
        .where(and(
          eq(orgPaymentConnectionsTable.orgId, orgId),
          eq(orgPaymentConnectionsTable.provider, STRIPE_PROVIDER),
        ))
        .limit(1);
    }
  }

  if (!connection) {
    res.status(409).json({ error: "Could not save the organization's Stripe connection" });
    return;
  }

  const account = await stripe.accounts.retrieve(connection.providerAccountId);
  if (!accountMatchesOrganization(account, orgId)) {
    res.status(409).json({ error: "The connected Stripe account does not match this organization" });
    return;
  }

  const base = appBaseUrl();
  const link = await stripe.accountLinks.create({
    account: connection.providerAccountId,
    type: "account_onboarding",
    refresh_url: `${base}/business/accounts?stripe_org_connect=refresh`,
    return_url: `${base}/business/accounts?stripe_org_connect=return`,
  });
  res.json(BeginOrganizationStripeOnboardingResponse.parse({ url: link.url }));
});

router.post("/orgs/current/payments/checkout", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const orgId = await resolveAuthorizedOrg(userId, "finance.manage", res);
  if (!orgId) return;

  const input = CreateOrganizationPaymentCheckoutBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  const description = input.data.description.trim();
  if (!description) {
    res.status(400).json({ error: "Description is required" });
    return;
  }

  const [connection] = await db
    .select()
    .from(orgPaymentConnectionsTable)
    .where(and(
      eq(orgPaymentConnectionsTable.orgId, orgId),
      eq(orgPaymentConnectionsTable.provider, STRIPE_PROVIDER),
    ))
    .limit(1);
  if (!connection) {
    res.status(409).json({ error: "Connect Stripe before creating a payment checkout" });
    return;
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(connection.providerAccountId);
  if (!accountMatchesOrganization(account, orgId)) {
    res.status(409).json({ error: "The connected Stripe account does not match this organization" });
    return;
  }
  const flags = stripeAccountFlags(account);
  if (!flags.chargesEnabled || !flags.payoutsEnabled) {
    res.status(409).json({ error: "Finish Stripe onboarding before accepting payments" });
    return;
  }

  const existingRows = await db
    .select()
    .from(orgPaymentsTable)
    .where(and(
      eq(orgPaymentsTable.orgId, orgId),
      eq(orgPaymentsTable.provider, STRIPE_PROVIDER),
      eq(orgPaymentsTable.requestKey, input.data.requestKey),
    ))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    if (existing.amountMinor !== input.data.amountMinor || existing.description !== description) {
      res.status(409).json({ error: "This request key was already used for a different payment" });
      return;
    }
    if (existing.status !== "pending") {
      res.status(409).json({ error: "This payment request is no longer open" });
      return;
    }
    const session = await stripe.checkout.sessions.retrieve(existing.providerCheckoutId);
    if (session.status !== "open" || !session.url || (session.expires_at ?? 0) <= Date.now() / 1000) {
      res.status(409).json({ error: "This checkout has expired; create a new payment request" });
      return;
    }
    res.status(201).json(CreateOrganizationPaymentCheckoutResponse.parse({
      payment: paymentResponse(existing),
      checkoutUrl: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    }));
    return;
  }

  const base = appBaseUrl();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.data.amountMinor,
          product_data: { name: description },
        },
      }],
      payment_intent_data: {
        transfer_data: { destination: connection.providerAccountId },
        metadata: {
          salarymanOrgId: String(orgId),
          salarymanProduct: "organization_payments",
        },
      },
      metadata: {
        type: "organization_payment",
        organizationId: String(orgId),
        providerAccountId: connection.providerAccountId,
        requestKey: input.data.requestKey,
      },
      success_url: `${base}/business/accounts?org_payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/business/accounts?org_payment=cancelled`,
    },
    { idempotencyKey: `organization-payment:${orgId}:${input.data.requestKey}` },
  );

  if (!session.id || !session.url) {
    res.status(502).json({ error: "Stripe did not return a checkout URL" });
    return;
  }

  const paymentIntent = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  const [inserted] = await db
    .insert(orgPaymentsTable)
    .values({
      orgId,
      provider: STRIPE_PROVIDER,
      providerAccountId: connection.providerAccountId,
      providerCheckoutId: session.id,
      providerPaymentId: paymentIntent,
      requestKey: input.data.requestKey,
      amountMinor: input.data.amountMinor,
      currency: "usd",
      description,
      status: "pending",
      createdByUserId: userId,
    })
    .onConflictDoNothing({
      target: [
        orgPaymentsTable.orgId,
        orgPaymentsTable.provider,
        orgPaymentsTable.requestKey,
      ],
    })
    .returning();

  let payment = inserted;
  if (!payment) {
    const [concurrentPayment] = await db
      .select()
      .from(orgPaymentsTable)
      .where(and(
        eq(orgPaymentsTable.orgId, orgId),
        eq(orgPaymentsTable.provider, STRIPE_PROVIDER),
        eq(orgPaymentsTable.requestKey, input.data.requestKey),
      ))
      .limit(1);
    if (
      !concurrentPayment ||
      concurrentPayment.amountMinor !== input.data.amountMinor ||
      concurrentPayment.description !== description ||
      concurrentPayment.providerCheckoutId !== session.id
    ) {
      res.status(409).json({ error: "Could not safely reuse this payment request" });
      return;
    }
    payment = concurrentPayment;
  }

  res.status(201).json(CreateOrganizationPaymentCheckoutResponse.parse({
    payment: paymentResponse(payment),
    checkoutUrl: session.url,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  }));
});

export default router;
