/**
 * Browser-side asset loader for the pixel-office engine.
 *
 * The upstream pixel-agents project ships pre-decoded sprite data from a
 * Node.js host (VS Code extension) into the webview via postMessage. We
 * don't have that host, so we fetch the raw PNGs from the artifact's
 * public/ dir and decode them in the browser via <canvas>, then call
 * the engine's setter functions directly.
 *
 * The directory listing isn't available from the browser, so a build-time
 * script (scripts/build-pixel-asset-index.mjs) emits two index JSON files
 * we fetch first:
 *   - asset-index.json:    floors, walls, characters, defaultLayout
 *   - furniture-catalog.json: flattened furniture catalog (matches
 *     LoadedAssetData expected by buildDynamicCatalog)
 */
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  CHARACTER_DIRECTIONS,
  FLOOR_TILE_SIZE,
  WALL_BITMASK_COUNT,
  WALL_GRID_COLS,
  WALL_PIECE_HEIGHT,
  WALL_PIECE_WIDTH,
} from './shared/constants.js';
import { rgbaToHex } from './shared/colorUtils.js';
import { setFloorSprites } from './office/floorTiles.js';
import { setWallSprites } from './office/wallTiles.js';
import { setCharacterTemplates } from './office/sprites/spriteData.js';
import { buildDynamicCatalog } from './office/layout/furnitureCatalog.js';
import type { OfficeLayout, SpriteData } from './office/types.js';

interface AssetIndex {
  characters: string[];
  floors: string[];
  walls: string[];
  defaultLayout: string | null;
}

interface CatalogEntry {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  furniturePath: string; // relative to assets/ root
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  groupId?: string;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

// ── Caching ─────────────────────────────────────────────────────
// Loading the assets is expensive (35+ PNG decodes). Cache the resolved
// promise so multiple LiveOffice mounts in the same session reuse it.
let loadPromise: Promise<{ layout: OfficeLayout | null }> | null = null;

interface DecodedPng {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

async function decodePng(url: string): Promise<DecodedPng> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PNG fetch failed: ${url} (${res.status})`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Failed to acquire 2d canvas context');
  }
  // imageSmoothing must stay disabled or pixel-perfect colors get crushed.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: img.data };
}

function readSprite(
  png: DecodedPng,
  width: number,
  height: number,
  ox = 0,
  oy = 0,
): SpriteData {
  const sprite: string[][] = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      const i = ((oy + y) * png.width + (ox + x)) * 4;
      row.push(rgbaToHex(png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]));
    }
    sprite.push(row);
  }
  return sprite;
}

async function decodeCharacters(base: string, files: string[]) {
  const out: { down: SpriteData[]; up: SpriteData[]; right: SpriteData[] }[] = [];
  for (const file of files) {
    const png = await decodePng(`${base}pixel-agents/assets/characters/${file}`);
    const byDir = { down: [] as SpriteData[], up: [] as SpriteData[], right: [] as SpriteData[] };
    for (let d = 0; d < CHARACTER_DIRECTIONS.length; d++) {
      const dir = CHARACTER_DIRECTIONS[d];
      const oy = d * CHAR_FRAME_H;
      const frames: SpriteData[] = [];
      for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
        frames.push(readSprite(png, CHAR_FRAME_W, CHAR_FRAME_H, f * CHAR_FRAME_W, oy));
      }
      byDir[dir] = frames;
    }
    out.push(byDir);
  }
  return out;
}

async function decodeFloors(base: string, files: string[]): Promise<SpriteData[]> {
  const out: SpriteData[] = [];
  for (const file of files) {
    const png = await decodePng(`${base}pixel-agents/assets/floors/${file}`);
    out.push(readSprite(png, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE));
  }
  return out;
}

async function decodeWalls(base: string, files: string[]): Promise<SpriteData[][]> {
  const out: SpriteData[][] = [];
  for (const file of files) {
    const png = await decodePng(`${base}pixel-agents/assets/walls/${file}`);
    const set: SpriteData[] = [];
    for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
      const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
      const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
      set.push(readSprite(png, WALL_PIECE_WIDTH, WALL_PIECE_HEIGHT, ox, oy));
    }
    out.push(set);
  }
  return out;
}

async function decodeFurniture(
  base: string,
  catalog: CatalogEntry[],
): Promise<Record<string, SpriteData>> {
  const out: Record<string, SpriteData> = {};
  // Decode in small parallel batches so we don't open 38 concurrent fetches
  // (which can stall behind the HTTP/1.1 connection limit on Vite dev).
  const BATCH = 6;
  for (let i = 0; i < catalog.length; i += BATCH) {
    const slice = catalog.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (entry) => {
        try {
          const png = await decodePng(`${base}pixel-agents/assets/${entry.furniturePath}`);
          out[entry.id] = readSprite(png, entry.width, entry.height);
        } catch (err) {
          // Don't let one missing PNG kill the whole load
          console.warn('[pixel-office] furniture decode failed', entry.id, err);
        }
      }),
    );
  }
  return out;
}

/**
 * Load and decode every pixel-office asset, then push them into the engine.
 * Resolves with the parsed default layout (or null if there is none) so the
 * caller can hand it to OfficeState.rebuildFromLayout.
 */
export function loadPixelOfficeAssets(): Promise<{ layout: OfficeLayout | null }> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const base = import.meta.env.BASE_URL ?? '/';
    const t0 = performance.now();

    const [assetIndex, catalog] = await Promise.all([
      fetch(`${base}pixel-agents/assets/asset-index.json`).then((r) => r.json() as Promise<AssetIndex>),
      fetch(`${base}pixel-agents/assets/furniture-catalog.json`).then((r) => r.json() as Promise<CatalogEntry[]>),
    ]);

    const [characters, floors, wallSets, furnitureSprites] = await Promise.all([
      decodeCharacters(base, assetIndex.characters),
      decodeFloors(base, assetIndex.floors),
      decodeWalls(base, assetIndex.walls),
      decodeFurniture(base, catalog),
    ]);

    setCharacterTemplates(characters);
    setFloorSprites(floors);
    setWallSprites(wallSets);
    buildDynamicCatalog({
      catalog: catalog.map((c) => ({
        id: c.id,
        label: c.label,
        category: c.category,
        width: c.width,
        height: c.height,
        footprintW: c.footprintW,
        footprintH: c.footprintH,
        isDesk: c.isDesk,
        groupId: c.groupId,
        orientation: c.orientation,
        state: c.state,
        canPlaceOnSurfaces: c.canPlaceOnSurfaces,
        backgroundTiles: c.backgroundTiles,
        canPlaceOnWalls: c.canPlaceOnWalls,
        mirrorSide: c.mirrorSide,
        rotationScheme: c.rotationScheme,
        animationGroup: c.animationGroup,
        frame: c.frame,
      })),
      sprites: furnitureSprites,
    });

    let layout: OfficeLayout | null = null;
    if (assetIndex.defaultLayout) {
      const raw = await fetch(`${base}pixel-agents/assets/${assetIndex.defaultLayout}`).then((r) => r.text());
      // deserializeLayout expects a JSON string and runs migration. Importing
      // it lazily so we don't widen the module's eager load surface.
      const { deserializeLayout } = await import('./office/layout/layoutSerializer.js');
      layout = deserializeLayout(raw);
    }

    const dt = Math.round(performance.now() - t0);
    console.log(
      `[pixel-office] assets loaded in ${dt}ms — ${characters.length} chars, ${floors.length} floors, ${wallSets.length} walls, ${catalog.length} furniture`,
    );

    return { layout };
  })();

  // If load fails, allow a retry on the next call rather than wedging the
  // app forever on a transient network error.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
