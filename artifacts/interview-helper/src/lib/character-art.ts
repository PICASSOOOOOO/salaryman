import { fetchArtAsset } from "@/lib/art";

export type CharacterArtKind = "pixel_agent" | "tower_character" | "player_avatar";

const imageCache = new Map<string, HTMLImageElement>();
const requested = new Set<string>();
const failed = new Set<string>();

export function characterArtKey(kind: CharacterArtKind, identity: string): string {
  const slug = identity
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean)
    .slice(0, 9)
    .join("_")
    .slice(0, 56);
  return `${kind}_${slug || "unnamed"}`;
}

function requestImage(key: string, src?: string | null): void {
  if (requested.has(key)) return;
  requested.add(key);

  const showImage = (imageUrl: string) => {
    const image = new Image();
    image.onload = () => imageCache.set(key, image);
    image.onerror = () => failed.add(key);
    image.src = imageUrl;
  };

  if (src) {
    showImage(src);
    return;
  }

  const poll = async () => {
    try {
      const asset = await fetchArtAsset(key);
      if (asset?.url) {
        failed.delete(key);
        showImage(asset.url);
      } else {
        if (asset?.status === "failed") failed.add(key);
        window.setTimeout(poll, asset?.status === "failed" ? 12_000 : 4_000);
      }
    } catch {
      failed.add(key);
      window.setTimeout(poll, 12_000);
    }
  };
  void poll();
}

/**
 * Draw a named identity asset. Until the asset is ready, render an explicit
 * QA marker instead of silently substituting a generic procedural character.
 */
export function drawCharacterArtwork(
  ctx: CanvasRenderingContext2D,
  kind: CharacterArtKind,
  identity: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { imageUrl?: string | null; label?: string } = {},
): boolean {
  const key = characterArtKey(kind, identity);
  const imageKey = opts.imageUrl ? `${key}|${opts.imageUrl}` : key;
  requestImage(imageKey, opts.imageUrl);
  const image = imageCache.get(imageKey);
  if (image?.complete && image.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
    return true;
  }

  ctx.save();
  ctx.fillStyle = "rgba(12,7,20,.92)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = failed.has(imageKey) ? "#fb7185" : "#f0abfc";
  ctx.lineWidth = Math.max(1, Math.min(2, width / 12));
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  ctx.setLineDash([]);
  ctx.fillStyle = "#f0abfc";
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.max(5, Math.min(8, width / 3))}px monospace`;
  ctx.fillText(failed.has(imageKey) ? "ART FAILED" : "ART PENDING", x + width / 2, y + height / 2);
  if (width > 30 && height > 24) {
    ctx.fillStyle = "#fbcfe8";
    ctx.font = `6px monospace`;
    ctx.fillText((opts.label ?? identity).toUpperCase().slice(0, 18), x + width / 2, y + height / 2 + 9);
  }
  ctx.restore();
  return false;
}
