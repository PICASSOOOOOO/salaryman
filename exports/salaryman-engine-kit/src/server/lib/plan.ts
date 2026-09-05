import { db, userTiersTable, userFeaturesTable, featureTrialsTable, type FeatureKey, FEATURE_KEYS, orgMembersTable, organizationsTable, pledgePurchasesTable } from "@workspace/db";
import { eq, and, gt, sql as sqlFn } from "drizzle-orm";

// PABLO PRIME and the PABLO PACKAGE ($149/mo `claw_bot` bundle) are sold
// to users as the same product but historically lived in two unrelated
// tables: `user_features.claw_bot` (unlocks the feature bundle including
// phone_system) and `pablo_tax_meter.prime_active` (grants the prepaid
// API budget). A user paying via the hosted Stripe Payment Link could end
// up with one without the other depending on which webhook code path
// fired. Treat them as equivalent at read time so anyone who is Prime in
// either ledger gets the full bundle. New grants/revokes also sync both
// columns going forward (see stripe.ts).
export type Tier = "free" | "pro";

// THE PABLO PACKAGE — single $149/mo bundle that unlocks every paid feature
// across the platform. The legacy `claw_bot` key remains the canonical
// subscription identifier so existing Stripe subs and trials keep working;
// granting it unlocks all other paid feature flags via the bundle rule in
// getUserFeatures() below. The other entries are kept for back-compat with
// any code still reading individual prices, but Pricing/Upgrade pages no
// longer sell them standalone.
export const FEATURE_CATALOG: Record<FeatureKey, { name: string; codename: string; price: number; desc: string }> = {
  live_listen: { name: "Live Listen",  codename: "ECHO-7", price: 0, desc: "Included with Automation Pixel Agents." },
  screen_scan: { name: "Screen Scan",  codename: "OPTIC-9", price: 0, desc: "Included with Automation Pixel Agents." },
  say_this:    { name: "Say This",     codename: "VOX-4", price: 0, desc: "Included with Automation Pixel Agents." },
  phone_system:{
    name: "Phone System",
    codename: "CALLLHOME",
    price: 95,
    desc: "Paid Twilio-connected calling and two-way SMS with a default platform toll-free number. Custom numbers are $10 one-time each. Billed only in USD.",
  },
  claw_bot: {
    name: "Automation Pixel Agents",
    codename: "PIXEL AGENT AUTOMATION",
    price: 149,
    desc: "A curated automation workforce organized across four teams. Billed only in USD. Phone service is separate.",
  },
};

// Automation tools belong to the Pixel Agent subscription. Twilio is a
// separate cost-bearing service and must never be unlocked by this bundle.
const BUNDLED_BY_PABLO: FeatureKey[] = ["live_listen", "screen_scan", "say_this"];
const USD_PAID_FEATURES = new Set<FeatureKey>(["phone_system", "claw_bot"]);

export function isUsdPaidFeature(feature: FeatureKey): boolean {
  return USD_PAID_FEATURES.has(feature);
}

// Picasso TESTERS — internal team mailboxes that get every paid feature
// for free (phone system, claw_bot bundle, live_listen, screen_scan,
// say_this) and are auto-stitched into the Picasso org as active owners
// by seed-picasso.ts. This list is the canonical "give them everything,
// they're on the team" switch — add a mailbox here and on next sign-in
// they have the full platform unlocked. The OWNER_EMAILS env var is
// merged in on top so we can also flip individual addresses without a
// deploy.
//
// Naming: kept as HARDCODED_OWNER_EMAILS for back-compat with the rest
// of the codebase (isOwnerEmail, getPicassoAdminUserIds, etc); the
// concept is "tester / Picasso staff", not literal org-ownership.
//
// Emails on PICASSO_ORG_MEMBER_EMAILS get auto-stitched as active `owner`
// members of the PICASSO org by seedPicassoOrg() on every boot. That list
// is a strict subset of HARDCODED_OWNER_EMAILS — testers (kozzy2k11,
// pamwarrenhealth) get the owner-bypass + alpha-tester perks but are NOT
// added to the Picasso org.
const PICASSO_ORG_MEMBER_EMAILS: string[] = [
  // Pam — InnerLight HEALTH (not GROUP). Confirmed by the user.
  "pamw.innerlighthealth@gmail.com",
];

const HARDCODED_OWNER_EMAILS: string[] = [
  ...PICASSO_ORG_MEMBER_EMAILS,
  // Picasso testers — full platform free, auto-approved as alpha testers
  // by ensureOwnersAreApprovedAlphaTesters() at boot. NOT auto-added to
  // the PICASSO org.
  "alejandroduong@gmail.com",
  "chiphanlien@gmail.com",
  "kozzy2k11@gmail.com",
  "pamwarrenhealth@gmail.com",
  // Kissy — tester perks (owner bypass + alpha) but removed from PICASSO
  // org auto-membership.
  "dcmthree86@gmail.com",
];

export function ownerEmails(): string[] {
  const raw = process.env.OWNER_EMAILS ?? "";
  const fromEnv = raw.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...fromEnv, ...HARDCODED_OWNER_EMAILS.map(e => e.toLowerCase())])];
}

export function picassoOrgMemberEmails(): string[] {
  return PICASSO_ORG_MEMBER_EMAILS.map(e => e.toLowerCase());
}

export function isPicassoOrgMemberEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return picassoOrgMemberEmails().includes(email.toLowerCase());
}

// Picasso-org members start onboarding with a near-bottomless spendable ƒ
// balance (NOT quarantined like ordinary tutorial money) so internal staff
// can exercise every paid surface without burning real cash. Gated strictly
// on the server-side email allow-list (isPicassoOrgMemberEmail), never a
// client flag. Normal players are unaffected.
export const PICASSO_START_FIAT = 999_999_999;

export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}

export async function getPicassoAdminUserIds(): Promise<string[]> {
  const { usersTable } = await import("@workspace/db");
  const rows = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
  const byEmail = rows.filter(r => isOwnerEmail(r.email)).map(r => r.id);
  // Also include any user who is an active owner-role member of the PICASSO
  // developer org specifically, even if their email isn't on the hardcoded list.
  const orgOwnerRows = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, and(
      eq(orgMembersTable.orgId, organizationsTable.id),
      eq(organizationsTable.isDeveloper, true),
      sqlFn`lower(${organizationsTable.name}) = 'picasso'`
    ))
    .where(and(
      eq(orgMembersTable.status, "active"),
      eq(orgMembersTable.role, "owner")
    ));
  const byOrg = orgOwnerRows.map(r => r.userId);
  return [...new Set([...byEmail, ...byOrg])];
}

// Returns true when the user is an active `owner`-role member of the PICASSO
// developer org specifically. This is stricter than isActiveDeveloperOrgMember
// (which matches any role/status and any developer org).
export async function isPicassoOrgOwner(userId: string): Promise<boolean> {
  const rows = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, and(
      eq(orgMembersTable.orgId, organizationsTable.id),
      eq(organizationsTable.isDeveloper, true),
      sqlFn`lower(${organizationsTable.name}) = 'picasso'`
    ))
    .where(and(
      eq(orgMembersTable.userId, userId),
      eq(orgMembersTable.status, "active"),
      eq(orgMembersTable.role, "owner")
    ));
  return rows.length > 0;
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

// Active member (any role) of the Picasso developer org specifically.
// Stricter than isActiveDeveloperOrgMember (which matches any developer org).
export async function isPicassoOrgMember(userId: string): Promise<boolean> {
  const rows = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, and(
      eq(orgMembersTable.orgId, organizationsTable.id),
      eq(organizationsTable.isDeveloper, true),
      sqlFn`lower(${organizationsTable.name}) = 'picasso'`
    ))
    .where(and(
      eq(orgMembersTable.userId, userId),
      eq(orgMembersTable.status, "active")
    ));
  return rows.length > 0;
}

const LEGACY_ALIASES: Record<string, FeatureKey> = {
  bot_factory: "claw_bot",
};

// PLEDGE STORE → TERMINAL FEATURE UNLOCKS.
// The Pledge Store sells a small set of one-time "passes" (catalog lives in
// routes/pledge.ts) that permanently unlock paid terminal features. The
// pledge_purchases ledger is the SINGLE SOURCE OF TRUTH for ownership: the
// in-world game reads owned pledges directly, and the terminal derives the
// mapped feature flags below from the very same rows. One purchase, one
// ledger, identical ownership in both places. Keyed by Pledge Store itemId.
export const PLEDGE_FEATURE_UNLOCKS: Record<string, FeatureKey[]> = {
  term_pablo_pass: ["live_listen", "screen_scan", "say_this"],
};

// Returns the terminal features unlocked by a user's completed pledge
// purchases (one indexed lookup on pledge_purchases by userId).
async function getPledgeUnlockedFeatures(userId: string): Promise<FeatureKey[]> {
  if (Object.keys(PLEDGE_FEATURE_UNLOCKS).length === 0) return [];
  const rows = await db
    .select({ itemId: pledgePurchasesTable.itemId })
    .from(pledgePurchasesTable)
    .where(and(eq(pledgePurchasesTable.userId, userId), eq(pledgePurchasesTable.status, "completed")));
  const out: FeatureKey[] = [];
  for (const r of rows) {
    const mapped = PLEDGE_FEATURE_UNLOCKS[r.itemId];
    if (mapped) out.push(...mapped);
  }
  return out;
}

export async function getUserFeatures(userId: string, email?: string | null): Promise<Set<FeatureKey>> {
  if (isOwnerEmail(email)) return new Set(FEATURE_KEYS);
  if (await isActiveDeveloperOrgMember(userId)) return new Set(FEATURE_KEYS);
  const rows = await db.select().from(userFeaturesTable).where(eq(userFeaturesTable.userId, userId));
  const features = new Set<FeatureKey>();
  for (const r of rows) {
    const key = r.featureKey as string;
    if (FEATURE_KEYS.includes(key as FeatureKey)) {
      const feature = key as FeatureKey;
      if (!isUsdPaidFeature(feature) || !!r.stripeSubscriptionId) features.add(feature);
    }
    const alias = LEGACY_ALIASES[key];
    if (alias && (!isUsdPaidFeature(alias) || !!r.stripeSubscriptionId)) features.add(alias);
  }
  // Pledge Store passes — owning a terminal-pass pledge (pledge_purchases,
  // the same ledger the in-world game reads) unlocks its mapped features here.
  for (const f of await getPledgeUnlockedFeatures(userId)) features.add(f);
  // PABLO is one bundle — owning claw_bot unlocks every other paid feature.
  if (features.has("claw_bot")) {
    for (const k of BUNDLED_BY_PABLO) features.add(k);
  }
  return features;
}

export function resolveFeatureKey(raw: string): FeatureKey | undefined {
  if (FEATURE_KEYS.includes(raw as FeatureKey)) return raw as FeatureKey;
  const alias = LEGACY_ALIASES[raw];
  return alias;
}

export async function hasActiveTrial(userId: string, email: string | undefined | null, feature: FeatureKey): Promise<boolean> {
  const now = new Date();
  const keysToCheck: string[] = [feature];
  for (const [legacy, mapped] of Object.entries(LEGACY_ALIASES)) {
    if (mapped === feature) keysToCheck.push(legacy);
  }
  for (const key of keysToCheck) {
    if (email) {
      const [row] = await db
        .select()
        .from(featureTrialsTable)
        .where(
          and(
            eq(featureTrialsTable.email, email.toLowerCase()),
            eq(featureTrialsTable.featureKey, key),
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
          eq(featureTrialsTable.featureKey, key),
          gt(featureTrialsTable.trialExpiresAt, now)
        )
      );
    if (row) return true;
  }
  return false;
}

export async function hasFeature(userId: string, email: string | undefined | null, feature: FeatureKey): Promise<boolean> {
  if (isOwnerEmail(email)) return true;
  if (await isActiveDeveloperOrgMember(userId)) return true;
  const keysToCheck = [feature as string];
  const reverseAliases = Object.entries(LEGACY_ALIASES);
  for (const [legacy, mapped] of reverseAliases) {
    if (mapped === feature) keysToCheck.push(legacy);
  }
  for (const key of keysToCheck) {
    const [row] = await db
      .select()
      .from(userFeaturesTable)
      .where(and(eq(userFeaturesTable.userId, userId), eq(userFeaturesTable.featureKey, key)));
    if (row) {
      const resolved = resolveFeatureKey(key);
      if (!resolved || !isUsdPaidFeature(resolved) || !!row.stripeSubscriptionId) return true;
    }
  }
  // A paid automation subscription unlocks its included automation tools, but
  // never the separately billed Twilio phone system.
  if (BUNDLED_BY_PABLO.includes(feature)) {
    const [automation] = await db
      .select({ stripeSubscriptionId: userFeaturesTable.stripeSubscriptionId })
      .from(userFeaturesTable)
      .where(and(eq(userFeaturesTable.userId, userId), eq(userFeaturesTable.featureKey, "claw_bot")));
    if (automation?.stripeSubscriptionId) return true;
  }
  // Pledge Store passes unlock terminal features from the pledge_purchases
  // ledger — the same source of truth the in-world game reads.
  if ((await getPledgeUnlockedFeatures(userId)).includes(feature)) return true;
  // Cost-bearing products cannot be activated by a trial or an in-game grant.
  if (isUsdPaidFeature(feature)) return false;
  return hasActiveTrial(userId, email, feature);
}

// Lazy import to avoid the plan.ts ↔ pablo-tax.ts circular dependency
// (pablo-tax.ts pulls db schema, plan.ts is imported by routes that also
// import pablo-tax.ts). Imported on demand inside grant/revoke only when
// we're touching the claw_bot grant.
async function syncPrimeMeter(userId: string, active: boolean): Promise<void> {
  try {
    const { setPrimeActive } = await import("./pablo-tax");
    await setPrimeActive(userId, active);
  } catch (e) {
    // Never let meter-sync failures block the feature grant — the next
    // read path will still treat the user as Prime via the claw_bot row.
    console.warn("[Plan] Prime-meter sync failed:", e instanceof Error ? e.message : "Unknown");
  }
}

export async function grantFeature(userId: string, feature: FeatureKey, grantedBy: string, stripeSubscriptionId?: string): Promise<void> {
  await db
    .insert(userFeaturesTable)
    .values({ userId, featureKey: feature, grantedBy, stripeSubscriptionId: stripeSubscriptionId ?? null })
    .onConflictDoUpdate({
      target: [userFeaturesTable.userId, userFeaturesTable.featureKey],
      set: { grantedBy, stripeSubscriptionId: stripeSubscriptionId ?? null },
    });
  // Keep the Pablo Tax meter's Prime flag in lockstep with the bundle
  // grant so the prepaid-budget perk and the feature unlocks can never
  // disagree (this is the bug that hid the phone system from paying
  // Prime users).
  if (feature === "claw_bot") {
    await syncPrimeMeter(userId, true);
  }
}

export async function revokeFeature(userId: string, feature: FeatureKey): Promise<void> {
  await db
    .delete(userFeaturesTable)
    .where(and(eq(userFeaturesTable.userId, userId), eq(userFeaturesTable.featureKey, feature)));
  if (feature === "claw_bot") {
    await syncPrimeMeter(userId, false);
  }
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
  if (row.featureKey === "claw_bot") {
    await syncPrimeMeter(row.userId, false);
  }
  return row.userId;
}

export async function getUserTier(userId: string, email?: string | null): Promise<Tier> {
  if (isOwnerEmail(email)) return "pro";
  const rows = await db.select().from(userTiersTable).where(eq(userTiersTable.userId, userId));
  if (rows.length > 0) return rows[0].tier as Tier;
  return "free";
}

export async function setUserTier(userId: string, tier: Tier, grantedBy: string): Promise<void> {
  await db
    .insert(userTiersTable)
    .values({ userId, tier, grantedBy })
    .onConflictDoUpdate({ target: userTiersTable.userId, set: { tier, grantedBy } });
}

export const FREE_FEATURES = [
  "PABLO Chat — unlimited conversations",
  "Presentation builder",
  "Contacts & CRM",
  "Workspace — projects, notes, brand settings",
  "Content studio, calendar, documents, invoices",
  "CIPHER-X — code understanding, problem solving, interview prep",
  "Hints, approach explanations, complexity analysis",
  "Basic profile",
];
