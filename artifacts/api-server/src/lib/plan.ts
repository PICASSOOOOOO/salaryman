import { db, userTiersTable, userFeaturesTable, featureTrialsTable, type FeatureKey, FEATURE_KEYS, orgMembersTable, organizationsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export type Tier = "free" | "pro";

export const FEATURE_CATALOG: Record<FeatureKey, { name: string; codename: string; price: number; desc: string }> = {
  live_listen: {
    name: "Live Listen",
    codename: "ECHO-7 NERVE TAP",
    price: 5,
    desc: "Real-time audio intercept by Picassoo.AI — hear what's happening live",
  },
  screen_scan: {
    name: "Screen Scan",
    codename: "OPTIC-9 RETINAL SCANNER",
    price: 5,
    desc: "Auto-identifies code and content on screen — a Picassoo.AI product",
  },
  say_this: {
    name: "Say This",
    codename: "VOX-4 LARYNX MODULE",
    price: 5,
    desc: "Real-time speech coaching by Picassoo.AI — 3 bullet points to read aloud",
  },
  phone_system: {
    name: "Calll Home",
    codename: "CALLLHOME",
    price: 95,
    desc: "Unlimited predictive dialing & text messaging by Picassoo.AI for business and marketing partners",
  },
  bot_factory: {
    name: "Bot Factory",
    codename: "CLAW FACTORY MK-II",
    price: 149,
    desc: "Deploy autonomous AI agents across 6 platforms — Telegram, WhatsApp, Discord, Facebook Messenger, Gmail & LinkedIn. Recruitment bots, sales agents, support bots & more. Unlimited bots, unlimited conversations.",
  },
  claw_bot: {
    name: "Claw Bot",
    codename: "OPENCLAW MULTI-AGENT SUITE",
    price: 145,
    desc: "AI multi-agent platform — sales, support, content creation, recruiting, LinkedIn prospecting, Facebook scouting, and automated trading. All OpenClaw-powered capabilities in one subscription.",
  },
};

function ownerEmails(): string[] {
  const raw = process.env.OWNER_EMAILS ?? "";
  return raw.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}

export async function isActiveDeveloperOrgMember(userId: string): Promise<boolean> {
  const rows = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, and(
      eq(orgMembersTable.orgId, organizationsTable.id),
      eq(organizationsTable.isDeveloper, true)
    ))
    .where(and(
      eq(orgMembersTable.userId, userId),
      eq(orgMembersTable.status, "active")
    ));
  return rows.length > 0;
}

export async function getUserFeatures(userId: string, email?: string | null): Promise<Set<FeatureKey>> {
  if (isOwnerEmail(email)) return new Set(FEATURE_KEYS);
  if (await isActiveDeveloperOrgMember(userId)) return new Set(FEATURE_KEYS);
  const rows = await db.select().from(userFeaturesTable).where(eq(userFeaturesTable.userId, userId));
  return new Set(rows.map(r => r.featureKey as FeatureKey));
}

export async function hasActiveTrial(userId: string, email: string | undefined | null, feature: FeatureKey): Promise<boolean> {
  const now = new Date();
  if (email) {
    const [row] = await db
      .select()
      .from(featureTrialsTable)
      .where(
        and(
          eq(featureTrialsTable.email, email.toLowerCase()),
          eq(featureTrialsTable.featureKey, feature),
          gt(featureTrialsTable.trialExpiresAt, now)
        )
      );
    if (row) return true;
  }
  const [row] = await db
    .select()
    .from(featureTrialsTable)
    .where(
      and(
        eq(featureTrialsTable.userId, userId),
        eq(featureTrialsTable.featureKey, feature),
        gt(featureTrialsTable.trialExpiresAt, now)
      )
    );
  return !!row;
}

export async function hasFeature(userId: string, email: string | undefined | null, feature: FeatureKey): Promise<boolean> {
  if (isOwnerEmail(email)) return true;
  if (await isActiveDeveloperOrgMember(userId)) return true;
  const [row] = await db
    .select()
    .from(userFeaturesTable)
    .where(and(eq(userFeaturesTable.userId, userId), eq(userFeaturesTable.featureKey, feature)));
  if (row) return true;
  return hasActiveTrial(userId, email, feature);
}

export async function grantFeature(userId: string, feature: FeatureKey, grantedBy: string, stripeSubscriptionId?: string): Promise<void> {
  await db
    .insert(userFeaturesTable)
    .values({ userId, featureKey: feature, grantedBy, stripeSubscriptionId: stripeSubscriptionId ?? null })
    .onConflictDoUpdate({
      target: [userFeaturesTable.userId, userFeaturesTable.featureKey],
      set: { grantedBy, stripeSubscriptionId: stripeSubscriptionId ?? null },
    });
}

export async function revokeFeature(userId: string, feature: FeatureKey): Promise<void> {
  await db
    .delete(userFeaturesTable)
    .where(and(eq(userFeaturesTable.userId, userId), eq(userFeaturesTable.featureKey, feature)));
}

export async function revokeFeatureBySubscription(stripeSubscriptionId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userFeaturesTable)
    .where(eq(userFeaturesTable.stripeSubscriptionId, stripeSubscriptionId));
  if (!row) return null;
  await db
    .delete(userFeaturesTable)
    .where(and(eq(userFeaturesTable.userId, row.userId), eq(userFeaturesTable.featureKey, row.featureKey)));
  return row.userId;
}

export async function getUserTier(userId: string, email?: string | null): Promise<Tier> {
  if (isOwnerEmail(email)) return "pro";
  const rows = await db.select().from(userTiersTable).where(eq(userTiersTable.userId, userId));
  if (rows.length > 0) return rows[0].tier as Tier;
  return "pro";
}

export async function setUserTier(userId: string, tier: Tier, grantedBy: string): Promise<void> {
  await db
    .insert(userTiersTable)
    .values({ userId, tier, grantedBy })
    .onConflictDoUpdate({ target: userTiersTable.userId, set: { tier, grantedBy } });
}

export const FREE_FEATURES = [
  "PABLO AI Chat — unlimited conversations",
  "Presentation builder",
  "Contacts & CRM",
  "Workspace — projects, notes, brand settings",
  "Content studio, calendar, documents, invoices",
  "CIPHER-X — code understanding, problem solving, interview prep",
  "Hints, approach explanations, complexity analysis",
  "Basic profile",
];
