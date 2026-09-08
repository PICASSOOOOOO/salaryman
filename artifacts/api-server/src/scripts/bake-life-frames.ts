/**
 * One-off script: generate the 9 `life_*` landing-page frames using gpt-image-1
 * via the already-configured OpenAI AI Integration, upload them to object
 * storage, and mark the art_assets rows as `ready`.
 *
 * Run from the api-server package root:
 *   pnpm tsx src/scripts/bake-life-frames.ts
 */

import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, inArray } from "drizzle-orm";
import { db, artAssetsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { SALARYMAN_ART_KIT, composeSalarymanPrompt } from "../lib/salaryman-art";

const LIFE_KEYS = [
  "life_birth",
  "life_childhood",
  "life_school",
  "life_first_job",
  "life_work_prime",
  "life_burnout",
  "life_death",
  "life_position_open",
  "life_terminal",
];

const LANDSCAPE_SIZE = "1536x1024";

async function main() {
  const storage = new ObjectStorageService();

  const rows = await db
    .select()
    .from(artAssetsTable)
    .where(inArray(artAssetsTable.key, LIFE_KEYS));

  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  const pendingKeys = LIFE_KEYS.filter((key) => {
    const row = rowByKey.get(key);
    return !row || row.status !== "ready" || !row.url;
  });

  if (pendingKeys.length === 0) {
    console.log("All life_* frames already ready. Nothing to do.");
    return;
  }

  console.log(`Generating ${pendingKeys.length} frame(s): ${pendingKeys.join(", ")}`);

  for (const key of pendingKeys) {
    const entry = SALARYMAN_ART_KIT.find((e) => e.key === key);
    if (!entry) {
      console.warn(`  [${key}] No kit entry found — skipping`);
      continue;
    }

    const prompt = entry.fullPrompt ?? composeSalarymanPrompt(entry.subject);
    console.log(`  [${key}] Generating image…`);

    let imageB64: string;
    try {
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: LANDSCAPE_SIZE as "1536x1024",
        n: 1,
      });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error("No base64 data returned");
      imageB64 = b64;
    } catch (err: any) {
      console.error(`  [${key}] Generation failed: ${err?.message || err}`);
      await db
        .update(artAssetsTable)
        .set({ status: "failed", failMsg: String(err?.message || err).slice(0, 500), updatedAt: new Date() })
        .where(eq(artAssetsTable.key, key));
      continue;
    }

    console.log(`  [${key}] Uploading to object storage…`);
    let url: string;
    try {
      const buffer = Buffer.from(imageB64, "base64");
      url = await storage.uploadBuffer(buffer, "image/png");
    } catch (err: any) {
      console.error(`  [${key}] Upload failed: ${err?.message || err}`);
      await db
        .update(artAssetsTable)
        .set({ status: "failed", failMsg: `upload error: ${String(err?.message || err).slice(0, 400)}`, updatedAt: new Date() })
        .where(eq(artAssetsTable.key, key));
      continue;
    }

    await db
      .update(artAssetsTable)
      .set({ status: "ready", url, taskId: null, backendMeta: null, failMsg: null, updatedAt: new Date() })
      .where(eq(artAssetsTable.key, key));

    console.log(`  [${key}] Done → ${url}`);
  }

  console.log("Bake complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
