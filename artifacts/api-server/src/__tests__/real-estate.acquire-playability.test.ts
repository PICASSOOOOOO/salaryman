import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  buildApp,
  cleanupTestData,
  readSave,
  resetAuthState,
  seedSave,
} from "./helpers/realtyTestApp";

const app = buildApp();

beforeEach(async () => {
  resetAuthState();
  await cleanupTestData();
});

afterAll(cleanupTestData);

describe("POST /api/real-estate/acquire playable inventory", () => {
  it("rejects an unsupported home before charging the player", async () => {
    await seedSave({ salary: 2_000_000 });

    const response = await request(app)
      .post("/api/real-estate/acquire")
      .send({ artKey: "property_loft", tenure: "own", slot: 0, requestId: "00000000-0000-4000-8000-000000000001" });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/not available/i);
    const save = await readSave(0);
    expect(save?.salary).toBe(2_000_000);
    expect((save?.data as Record<string, unknown>).home).toBeUndefined();
  });

  it("persists a playable office to the selected character slot", async () => {
    await seedSave({ slot: 2, salary: 2_000_000 });

    const response = await request(app)
      .post("/api/real-estate/acquire")
      .send({ artKey: "property_apartment_office", tenure: "rent", slot: 2, requestId: "00000000-0000-4000-8000-000000000002" });

    expect(response.status).toBe(200);
    expect(response.body.owned).toMatchObject({
      artKey: "property_apartment_office",
      propertyKey: "property_apartment_office",
      kind: "office",
    });
    const save = await readSave(2);
    expect((save?.data as { office?: { artKey?: string } }).office?.artKey).toBe("property_apartment_office");
  });
});