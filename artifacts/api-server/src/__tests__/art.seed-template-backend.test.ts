import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// The boot seeder is gated on Nano Banana being configured; force it true so the
// seeder body runs. We call seedSalarymanArtKit(0) below (zero kickoffs) so no
// real provider calls happen and we don't need to mock the provider registry.
vi.mock("../lib/nano-banana", async (importActual) => ({
  ...(await importActual<typeof import("../lib/nano-banana")>()),
  isNanoBananaConfigured: () => true,
}));

import { db, artAssetsTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";
import { seedSalarymanArtKit } from "../routes/art-assets";
import {
  CHARACTER_TEMPLATE_CATALOG,
  composeRealisticCharacterPrompt,
} from "../lib/salaryman-art";

const TEMPLATE_KEYS = CHARACTER_TEMPLATE_CATALOG.map((t) => t.id);

async function deleteTemplateRows() {
  await db.delete(artAssetsTable).where(inArray(artAssetsTable.key, TEMPLATE_KEYS));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await deleteTemplateRows();
});
afterAll(async () => {
  // Re-seed cleanly so the dev DB matches a normal boot after the test wipes rows.
  await seedSalarymanArtKit(0);
});

describe("seedSalarymanArtKit — character template rows", () => {
  it("inserts char_template_* rows pinned to the unreal backend with the realistic prompt", async () => {
    await seedSalarymanArtKit(0); // 0 kickoffs → no provider calls

    const rows = await db
      .select()
      .from(artAssetsTable)
      .where(inArray(artAssetsTable.key, TEMPLATE_KEYS));
    expect(rows).toHaveLength(TEMPLATE_KEYS.length);

    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const t of CHARACTER_TEMPLATE_CATALOG) {
      const row = byKey.get(t.id)!;
      expect(row, `row for ${t.id}`).toBeDefined();
      expect(row.backend).toBe("unreal");
      expect(row.jobType).toBe("object");
      expect(row.prompt).toBe(composeRealisticCharacterPrompt(t.subject));
    }
  });

  it("repairs a stale row that was seeded on the default backend with the pixel prompt", async () => {
    const t = CHARACTER_TEMPLATE_CATALOG[0];
    // Simulate a row created before this entry gained its unreal backend / realistic
    // prompt: default backend, no job type, a stale prompt, never baked (no url).
    await db.insert(artAssetsTable).values({
      key: t.id,
      category: "character",
      subject: t.subject,
      prompt: "STALE PIXEL PROMPT",
      aspectRatio: "3:4",
      backend: "nano-banana",
      status: "failed",
      failMsg: "old failure",
    });

    await seedSalarymanArtKit(0);

    const [row] = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.key, t.id));
    expect(row.backend).toBe("unreal");
    expect(row.jobType).toBe("object");
    expect(row.prompt).toBe(composeRealisticCharacterPrompt(t.subject));
    expect(row.status).toBe("pending");
    expect(row.failMsg).toBeNull();
  });

  it("leaves an already-baked row untouched even if its backend differs", async () => {
    const t = CHARACTER_TEMPLATE_CATALOG[0];
    await db.insert(artAssetsTable).values({
      key: t.id,
      category: "character",
      subject: t.subject,
      prompt: "STALE PIXEL PROMPT",
      aspectRatio: "3:4",
      backend: "nano-banana",
      url: "/api/art/asset/already-baked.png",
      status: "ready",
    });

    await seedSalarymanArtKit(0);

    const [row] = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.key, t.id));
    // A successful image is never clobbered.
    expect(row.url).toBe("/api/art/asset/already-baked.png");
    expect(row.backend).toBe("nano-banana");
    expect(row.prompt).toBe("STALE PIXEL PROMPT");
  });
});
