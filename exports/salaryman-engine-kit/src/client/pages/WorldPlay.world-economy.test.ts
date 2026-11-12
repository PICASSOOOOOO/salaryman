import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("WorldPlay authoritative world economy", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "WorldPlay.tsx"), "utf8");

  it("does not settle quick jobs or commodities through generic FIAT actions", () => {
    expect(source).not.toMatch(/performGameplayFiatAction\(\s*`quick_job_/);
    expect(source).not.toMatch(/performGameplayFiatAction\(\s*`world_commodity_/);
    expect(source).toContain("/api/gameplay/jobs/start");
    expect(source).toContain("/api/gameplay/market/quote");
    expect(source).toContain("/api/gameplay/market/execute");
    expect(source).toContain("/api/gameplay/market/catalog");
    expect(source).toMatch(/JSON\.stringify\(\{ slot, commodityId: cid, side, quantity: 1 \}\)/);
  });

  it("hydrates job and cargo authority from the server", () => {
    expect(source).toContain("/api/gameplay/jobs/status?slot=");
    expect(source).toContain("/api/gameplay/market/cargo?slot=");
  });

  it("exposes an explicit start/end shift flow for the minimum-wage garden job", () => {
    expect(source).toContain("START SHIFT");
    expect(source).toContain("END SHIFT");
    expect(source).toMatch(/water_plants:[\s\S]{0,100}pay: 300[\s\S]{0,100}seconds: 60/);
    expect(source).toMatch(/jobPanel\.bid === 'water_plants'[\s\S]{0,500}completeQuickJob/);
  });

  it("applies server position corrections and clears movement targets", () => {
    expect(source).toMatch(/m\.type === 'position_correction'[\s\S]{0,300}g\.px = m\.x;[\s\S]{0,100}g\.py = m\.y;/);
    expect(source).toMatch(/m\.type === 'position_correction'[\s\S]{0,400}g\.moveTarget = null;[\s\S]{0,100}g\.interiorMoveTarget = null;/);
  });
});