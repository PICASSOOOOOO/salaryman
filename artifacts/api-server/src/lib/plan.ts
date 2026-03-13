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
  "Live Listen",
  "Scan Screen",
  "Presenter Mode",
  "Contacts & CRM",
  "Workspace (Projects, Knowledge Base, Creative Kit)",
];

export const FREE_FEATURES = [
  "PABLO AI Chat",
  "Basic profile",
];
