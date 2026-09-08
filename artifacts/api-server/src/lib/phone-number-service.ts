import twilio from "twilio";
import { createHash } from "crypto";
import { and, eq, or } from "drizzle-orm";
import { db, phoneNumbersTable, phoneNumberPurchasesTable } from "@workspace/db";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
  return twilio(accountSid, authToken);
}

export function getPhoneNumberCheckoutMarker(stripeSessionId: string): string {
  const digest = createHash("sha256").update(stripeSessionId).digest("hex").slice(0, 24);
  return `SALARYMAN-CHECKOUT-${digest}`;
}

export async function getUserOutboundNumber(userId: string): Promise<string> {
  const [active] = await db
    .select({ number: phoneNumbersTable.number })
    .from(phoneNumbersTable)
    .where(and(eq(phoneNumbersTable.userId, userId), eq(phoneNumbersTable.isActive, true)))
    .limit(1);
  const fallback = process.env.TWILIO_PHONE_NUMBER;
  if (!active?.number && !fallback) throw new Error("TWILIO_PHONE_NUMBER not configured");
  return active?.number || fallback!;
}

/**
 * Resolve a CRM-selected sender. Org pool numbers may be used by any active
 * org member; personal numbers remain restricted to their owner.
 */
export async function getOutboundNumberForRouting(input: {
  userId: string;
  orgId?: number | null;
  phoneNumberId?: number | null;
}): Promise<string> {
  if (!input.phoneNumberId) return getUserOutboundNumber(input.userId);
  const conditions = [
    eq(phoneNumbersTable.id, input.phoneNumberId),
    eq(phoneNumbersTable.isActive, true),
    input.orgId
      ? or(eq(phoneNumbersTable.userId, input.userId), eq(phoneNumbersTable.orgId, input.orgId))
      : eq(phoneNumbersTable.userId, input.userId),
  ];
  const [selected] = await db
    .select({ number: phoneNumbersTable.number })
    .from(phoneNumbersTable)
    .where(and(...conditions))
    .limit(1);
  if (!selected?.number) throw new Error("Selected phone number is not available to this organization");
  return selected.number;
}

export async function assertPhoneNumberAvailable(phoneNumber: string, countryCode: string): Promise<void> {
  if (phoneNumber === process.env.TWILIO_PHONE_NUMBER) throw new Error("The platform default number cannot be purchased");
  const [assigned] = await db.select({ id: phoneNumbersTable.id })
    .from(phoneNumbersTable).where(eq(phoneNumbersTable.number, phoneNumber)).limit(1);
  if (assigned) throw new Error("That number is already assigned");
  const client = getTwilioClient();
  const owned = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (owned.length > 0) throw new Error("That number already belongs to the platform account");
  const available = await client.availablePhoneNumbers(countryCode).local.list({ contains: phoneNumber, limit: 10 });
  if (!available.some((candidate) => candidate.phoneNumber === phoneNumber)) {
    throw new Error("That number is no longer available");
  }
}

export async function provisionPaidPhoneNumber(input: {
  userId: string;
  phoneNumber: string;
  countryCode: string;
  label: string;
  stripeSessionId: string;
}): Promise<{ sid: string; phoneNumber: string }> {
  const client = getTwilioClient();
  if (input.phoneNumber === process.env.TWILIO_PHONE_NUMBER) {
    throw new Error("The platform default number cannot be purchased");
  }
  const [alreadyAssigned] = await db
    .select()
    .from(phoneNumbersTable)
    .where(eq(phoneNumbersTable.number, input.phoneNumber))
    .limit(1);
  if (alreadyAssigned) {
    if (alreadyAssigned.userId !== input.userId) throw new Error("Number is already assigned");
    return { sid: alreadyAssigned.twilioSid || "", phoneNumber: alreadyAssigned.number };
  }

  const [purchase] = await db.select().from(phoneNumberPurchasesTable)
    .where(and(
      eq(phoneNumberPurchasesTable.stripeSessionId, input.stripeSessionId),
      eq(phoneNumberPurchasesTable.userId, input.userId),
      eq(phoneNumberPurchasesTable.phoneNumber, input.phoneNumber),
    )).limit(1);
  if (!purchase) throw new Error("Purchase reservation missing");
  const checkoutMarker = getPhoneNumberCheckoutMarker(input.stripeSessionId);

  let purchased: { sid: string; phoneNumber: string; friendlyName?: string | null };
  if (purchase.twilioSid) {
    const recovered = await client.incomingPhoneNumbers(purchase.twilioSid).fetch();
    if (recovered.phoneNumber !== input.phoneNumber) throw new Error("Purchased number ownership mismatch");
    purchased = recovered;
  } else {
    const owned = await client.incomingPhoneNumbers.list({ phoneNumber: input.phoneNumber, limit: 1 });
    const checkoutOwned = owned.find((number) => number.friendlyName === checkoutMarker);
    if (checkoutOwned) {
      purchased = checkoutOwned;
    } else {
      if (owned.length > 0) throw new Error("That number already belongs to the platform account");
      const available = await client.availablePhoneNumbers(input.countryCode).local.list({
        contains: input.phoneNumber,
        limit: 10,
      });
      if (!available.some((candidate) => candidate.phoneNumber === input.phoneNumber)) {
        throw new Error("That number is no longer available. Your payment will not be fulfilled automatically; contact support for a refund.");
      }
      const baseUrl = process.env.APP_BASE_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
      purchased = await client.incomingPhoneNumbers.create({
        phoneNumber: input.phoneNumber,
        voiceUrl: `${baseUrl}/api/twilio/webhook/voice?userId=${encodeURIComponent(input.userId)}`,
        voiceMethod: "POST",
        smsUrl: `${baseUrl}/api/twilio/webhook/sms?userId=${encodeURIComponent(input.userId)}`,
        smsMethod: "POST",
        statusCallback: `${baseUrl}/api/twilio/webhook/status?userId=${encodeURIComponent(input.userId)}`,
        statusCallbackMethod: "POST",
        friendlyName: checkoutMarker,
        ...(process.env.TWILIO_REGULATORY_BUNDLE_SID
          ? { bundleSid: process.env.TWILIO_REGULATORY_BUNDLE_SID }
          : {}),
      });
    }
    await db.update(phoneNumberPurchasesTable)
      .set({ twilioSid: purchased.sid })
      .where(eq(phoneNumberPurchasesTable.stripeSessionId, input.stripeSessionId));
  }

  const hasActive = await db
    .select({ id: phoneNumbersTable.id })
    .from(phoneNumbersTable)
    .where(and(eq(phoneNumbersTable.userId, input.userId), eq(phoneNumbersTable.isActive, true)))
    .limit(1);
  await db.insert(phoneNumbersTable).values({
    userId: input.userId,
    number: purchased.phoneNumber,
    twilioSid: purchased.sid,
    friendlyName: purchased.friendlyName || purchased.phoneNumber,
    label: input.label,
    countryCode: input.countryCode,
    isActive: hasActive.length === 0,
  });
  return { sid: purchased.sid, phoneNumber: purchased.phoneNumber };
}