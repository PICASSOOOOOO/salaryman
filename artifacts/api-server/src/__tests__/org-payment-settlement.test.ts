import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  orgMembersTable,
  orgPaymentsTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";
import { handleStripeOrganizationPaymentEvent } from "../lib/org-payment-settlement";
import type Stripe from "stripe";

const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];

async function createPayment() {
  const email = `org-payment-webhook-${randomUUID()}@example.test`;
  const [user] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id });
  createdUserIds.push(user.id);

  const [org] = await db
    .insert(organizationsTable)
    .values({
      name: `PAYMENT WEBHOOK TEST ${randomUUID()}`,
      ownerUserId: user.id,
      isDeveloper: false,
    })
    .returning({ id: organizationsTable.id });
  createdOrgIds.push(org.id);
  await db.insert(orgMembersTable).values({
    orgId: org.id,
    userId: user.id,
    role: "owner",
    status: "active",
  });

  const providerAccountId = `acct_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const providerCheckoutId = `cs_${randomUUID().replace(/-/g, "")}`;
  const [payment] = await db
    .insert(orgPaymentsTable)
    .values({
      orgId: org.id,
      provider: "stripe",
      providerAccountId,
      providerCheckoutId,
      requestKey: `webhook-${randomUUID().slice(0, 12)}`,
      amountMinor: 12_500,
      currency: "usd",
      description: "Invoice 225",
      status: "pending",
      createdByUserId: user.id,
    })
    .returning();

  return { payment, providerAccountId, providerCheckoutId };
}

function event(type: string, id: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id,
    object: "event",
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    pending_webhooks: 1,
    request: null,
    data: { object },
  } as unknown as Stripe.Event;
}

afterAll(async () => {
  if (createdOrgIds.length) {
    await db.delete(orgPaymentsTable).where(inArray(orgPaymentsTable.orgId, createdOrgIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, createdOrgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, createdOrgIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

describe("organization Stripe payment settlement", () => {
  it("verifies the transfer, settles once, and tracks partial and full refunds idempotently", async () => {
    const { payment, providerAccountId, providerCheckoutId } = await createPayment();
    const paymentIntentId = `pi_${randomUUID().replace(/-/g, "")}`;
    const settledAtSeconds = Math.floor(Date.now() / 1000);
    const retrievePaymentIntent = vi.fn().mockResolvedValue({
      id: paymentIntentId,
      amount_received: payment.amountMinor,
      currency: "usd",
      transfer_data: { destination: providerAccountId },
    });
    const stripe = {
      paymentIntents: { retrieve: retrievePaymentIntent },
    } as unknown as Stripe;
    const completed = event("checkout.session.completed", `evt_${randomUUID()}`, {
      id: providerCheckoutId,
      metadata: { type: "organization_payment" },
      payment_status: "paid",
      amount_total: payment.amountMinor,
      currency: "usd",
      payment_intent: paymentIntentId,
      created: settledAtSeconds,
    });

    await handleStripeOrganizationPaymentEvent(completed, stripe);
    const [settled] = await db
      .select()
      .from(orgPaymentsTable)
      .where(eq(orgPaymentsTable.id, payment.id));
    expect(settled).toMatchObject({
      status: "paid",
      providerPaymentId: paymentIntentId,
      settledAt: new Date(settledAtSeconds * 1000),
      refundedMinor: 0,
    });

    await handleStripeOrganizationPaymentEvent(completed, stripe);
    const [stillSettled] = await db
      .select()
      .from(orgPaymentsTable)
      .where(eq(orgPaymentsTable.id, payment.id));
    expect(stillSettled?.status).toBe("paid");

    const partialRefund = event("charge.refunded", `evt_${randomUUID()}`, {
      payment_intent: paymentIntentId,
      amount_refunded: 2_500,
    });
    await handleStripeOrganizationPaymentEvent(partialRefund, stripe);
    const [partiallyRefunded] = await db
      .select()
      .from(orgPaymentsTable)
      .where(eq(orgPaymentsTable.id, payment.id));
    expect(partiallyRefunded).toMatchObject({
      status: "partially_refunded",
      refundedMinor: 2_500,
    });

    await handleStripeOrganizationPaymentEvent(partialRefund, stripe);
    const [notDoubleRefunded] = await db
      .select()
      .from(orgPaymentsTable)
      .where(eq(orgPaymentsTable.id, payment.id));
    expect(notDoubleRefunded?.refundedMinor).toBe(2_500);

    await handleStripeOrganizationPaymentEvent(
      event("charge.refunded", `evt_${randomUUID()}`, {
        payment_intent: paymentIntentId,
        amount_refunded: payment.amountMinor,
      }),
      stripe,
    );
    const [refunded] = await db
      .select()
      .from(orgPaymentsTable)
      .where(eq(orgPaymentsTable.id, payment.id));
    expect(refunded).toMatchObject({
      status: "refunded",
      refundedMinor: payment.amountMinor,
    });
  });

  it("rejects a checkout event whose transfer does not match the ledger amount", async () => {
    const { payment, providerAccountId, providerCheckoutId } = await createPayment();
    const paymentIntentId = `pi_${randomUUID().replace(/-/g, "")}`;
    const stripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          id: paymentIntentId,
          amount_received: payment.amountMinor - 1,
          currency: "usd",
          transfer_data: { destination: providerAccountId },
        }),
      },
    } as unknown as Stripe;

    await expect(handleStripeOrganizationPaymentEvent(
      event("checkout.session.completed", `evt_${randomUUID()}`, {
        id: providerCheckoutId,
        metadata: { type: "organization_payment" },
        payment_status: "paid",
        amount_total: payment.amountMinor,
        currency: "usd",
        payment_intent: paymentIntentId,
      }),
      stripe,
    )).rejects.toThrow("failed amount, currency, or destination verification");

    const [unchanged] = await db
      .select()
      .from(orgPaymentsTable)
      .where(and(
        eq(orgPaymentsTable.id, payment.id),
        eq(orgPaymentsTable.orgId, payment.orgId),
      ));
    expect(unchanged).toMatchObject({ status: "pending", providerPaymentId: null });
  });
});
