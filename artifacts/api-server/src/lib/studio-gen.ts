import { generateImageBuffer, type GptImageSize } from "@workspace/integrations-openai-ai-server/image";
import { db, brandKitTable, filesFoldersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { BrandKit } from "@workspace/db/schema";
import { ObjectStorageService } from "./objectStorage";
import {
  generateImage as nanoBananaGenerate,
  isNanoBananaConfigured,
  type AspectRatio,
} from "./nano-banana";

const objectStorage = new ObjectStorageService();

export const VALID_IMAGE_SIZES: GptImageSize[] = ["1024x1024", "1024x1536", "1536x1024"];

/**
 * Map a GPT-style WIDTHxHEIGHT size string to a Nano Banana aspect ratio.
 * Pro API only accepts LANDSCAPE | PORTRAIT — square defaults to LANDSCAPE.
 */
export function sizeToAspect(size: GptImageSize): AspectRatio {
  if (size === "1024x1536") return "PORTRAIT";
  return "LANDSCAPE";
}

/**
 * TASTE — anti-slop art direction (always on for generated imagery).
 * Appended to every image prompt via applyTaste().
 */
export const TASTE_DIRECTION =
  "Art direction (strict): intentional composition with one clear focal point and deliberate use of negative space. Strong visual hierarchy, confident framing — avoid dead-centered, perfectly symmetrical compositions. Cohesive, restrained palette (2-3 dominant tones), not rainbow over-saturation. Believable physically-based lighting and real material texture, not plastic HDR glow or fake heavy bokeh. No clutter, no busy backgrounds, no generic stock-photo staging, no watermarks, no garbled text or logos. Premium, editorial, art-directed feel over default AI gloss.";

export function applyTaste(prompt: string): string {
  return `${prompt} ${TASTE_DIRECTION}`;
}

/**
 * Generate an image and return a PNG/JPG Buffer. Prefers Nano Banana Pro when
 * NANO_BANANA_API_KEY is configured (unified art style across the product),
 * falls back to OpenAI gpt-image otherwise.
 */
export async function generateStudioImage(prompt: string, size: GptImageSize): Promise<Buffer> {
  if (isNanoBananaConfigured()) {
    const result = await nanoBananaGenerate({
      prompt,
      aspectRatio: sizeToAspect(size),
      resolution: "2K",
      outputFormat: "png",
    });
    if (result.state === "completed" && result.imageUrls.length > 0) {
      const imgRes = await fetch(result.imageUrls[0], { signal: AbortSignal.timeout(30_000) });
      if (!imgRes.ok) throw new Error(`Nano Banana asset fetch failed: ${imgRes.status}`);
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    console.warn("[StudioGen] Nano Banana fell back to OpenAI:", result.state, result.failMsg);
  }
  return generateImageBuffer(prompt, size);
}

export async function getBrandKit(userId: string): Promise<BrandKit | null> {
  const [kit] = await db.select().from(brandKitTable).where(eq(brandKitTable.userId, userId));
  return kit ?? null;
}

export function buildBrandContext(kit: BrandKit | null): string {
  if (!kit) return "";
  const parts: string[] = [];
  if (kit.companyName) parts.push(`Company: ${kit.companyName}`);
  if (kit.industry) parts.push(`Industry: ${kit.industry}`);
  if (kit.tagline) parts.push(`Tagline: "${kit.tagline}"`);
  if (kit.mission) parts.push(`Mission: ${kit.mission}`);
  if (kit.targetAudience) parts.push(`Target audience: ${kit.targetAudience}`);
  if (kit.website) parts.push(`Website: ${kit.website}`);
  if (kit.primaryColor) parts.push(`Primary brand color: ${kit.primaryColor}`);
  if (kit.secondaryColor) parts.push(`Secondary brand color: ${kit.secondaryColor}`);
  if (kit.logoUrl) parts.push(`Logo URL: ${kit.logoUrl}`);
  if (parts.length === 0) return "";
  return `\n\nBrand context:\n${parts.join("\n")}`;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Upload a generated image buffer to object storage and record it in the
 * files table. Returns the file id and the canonical `/objects/<id>` path
 * (resolve to a URL on the client with `${BASE}api/storage<objectPath>`).
 */
export async function saveImageToStorage(
  userId: string,
  buffer: Buffer,
  fileName: string,
  source: string,
): Promise<{ fileId: number; objectPath: string } | null> {
  try {
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

    await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: buffer,
      signal: AbortSignal.timeout(30_000),
    });

    const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);

    const [record] = await db.insert(filesFoldersTable).values({
      userId,
      name: fileName,
      isFolder: false,
      objectPath,
      mimeType: "image/png",
      fileSize: buffer.length,
      isLocked: false,
      expiresAt,
      source,
    }).returning();

    return { fileId: record.id, objectPath };
  } catch (err) {
    console.error("[StudioGen] Failed to save image to storage:", err);
    return null;
  }
}
