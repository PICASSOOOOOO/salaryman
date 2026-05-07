#!/usr/bin/env node
/**
 * Generate asset-index.json and furniture-catalog.json for the pixel-office
 * module. The browser asset loader fetches these at runtime so it knows
 * which PNGs to decode (browser can't readdir).
 *
 * Re-run whenever PNGs are added/removed under public/pixel-agents/assets/.
 *   node scripts/build-pixel-asset-index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'public', 'pixel-agents', 'assets');

function listSorted(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => {
      const m = pattern.exec(f);
      return m ? { idx: parseInt(m[1], 10), filename: f } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.filename);
}

// Mirrors shared/manifestUtils.ts flattenManifest, lifted into JS.
function flatten(node, inherited) {
  if (node.type === 'asset') {
    return [
      {
        id: node.id,
        name: inherited.name,
        label: inherited.name,
        category: inherited.category,
        file: node.file ?? `${node.id}.png`,
        width: node.width,
        height: node.height,
        footprintW: node.footprintW,
        footprintH: node.footprintH,
        isDesk: inherited.category === 'desks',
        canPlaceOnWalls: inherited.canPlaceOnWalls,
        canPlaceOnSurfaces: inherited.canPlaceOnSurfaces,
        backgroundTiles: inherited.backgroundTiles,
        groupId: inherited.groupId,
        ...(node.orientation || inherited.orientation ? { orientation: node.orientation ?? inherited.orientation } : {}),
        ...(node.state || inherited.state ? { state: node.state ?? inherited.state } : {}),
        ...(node.frame !== undefined ? { frame: node.frame } : {}),
        ...(node.mirrorSide ? { mirrorSide: true } : {}),
        ...(inherited.rotationScheme ? { rotationScheme: inherited.rotationScheme } : {}),
        ...(inherited.animationGroup ? { animationGroup: inherited.animationGroup } : {}),
      },
    ];
  }
  const out = [];
  for (const member of node.members ?? []) {
    const child = { ...inherited };
    if (node.groupType === 'rotation' && node.rotationScheme) child.rotationScheme = node.rotationScheme;
    if (node.groupType === 'state') {
      if (node.orientation) child.orientation = node.orientation;
      if (node.state) child.state = node.state;
    }
    if (node.groupType === 'animation') {
      const o = node.orientation ?? inherited.orientation ?? '';
      const s = node.state ?? inherited.state ?? '';
      child.animationGroup = `${inherited.groupId}_${o}_${s}`.toUpperCase();
      if (node.state) child.state = node.state;
    }
    if (node.orientation && !child.orientation) child.orientation = node.orientation;
    out.push(...flatten(member, child));
  }
  return out;
}

// Build asset-index.json
const characters = listSorted(path.join(ROOT, 'characters'), /^char_(\d+)\.png$/i);
const floors = listSorted(path.join(ROOT, 'floors'), /^floor_(\d+)\.png$/i);
const walls = listSorted(path.join(ROOT, 'walls'), /^wall_(\d+)\.png$/i);
const layoutFiles = fs
  .readdirSync(ROOT)
  .map((f) => {
    const m = /^default-layout-(\d+)\.json$/.exec(f);
    return m ? { rev: parseInt(m[1], 10), file: f } : null;
  })
  .filter(Boolean)
  .sort((a, b) => b.rev - a.rev);
const defaultLayout = layoutFiles[0]?.file ?? null;

const assetIndex = { characters, floors, walls, defaultLayout };
fs.writeFileSync(path.join(ROOT, 'asset-index.json'), JSON.stringify(assetIndex, null, 2));
console.log(`[asset-index] ${characters.length} chars, ${floors.length} floors, ${walls.length} walls, layout=${defaultLayout}`);

// Build furniture-catalog.json
const furnDir = path.join(ROOT, 'furniture');
const catalog = [];
for (const sub of fs.readdirSync(furnDir, { withFileTypes: true })) {
  if (!sub.isDirectory()) continue;
  const manifestPath = path.join(furnDir, sub.name, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const inherited = {
    groupId: manifest.id,
    name: manifest.name,
    category: manifest.category,
    canPlaceOnWalls: !!manifest.canPlaceOnWalls,
    canPlaceOnSurfaces: !!manifest.canPlaceOnSurfaces,
    backgroundTiles: manifest.backgroundTiles ?? 0,
  };
  let assets;
  if (manifest.type === 'asset') {
    assets = [
      {
        id: manifest.id,
        name: manifest.name,
        label: manifest.name,
        category: manifest.category,
        file: manifest.file ?? `${manifest.id}.png`,
        width: manifest.width,
        height: manifest.height,
        footprintW: manifest.footprintW,
        footprintH: manifest.footprintH,
        isDesk: manifest.category === 'desks',
        canPlaceOnWalls: !!manifest.canPlaceOnWalls,
        canPlaceOnSurfaces: !!manifest.canPlaceOnSurfaces,
        backgroundTiles: manifest.backgroundTiles ?? 0,
        groupId: manifest.id,
      },
    ];
  } else {
    if (manifest.rotationScheme) inherited.rotationScheme = manifest.rotationScheme;
    const root = { type: 'group', groupType: manifest.groupType, rotationScheme: manifest.rotationScheme, members: manifest.members };
    assets = flatten(root, inherited);
  }
  for (const a of assets) {
    a.furniturePath = `furniture/${sub.name}/${a.file}`;
    catalog.push(a);
  }
}
fs.writeFileSync(path.join(ROOT, 'furniture-catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`[furniture-catalog] ${catalog.length} assets`);
