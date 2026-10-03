import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  AUTOPILOT_DOMAINS,
  autopilotConfigsTable,
  db,
  organizationsTable,
} from "@workspace/db";
import { autoActivatePrimeWorkflows } from "../lib/autopilot/activation";

const OWNER_ID = `autopilot-activation-test-${Date.now()}`;
const OTHER_USER_ID = `${OWNER_ID}-other`;

describe("Prime autopilot paid activation", () => {
  let orgId = 0;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizationsTable)
      .values({
        name: `Autopilot activation test ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`,
        ownerUserId: OWNER_ID,
      })
      .returning({ id: organizationsTable.id });
    orgId = org.id;
  });

  afterAll(async () => {
    if (!orgId) return;
    await db.delete(autopilotConfigsTable).where(eq(autopilotConfigsTable.orgId, orgId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  });

  it("does not activate workflows for a non-owner's personal subscription", async () => {
    expect(await autoActivatePrimeWorkflows(OTHER_USER_ID, { orgId })).toBeNull();
    const rows = await db
      .select()
      .from(autopilotConfigsTable)
      .where(eq(autopilotConfigsTable.orgId, orgId));
    expect(rows).toHaveLength(0);
  });

  it("enables missing workflows once and preserves an explicit pause", async () => {
    expect(await autoActivatePrimeWorkflows(OWNER_ID, { orgId })).toBe(orgId);

    const firstRead = await db
      .select()
      .from(autopilotConfigsTable)
      .where(eq(autopilotConfigsTable.orgId, orgId));
    expect(firstRead.map((row) => row.domain).sort()).toEqual([...AUTOPILOT_DOMAINS].sort());
    expect(firstRead.every((row) => row.enabled)).toBe(true);

    await db
      .update(autopilotConfigsTable)
      .set({ enabled: false })
      .where(and(
        eq(autopilotConfigsTable.orgId, orgId),
        eq(autopilotConfigsTable.domain, "marketing"),
      ));

    await autoActivatePrimeWorkflows(OWNER_ID, { orgId });
    const afterRetry = await db
      .select()
      .from(autopilotConfigsTable)
      .where(eq(autopilotConfigsTable.orgId, orgId));

    expect(afterRetry.find((row) => row.domain === "marketing")?.enabled).toBe(false);
    expect(afterRetry.filter((row) => row.domain !== "marketing").every((row) => row.enabled)).toBe(true);
  });
});