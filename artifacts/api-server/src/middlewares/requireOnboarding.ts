import type { NextFunction, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, worldBusinessesTable } from "@workspace/db";

type OnboardingMeta = {
  source?: unknown;
  contactPhone?: unknown;
};

function hasValidEmail(value: unknown): boolean {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function hasValidPhone(value: unknown): boolean {
  return typeof value === "string" && value.replace(/\D/g, "").length >= 7;
}

export function isCompletedOnboardingRow(row: {
  businessType?: string | null;
  contactEmail?: string | null;
  meta?: unknown;
} | null | undefined): boolean {
  if (!row || !hasValidEmail(row.contactEmail)) return false;
  const meta = row.meta && typeof row.meta === "object"
    ? row.meta as OnboardingMeta
    : {};
  // Browser onboarding records carry the contact phone in meta so this
  // requirement does not require a schema migration for legacy game rows.
  return meta.source === "browser_onboarding" && hasValidPhone(meta.contactPhone);
}

export async function getCompletedOnboarding(userId: string) {
  const [row] = await db
    .select({
      id: worldBusinessesTable.id,
      businessType: worldBusinessesTable.businessType,
      contactEmail: worldBusinessesTable.contactEmail,
      meta: worldBusinessesTable.meta,
    })
    .from(worldBusinessesTable)
    .where(eq(worldBusinessesTable.userId, userId))
    .orderBy(desc(worldBusinessesTable.createdAt))
    .limit(1);
  return isCompletedOnboardingRow(row) ? row : null;
}

export async function requireOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const onboarding = await getCompletedOnboarding(String(req.user.id));
  if (!onboarding) {
    res.status(403).json({
      error: "Complete onboarding details before saving data or using this feature",
      onboardingRequired: true,
      onboarding: "/onboarding",
    });
    return;
  }
  next();
}

const ONBOARDING_MUTATION_EXEMPTIONS = new Set([
  "/world/register",
  "/world/employment/unemployment",
  "/chat/pablo/message",
  "/chat/pablo/command",
]);

export function isOnboardingMutationExempt(method: string, path: string): boolean {
  return method === "POST" && ONBOARDING_MUTATION_EXEMPTIONS.has(path);
}

/**
 * Authenticated mutations are data-management operations by default. Keep
 * onboarding registration itself open, while allowing read-only public/job
 * discovery routes before onboarding.
 */
export async function requireOnboardingForMutation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  if (!req.isAuthenticated?.() || isOnboardingMutationExempt(req.method, req.path)) {
    next();
    return;
  }
  await requireOnboarding(req, res, next);
}