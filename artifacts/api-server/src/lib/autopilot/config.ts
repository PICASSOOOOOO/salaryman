import {
  db,
  autopilotConfigsTable,
  AUTOPILOT_DOMAINS,
  type AutopilotConfig,
  type AutopilotDomain,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// CRUD service for per-org, per-domain autopilot configuration. A MISSING row
// means "disabled" — a fresh org needs zero setup and OFF == manual-only.

/** The default-shaped config for a domain with no stored row. */
export function defaultConfigShape(orgId: number, domain: AutopilotDomain): Pick<
  AutopilotConfig,
  "orgId" | "domain" | "enabled" | "botId" | "cadenceMinutes" | "maxActionsPerTick" | "budgetCapCents" | "prefs" | "lastRunAt"
> {
  return {
    orgId,
    domain,
    enabled: false,
    botId: null,
    cadenceMinutes: null,
    maxActionsPerTick: null,
    budgetCapCents: null,
    prefs: {},
    lastRunAt: null,
  };
}

/** All stored configs for an org. */
export async function getOrgConfigs(orgId: number): Promise<AutopilotConfig[]> {
  return db.select().from(autopilotConfigsTable).where(eq(autopilotConfigsTable.orgId, orgId));
}

/** One domain's config, or null if no row exists. */
export async function getDomainConfig(orgId: number, domain: AutopilotDomain): Promise<AutopilotConfig | null> {
  const [row] = await db
    .select()
    .from(autopilotConfigsTable)
    .where(and(eq(autopilotConfigsTable.orgId, orgId), eq(autopilotConfigsTable.domain, domain)));
  return row ?? null;
}

/**
 * Merge stored rows over the default shape so the UI always gets every
 * supported domain, whether or not a row exists yet.
 */
export async function getOrgAutopilotView(orgId: number): Promise<
  (ReturnType<typeof defaultConfigShape> & { exists: boolean; updatedBy: string | null })[]
> {
  const rows = await getOrgConfigs(orgId);
  const byDomain = new Map(rows.map((r) => [r.domain, r]));
  return AUTOPILOT_DOMAINS.map((domain) => {
    const row = byDomain.get(domain);
    if (!row) return { ...defaultConfigShape(orgId, domain), exists: false, updatedBy: null };
    return {
      orgId: row.orgId,
      domain: domain,
      enabled: row.enabled,
      // Keep the legacy field in the response shape, but never expose an old
      // Pixel Agent assignment as the runner for Pablo's automation.
      botId: null,
      cadenceMinutes: row.cadenceMinutes,
      maxActionsPerTick: row.maxActionsPerTick,
      budgetCapCents: row.budgetCapCents,
      prefs: row.prefs ?? {},
      lastRunAt: row.lastRunAt,
      exists: true,
      updatedBy: row.updatedBy,
    };
  });
}

export interface UpsertConfigInput {
  enabled?: boolean;
  cadenceMinutes?: number | null;
  maxActionsPerTick?: number | null;
  budgetCapCents?: number | null;
  prefs?: Record<string, unknown>;
  updatedBy: string;
}

/** Create or update a single domain's config. */
export async function upsertDomainConfig(
  orgId: number,
  domain: AutopilotDomain,
  input: UpsertConfigInput
): Promise<AutopilotConfig> {
  const existing = await getDomainConfig(orgId, domain);
  const patch: Partial<typeof autopilotConfigsTable.$inferInsert> = { updatedBy: input.updatedBy };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.cadenceMinutes !== undefined) patch.cadenceMinutes = input.cadenceMinutes;
  if (input.maxActionsPerTick !== undefined) patch.maxActionsPerTick = input.maxActionsPerTick;
  if (input.budgetCapCents !== undefined) patch.budgetCapCents = input.budgetCapCents;
  if (input.prefs !== undefined) patch.prefs = input.prefs;

  if (existing) {
    const [updated] = await db
      .update(autopilotConfigsTable)
      .set(patch)
      .where(eq(autopilotConfigsTable.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(autopilotConfigsTable)
    .values({ orgId, domain, ...patch })
    .returning();
  return created;
}
