import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import {
  buildApp,
  seedSave,
  readSave,
  cleanupTestData,
  resetAuthState,
  authState,
} from "./helpers/realtyTestApp";

// A studio-tier home: 2 crew-days × ƒ2,500 = ƒ5,000 labor (deterministic, not
// BTC-scaled). property_studio is in the server PROPERTY_CATALOG.
const ART_KEY = "property_studio";
const TIER = "studio";
const LABOR = 5_000;

const app = buildApp();

beforeEach(async () => {
  resetAuthState();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/real-estate/renovate", () => {
  it("renovates an owned property and deducts ƒ labor", async () => {
    await seedSave({ salary: 50_000, owned: { kind: "home", artKey: ART_KEY, tier: TIER } });

    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0, themeColor: "#38bdf8", signage: "HOME BASE", lighting: "bright" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.laborCost).toBe(LABOR);
    expect(res.body.crewDays).toBe(2);
    expect(res.body.newBalance).toBe(50_000 - LABOR);
    expect(res.body.owned.customization).toMatchObject({
      themeColor: "#38bdf8",
      signage: "HOME BASE",
      lighting: "bright",
    });
    expect(res.body.owned.customization.renovatedAt).toBeTruthy();

    // Persisted: salary column + data both reflect the debit and customization.
    const save = await readSave(0);
    expect(save).not.toBeNull();
    expect(save!.salary).toBe(50_000 - LABOR);
    const office = (save!.data as any).home;
    expect(office.customization.themeColor).toBe("#38bdf8");
    expect((save!.data as any).salary).toBe(50_000 - LABOR);
  });

  it("rejects renovating a property the player does not own (403)", async () => {
    await seedSave({ salary: 50_000 }); // no owned property

    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0, themeColor: "#38bdf8" });

    expect(res.status).toBe(403);
    const save = await readSave(0);
    expect(save!.salary).toBe(50_000); // balance untouched
  });

  it("rejects when balance is below the labor cost (402), leaving balance intact", async () => {
    await seedSave({ salary: 1_000, owned: { kind: "home", artKey: ART_KEY, tier: TIER } });

    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0, themeColor: "#38bdf8" });

    expect(res.status).toBe(402);
    expect(res.body.required).toBe(LABOR);
    const save = await readSave(0);
    expect(save!.salary).toBe(1_000);
  });

  it("rejects an invalid swatch hex (400)", async () => {
    await seedSave({ salary: 50_000, owned: { kind: "home", artKey: ART_KEY, tier: TIER } });

    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0, themeColor: "#123456" });

    expect(res.status).toBe(400);
    const save = await readSave(0);
    expect(save!.salary).toBe(50_000);
  });

  it("rejects an invalid lighting mood (400)", async () => {
    await seedSave({ salary: 50_000, owned: { kind: "home", artKey: ART_KEY, tier: TIER } });

    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0, lighting: "strobe" });

    expect(res.status).toBe(400);
  });

  it("rejects an empty renovation with no fields (400)", async () => {
    await seedSave({ salary: 50_000, owned: { kind: "home", artKey: ART_KEY, tier: TIER } });

    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0 });

    expect(res.status).toBe(400);
  });

  it("requires authentication (401)", async () => {
    authState.authed = false;
    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0, themeColor: "#38bdf8" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the player has no save yet", async () => {
    // no seedSave call
    const res = await request(app)
      .post("/api/real-estate/renovate")
      .send({ artKey: ART_KEY, slot: 0, themeColor: "#38bdf8" });
    expect(res.status).toBe(404);
  });
});
