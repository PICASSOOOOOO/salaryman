import { createHash } from "node:crypto";

export type ArtQaState = "technical_pass" | "needs_review" | "failed";

export type ArtQaRecipe = {
  category: string;
  minWidth: number;
  minHeight: number;
  expectedRatio: number;
  ratioTolerance: number;
  minBytes: number;
  requireAlpha: boolean;
};

export type ArtQaResult = {
  state: ArtQaState;
  checkedAt: string;
  sourceUrl: string;
  sourceHash: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  byteLength: number | null;
  hasAlpha: boolean | null;
  failures: string[];
  reviewReasons: string[];
  recipe: ArtQaRecipe;
};

const IMAGE_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

export function getArtQaRecipe(category: string, aspectRatio: string, mediaType = "image"): ArtQaRecipe {
  const [w, h] = aspectRatio.split(":").map(Number);
  const expectedRatio = w > 0 && h > 0 ? w / h : 1;

  if (mediaType === "video") {
    return {
      category,
      minWidth: 1920,
      minHeight: 1080,
      expectedRatio,
      ratioTolerance: 0.08,
      minBytes: 250_000,
      requireAlpha: false,
    };
  }

  if (category === "scene" || category === "ui") {
    return {
      category,
      minWidth: 1536,
      minHeight: 864,
      expectedRatio,
      ratioTolerance: 0.08,
      minBytes: 100_000,
      requireAlpha: false,
    };
  }

  if (category === "character") {
    return {
      category,
      minWidth: 1024,
      minHeight: 1024,
      expectedRatio,
      ratioTolerance: 0.08,
      minBytes: 80_000,
      requireAlpha: true,
    };
  }

  return {
    category,
    minWidth: 1024,
    minHeight: 1024,
    expectedRatio,
    ratioTolerance: 0.08,
    minBytes: 80_000,
    requireAlpha: true,
  };
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function parsePng(bytes: Buffer): { width: number; height: number; hasAlpha: boolean } | null {
  if (sniffMime(bytes) !== "image/png" || bytes.length < 26) return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: bytes[25] === 4 || bytes[25] === 6,
  };
}

function parseWebp(bytes: Buffer): { width: number; height: number; hasAlpha: boolean } | null {
  if (sniffMime(bytes) !== "image/webp" || bytes.length < 30) return null;
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      hasAlpha: (bytes[20] & 0x10) !== 0,
    };
  }
  if (chunk === "VP8 ") {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, hasAlpha: false };
  }
  return null;
}

function parseJpeg(bytes: Buffer): { width: number; height: number; hasAlpha: boolean } | null {
  if (sniffMime(bytes) !== "image/jpeg") return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
        hasAlpha: false,
      };
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function parseImage(bytes: Buffer): { mimeType: string; width: number; height: number; hasAlpha: boolean } | null {
  const mimeType = sniffMime(bytes);
  if (!mimeType) return null;
  const parsed = mimeType === "image/png" ? parsePng(bytes) : mimeType === "image/webp" ? parseWebp(bytes) : parseJpeg(bytes);
  return parsed ? { mimeType, ...parsed } : null;
}

export async function validateArtOutput(
  sourceUrl: string,
  recipe: ArtQaRecipe,
  mediaType = "image",
): Promise<ArtQaResult> {
  const failures: string[] = [];
  const reviewReasons: string[] = [];
  let bytes: Buffer | null = null;
  let parsed: ReturnType<typeof parseImage> = null;

  try {
    const parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
      failures.push("result URL must use HTTPS");
    }
    if (failures.length === 0) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
      try {
        const response = await fetch(sourceUrl, { signal: controller.signal });
        if (!response.ok) failures.push(`result download returned HTTP ${response.status}`);
        else {
          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.byteLength > MAX_IMAGE_BYTES) failures.push("result exceeds 30 MB");
          else bytes = buffer;
        }
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message.slice(0, 240) : "result download failed");
  }

  if (bytes && mediaType === "image") {
    parsed = parseImage(bytes);
    if (!parsed) failures.push("result is not a decodable PNG, JPEG, or WebP image");
    else {
      if (parsed.width < recipe.minWidth || parsed.height < recipe.minHeight) {
        failures.push(`result is ${parsed.width}×${parsed.height}; minimum is ${recipe.minWidth}×${recipe.minHeight}`);
      }
      const ratio = parsed.width / parsed.height;
      if (Math.abs(ratio - recipe.expectedRatio) / recipe.expectedRatio > recipe.ratioTolerance) {
        failures.push(`result aspect ratio ${ratio.toFixed(3)} does not match ${recipe.expectedRatio.toFixed(3)}`);
      }
      if (bytes.byteLength < recipe.minBytes) failures.push(`result is only ${bytes.byteLength} bytes`);
      if (recipe.requireAlpha && !parsed.hasAlpha) reviewReasons.push("transparent background required for this game asset category");
      if (parsed.mimeType === "image/jpeg") reviewReasons.push("JPEG is not suitable as the final source for a cutout asset");
    }
  } else if (bytes && mediaType === "video" && bytes.byteLength < recipe.minBytes) {
    failures.push(`video result is only ${bytes.byteLength} bytes`);
  }

  const state: ArtQaState = failures.length > 0 ? "failed" : reviewReasons.length > 0 ? "needs_review" : "technical_pass";
  return {
    state,
    checkedAt: new Date().toISOString(),
    sourceUrl,
    sourceHash: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
    mimeType: parsed?.mimeType ?? null,
    width: parsed?.width ?? null,
    height: parsed?.height ?? null,
    byteLength: bytes?.byteLength ?? null,
    hasAlpha: parsed?.hasAlpha ?? null,
    failures,
    reviewReasons,
    recipe,
  };
}