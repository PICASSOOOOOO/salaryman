import { db, userTiersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type Tier = "free" | "pro";

function ownerEmails(): string[] {
  const raw = process.env.OWNER_EMAILS ?? "";
  return raw.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}

export async function getUserTier(userId: string, email?: string | null): Promise<Tier> {
  if (isOwnerEmail(email)) return "pro";
  const [row] = await db.select().from(userTiersTable).where(eq(userTiersTable.userId, userId));
  return (row?.tier as Tier) ?? "free";
}

export async function setUserTier(userId: string, tier: Tier, grantedBy: string): Promise<void> {
  await db
    .insert(userTiersTable)
    .values({ userId, tier, grantedBy })
    .onConflictDoUpdate({ target: userTiersTable.userId, set: { tier, grantedBy } });
}

export const PRO_FEATURES = [
  "ECHO-7 NERVE TAP — Real-time cochlear intercept",
  "OPTIC-9 RETINAL SCANNER — Military-grade screen capture",
  "HOLO-PROJ MK.II — Corporate briefing projector",
  "RECALL-6 FACIAL REGISTRY — Identity database implant",
  "COMMAND DECK v4.0 — Mobile command station",
];

export const FREE_FEATURES = [
  "PABLO AI Chat",
  "Basic profile",
];
