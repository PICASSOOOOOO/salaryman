import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  autopilotActivityLogTable,
  organizationsTable,
  usersTable,
  type AutopilotDomain,
} from "@workspace/db";
import {
  recordAutopilotActivity,
  getRecentAutopilotActivity,
} from "../lib/autopilot/activity";

// The activity feed is the org-scoped audit log. These tests drive the read path
// against the REAL dev DB to prove newest-first ordering, the domain filter, and
// the `before`-id cursor used by the dashboard's load-more pagination.

const OWNER_ID = `aptest-activity-${randomUUID()}`;
const OWNER_EMAIL = `activity-${randomUUID().slice(0, 8)}@test`;
let orgId: number;

beforeAll(async () => {
  await db.insert(usersTable).values({ id: OWNER_ID, email: OWNER_EMAIL });
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: `Activity Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: OWNER_ID })
    .returning({ id: organizationsTable.id });
  orgId = org.id;
});

beforeEach(async () => {
  await db.delete(autopilotActivityLogTable).where(eq(autopilotActivityLogTable.orgId, orgId));
});

afterAll(async () => {
  await db.delete(autopilotActivityLogTable).where(eq(autopilotActivityLogTable.orgId, orgId));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  await db.delete(usersTable).where(eq(usersTable.id, OWNER_ID));
});

async function seed(count: number, domain: AutopilotDomain = "business_ops") {
  for (let i = 0; i < count; i++) {
    await recordAutopilotActivity({
      orgId,
      domain,
      action: "test",
      summary: `entry ${i}`,
      outcome: "success",
    });
  }
}

describe("getRecentAutopilotActivity — pagination", () => {
  it("returns newest-first and respects the limit", async () => {
    await seed(5);
    const rows = await getRecentAutopilotActivity(orgId, { limit: 3 });
    expect(rows).toHaveLength(3);
    expect(rows[0].summary).toBe("entry 4");
    expect(rows[2].summary).toBe("entry 2");
  });

  it("pages backwards past the oldest loaded entry via the before cursor", async () => {
    await seed(5);
    const first = await getRecentAutopilotActivity(orgId, { limit: 2 });
    expect(first.map((r) => r.summary)).toEqual(["entry 4", "entry 3"]);

    const cursor = first[first.length - 1].id;
    const second = await getRecentAutopilotActivity(orgId, { limit: 2, before: cursor });
    expect(second.map((r) => r.summary)).toEqual(["entry 2", "entry 1"]);

    const cursor2 = second[second.length - 1].id;
    const third = await getRecentAutopilotActivity(orgId, { limit: 2, before: cursor2 });
    expect(third.map((r) => r.summary)).toEqual(["entry 0"]);

    // No overlap and no gaps across pages.
    const all = [...first, ...second, ...third].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(5);
  });

  it("keeps the domain filter while paging", async () => {
    await seed(3, "business_ops");
    await seed(3, "marketing");

    const page1 = await getRecentAutopilotActivity(orgId, { domain: "marketing", limit: 2 });
    expect(page1).toHaveLength(2);
    expect(page1.every((r) => r.domain === "marketing")).toBe(true);

    const page2 = await getRecentAutopilotActivity(orgId, {
      domain: "marketing",
      limit: 2,
      before: page1[page1.length - 1].id,
    });
    expect(page2).toHaveLength(1);
    expect(page2.every((r) => r.domain === "marketing")).toBe(true);
  });
});
