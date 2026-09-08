// ── Resource Node Seed Positions ─────────────────────────────────────────
// 50 static node positions distributed across wasteland, ocean, mountain,
// and forest zones outside the gas-safe city area.
// City bounds: x 6200-7400, y 5800-6800.
// Forest centers from world geography.

export interface NodeSeedEntry {
  resourceId: string;
  worldX: number;
  worldY: number;
  cityId: string;
}

export const RESOURCE_NODE_SEEDS: NodeSeedEntry[] = [
  // ── Ocean / River shallows (far west, north coast) ────────────────────
  { resourceId: 'brine_crystal', worldX: 1200, worldY: 2800, cityId: 'minx_prime' },
  { resourceId: 'brine_crystal', worldX: 1800, worldY: 1500, cityId: 'minx_prime' },
  { resourceId: 'brine_crystal', worldX: 2600, worldY: 1200, cityId: 'minx_prime' },
  { resourceId: 'brine_crystal', worldX: 900,  worldY: 4200, cityId: 'minx_prime' },
  { resourceId: 'silt_ore',      worldX: 1400, worldY: 2000, cityId: 'minx_prime' },
  { resourceId: 'silt_ore',      worldX: 2100, worldY: 1800, cityId: 'minx_prime' },
  { resourceId: 'silt_ore',      worldX: 1000, worldY: 3600, cityId: 'minx_prime' },
  { resourceId: 'silt_ore',      worldX: 3000, worldY: 1000, cityId: 'minx_prime' },
  { resourceId: 'brine_crystal', worldX: 800,  worldY: 5500, cityId: 'minx_prime' },
  { resourceId: 'silt_ore',      worldX: 1600, worldY: 5200, cityId: 'minx_prime' },

  // ── Mountain / Rocky wasteland (north highlands) ──────────────────────
  { resourceId: 'iron_scrap',    worldX: 3500, worldY: 1800, cityId: 'minx_prime' },
  { resourceId: 'iron_scrap',    worldX: 4800, worldY: 1400, cityId: 'minx_prime' },
  { resourceId: 'iron_scrap',    worldX: 2800, worldY: 3000, cityId: 'minx_prime' },
  { resourceId: 'iron_scrap',    worldX: 5600, worldY: 2200, cityId: 'minx_prime' },
  { resourceId: 'copper_vein',   worldX: 3200, worldY: 2400, cityId: 'minx_prime' },
  { resourceId: 'copper_vein',   worldX: 4400, worldY: 1600, cityId: 'minx_prime' },
  { resourceId: 'copper_vein',   worldX: 5200, worldY: 1900, cityId: 'minx_prime' },
  { resourceId: 'darkstone',     worldX: 3800, worldY: 2100, cityId: 'minx_prime' },
  { resourceId: 'darkstone',     worldX: 4600, worldY: 2800, cityId: 'minx_prime' },
  { resourceId: 'darkstone',     worldX: 5000, worldY: 2600, cityId: 'minx_prime' },

  // ── Forest / Border zones ─────────────────────────────────────────────
  // North forest: cx=6800, cy=4200
  { resourceId: 'resin_shard',   worldX: 6400, worldY: 3800, cityId: 'minx_prime' },
  { resourceId: 'resin_shard',   worldX: 7200, worldY: 4000, cityId: 'minx_prime' },
  { resourceId: 'copper_scrap',  worldX: 6600, worldY: 4600, cityId: 'minx_prime' },
  // West forest: cx=4200, cy=6300
  { resourceId: 'resin_shard',   worldX: 3800, worldY: 6000, cityId: 'minx_prime' },
  { resourceId: 'copper_scrap',  worldX: 4400, worldY: 6600, cityId: 'minx_prime' },
  { resourceId: 'copper_scrap',  worldX: 3600, worldY: 7000, cityId: 'minx_prime' },
  // South forest: cx=6800, cy=8400
  { resourceId: 'resin_shard',   worldX: 6500, worldY: 8200, cityId: 'minx_prime' },
  { resourceId: 'resin_shard',   worldX: 7100, worldY: 8600, cityId: 'minx_prime' },
  { resourceId: 'copper_scrap',  worldX: 6200, worldY: 8800, cityId: 'minx_prime' },
  // East forest: cx=9200, cy=6300
  { resourceId: 'resin_shard',   worldX: 9000, worldY: 5900, cityId: 'minx_prime' },
  { resourceId: 'copper_scrap',  worldX: 9400, worldY: 6700, cityId: 'minx_prime' },
  // Northwest forest: cx=4500, cy=4500
  { resourceId: 'resin_shard',   worldX: 4200, worldY: 4200, cityId: 'minx_prime' },
  { resourceId: 'copper_scrap',  worldX: 4800, worldY: 4800, cityId: 'minx_prime' },

  // ── North Wasteland (y < 4500) ────────────────────────────────────────
  { resourceId: 'waste_iron',    worldX: 6800, worldY: 3400, cityId: 'minx_prime' },
  { resourceId: 'waste_iron',    worldX: 7600, worldY: 2800, cityId: 'minx_prime' },
  { resourceId: 'waste_iron',    worldX: 8200, worldY: 3800, cityId: 'minx_prime' },
  { resourceId: 'void_crystal',  worldX: 7200, worldY: 2400, cityId: 'minx_prime' },
  { resourceId: 'void_crystal',  worldX: 8600, worldY: 3200, cityId: 'minx_prime' },

  // ── South Wasteland (y > 8200, x < 8500) ─────────────────────────────
  { resourceId: 'waste_iron',    worldX: 3200, worldY: 8600, cityId: 'minx_prime' },
  { resourceId: 'waste_iron',    worldX: 4800, worldY: 9200, cityId: 'minx_prime' },
  { resourceId: 'void_crystal',  worldX: 2800, worldY: 9800, cityId: 'minx_prime' },
  { resourceId: 'waste_iron',    worldX: 6000, worldY: 9600, cityId: 'minx_prime' },
  { resourceId: 'darkstone',     worldX: 4200, worldY: 10400, cityId: 'minx_prime' },

  // ── East Wasteland (x > 8500, y 6500-11000) ──────────────────────────
  { resourceId: 'waste_iron',    worldX: 9200, worldY: 7400, cityId: 'minx_prime' },
  { resourceId: 'waste_iron',    worldX: 10400, worldY: 8200, cityId: 'minx_prime' },
  { resourceId: 'void_crystal',  worldX: 9800, worldY: 6800, cityId: 'minx_prime' },
  { resourceId: 'iron_scrap',    worldX: 10800, worldY: 7600, cityId: 'minx_prime' },
  { resourceId: 'darkstone',     worldX: 11200, worldY: 9400, cityId: 'minx_prime' },
  { resourceId: 'copper_vein',   worldX: 9600, worldY: 9200, cityId: 'minx_prime' },
];
