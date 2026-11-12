import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import {
  db,
  orgPaymentWebhookEventsTable,
  orgPaymentsTable,
  type OrgPayment,
} from "@workspace/db";

export type OrganizationPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "partially_refunded"
  | "refunded"
  | "disputed"
  | "dispute_won"
  | "dispute_lost";

type PaymentState = Pick<OrgPayment, "status" | "refundedMinor" | "settledAt" | "amountMinor">;

export type OrganizationPaymentTransition =
  | { kind: "paid"; settledAt: Date }
  | { kind: "failed" }
  | { kind: "expired" }
  | { kind: "refunded"; amountRefundedMinor: number }
  | { kind: "dispute_open" }
  | { kind: "dispute_closed"; outcome: "won" | "lost" };

export function isVerifiedOrganizationTransfer(
  expected: { amountMinor: number; currency: string; accountId: string },
  actual: { amountReceived: number; currency: string; destinationAccountId: string | null },
): boolean {
  return (
    Number.isSafeInteger(expected.amountMinor) &&
    expected.amountMinor > 0 &&
    actual.amountReceived === expected.amountMinor &&
    actual.currency.toLowerCase() === expected.currency.toLowerCase() &&
    actual.destinationAccountId === expected.accountId
  );
}

export function transitionOrganizationPayment(
  current: PaymentState,
  transition: OrganizationPaymentTransition,
): Partial<Pick<OrgPayment, "status" | "refundedMinor" | "settledAt">> | null {
  const status = current.status as OrganizationPaymentStatus;
  switch (transition.kind) {
    case "paid":
      if (["pending", "failed", "expired"].includes(status)) {
        return { status: "paid", settledAt: current.settledAt ?? transition.settledAt };
      }
      return current.settledAt ? null : { settledAt: transition.settledAt };
    case "failed":
      return status === "pending" ? { status: "failed" } : null;
    case "expired":
      return status === "pending" ? { status: "expired" } : null;
    case "refunded": {
      if (!Number.isSafeInteger(transition.amountRefundedMinor) || transition.amountRefundedMinor < 0) {
        return null;
      }
      const refundedMinor = Math.min(current.amountMinor, transition.amountRefundedMinor);
      const nextStatus =
        status === "disputed" || status === "dispute_won" || status === "dispute_lost"
          ? status
          : refundedMinor >= current.amountMinor
            ? "refunded"
            : "partially_refunded";
      if (refundedMinor === current.refundedMinor && nextStatus === status) return null;
      return { refundedMinor, status: nextStatus };
    }
    case "dispute_open":
      return status === "disputed" ? null : { status: "disputed" };
    case "dispute_closed":
      return {
        status: transition.outcome === "won" ? "dispute_won" : "dispute_lost",
      };
  }
}

function paymentIntentId(value: string | Stripe.PaymentIntent | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function destinationId(value: string | Stripe.Account | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

async function findByPaymentIntent(id: string): Promise<OrgPayment | null> {
  const [payment] = await db
    .select()
    .from(orgPaymentsTable)
    .where(and(eq(orgPaymentsTable.provider, "stripe"), eq(orgPaymentsTable.providerPaymentId, id)))
    .limit(1);
  return payment ?? null;
}

async function applyStripeEvent(
  payment: OrgPayment,
  event: Stripe.Event,
  transition: OrganizationPaymentTransition | null,
  providerPaymentId?: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [insertedEvent] = await tx
      .insert(orgPaymentWebhookEventsTable)
      .values({
        provider: "stripe",
        providerEventId: event.id,
        providerEventType: event.type,
        paymentId: payment.id,
      })
      .onConflictDoNothing({
        target: [
          orgPaymentWebhookEventsTable.provider,
          orgPaymentWebhookEventsTable.providerEventId,
        ],
      })
      .returning({ id: orgPaymentWebhookEventsTable.id });

    if (!insertedEvent) return;

    const [current] = await tx
      .select()
      .from(orgPaymentsTable)
      .where(eq(orgPaymentsTable.id, payment.id))
      .for("update")
      .limit(1);
    if (!current) return;

    const patch = transition ? transitionOrganizationPayment(current, transition) : null;
    if (!patch && !providerPaymentId) return;

    await tx
      .update(orgPaymentsTable)
      .set({
        ...(patch ?? {}),
        ...(providerPaymentId ? { providerPaymentId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orgPaymentsTable.id, current.id));
  });
}

async function handleCheckoutSessionEvent(
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.type !== "organization_payment") return;

  const [payment] = await db
    .select()
    .from(orgPaymentsTable)
    .where(and(
      eq(orgPaymentsTable.provider, "stripe"),
      eq(orgPaymentsTable.providerCheckoutId, session.id),
    ))
    .limit(1);
  if (!payment) return;

  if (event.type === "checkout.session.expired") {
    await applyStripeEvent(payment, event, { kind: "expired" });
    return;
  }
  if (event.type === "checkout.session.async_payment_failed") {
    await applyStripeEvent(payment, event, { kind: "failed" });
    return;
  }

  const paymentIntentIdValue = paymentIntentId(session.payment_intent);
  if (
    session.payment_status !== "paid" ||
    session.amount_total !== payment.amountMinor ||
    session.currency?.toLowerCase() !== payment.currency.toLowerCase() ||
    !paymentIntentIdValue
  ) {
    // A completed checkout may still be waiting for a delayed payment method.
    // The async success event will settle it after Stripe confirms funds.
    if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
      await applyStripeEvent(payment, event, null);
      return;
    }
    throw new Error("Stripe organization checkout did not match its pending payment record");
  }

  const intent = await stripe.paymentIntents.retrieve(paymentIntentIdValue);
  const destinationAccountId = destinationId(intent.transfer_data?.destination);
  if (
    !isVerifiedOrganizationTransfer(
      {
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        accountId: payment.providerAccountId,
      },
      {
        amountReceived: intent.amount_received,
        currency: intent.currency,
        destinationAccountId,
      },
    )
  ) {
    throw new Error("Stripe organization payment failed amount, currency, or destination verification");
  }

  await applyStripeEvent(
    payment,
    event,
    { kind: "paid", settledAt: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000) },
    paymentIntentIdValue,
  );
}

async function paymentIntentForDispute(
  dispute: Stripe.Dispute,
  stripe: Stripe,
): Promise<string | null> {
  const direct = paymentIntentId(dispute.payment_intent);
  if (direct) return direct;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId);
  return paymentIntentId(charge.payment_intent);
}

export async function handleStripeOrganizationPaymentEvent(
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  if (event.type.startsWith("checkout.session.")) {
    await handleCheckoutSessionEvent(event, stripe);
    return;
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const intentId = paymentIntentId(charge.payment_intent);
    if (!intentId) return;
    const payment = await findByPaymentIntent(intentId);
    if (!payment) return;
    await applyStripeEvent(payment, event, {
      kind: "refunded",
      amountRefundedMinor: charge.amount_refunded,
    });
    return;
  }

  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const intentId = await paymentIntentForDispute(dispute, stripe);
    if (!intentId) return;
    const payment = await findByPaymentIntent(intentId);
    if (!payment) return;
    const outcomeType = dispute.status === "won" || dispute.status === "lost"
      ? dispute.status
      : null;
    const transition: OrganizationPaymentTransition =
      event.type === "charge.dispute.closed" && outcomeType
        ? { kind: "dispute_closed", outcome: outcomeType }
        : { kind: "dispute_open" };
    await applyStripeEvent(payment, event, transition);
  }
}
