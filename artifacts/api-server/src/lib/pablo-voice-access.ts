import {
  alphaApplicationsTable,
  db,
  phoneNumberPurchasesTable,
  phoneNumbersTable,
  userFeaturesTable,
} from "@workspace/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

const PAID_VOICE_FEATURES = ["claw_bot", "phone_system"] as const;

export type PabloVoiceAccessFacts = {
  paidFeatureGrants: Array<{
    featureKey: string;
    stripeSubscriptionId: string | null;
  }>;
  activePaidPhoneNumber: boolean;
  approvedTester: boolean;
};

export function allowsPabloVoiceFromFacts(facts: PabloVoiceAccessFacts): boolean {
  const hasPaidSubscription = facts.paidFeatureGrants.some(
    ({ featureKey, stripeSubscriptionId }) =>
      PAID_VOICE_FEATURES.includes(featureKey as (typeof PAID_VOICE_FEATURES)[number]) &&
      typeof stripeSubscriptionId === "string" &&
      stripeSubscriptionId.trim().length > 0,
  );

  return hasPaidSubscription || facts.activePaidPhoneNumber || facts.approvedTester;
}

/**
 * This is intentionally stricter than hasFeature()/requireFeature(): those
 * gates include owner/developer and Pledge Store paths that do not prove a
 * paid voice product is active.
 */
export async function hasPabloVoiceAccess(userId: string): Promise<boolean> {
  const [paidFeatureGrants, activePaidNumbers, approvedTesters] = await Promise.all([
    db
      .select({
        featureKey: userFeaturesTable.featureKey,
        stripeSubscriptionId: userFeaturesTable.stripeSubscriptionId,
      })
      .from(userFeaturesTable)
      .where(and(
        eq(userFeaturesTable.userId, userId),
        inArray(userFeaturesTable.featureKey, [...PAID_VOICE_FEATURES]),
        isNotNull(userFeaturesTable.stripeSubscriptionId),
      ))
      .limit(2),
    db
      .select({ id: phoneNumberPurchasesTable.id })
      .from(phoneNumberPurchasesTable)
      .innerJoin(
        phoneNumbersTable,
        and(
          eq(phoneNumbersTable.userId, phoneNumberPurchasesTable.userId),
          eq(phoneNumbersTable.number, phoneNumberPurchasesTable.phoneNumber),
          eq(phoneNumbersTable.twilioSid, phoneNumberPurchasesTable.twilioSid),
          eq(phoneNumbersTable.isActive, true),
        ),
      )
      .where(and(
        eq(phoneNumberPurchasesTable.userId, userId),
        eq(phoneNumberPurchasesTable.status, "completed"),
        isNotNull(phoneNumberPurchasesTable.twilioSid),
      ))
      .limit(1),
    db
      .select({ id: alphaApplicationsTable.id })
      .from(alphaApplicationsTable)
      .where(and(
        eq(alphaApplicationsTable.userId, userId),
        eq(alphaApplicationsTable.role, "alpha_tester"),
        eq(alphaApplicationsTable.status, "approved"),
      ))
      .limit(1),
  ]);

  return allowsPabloVoiceFromFacts({
    paidFeatureGrants,
    activePaidPhoneNumber: activePaidNumbers.length > 0,
    approvedTester: approvedTesters.length > 0,
  });
}