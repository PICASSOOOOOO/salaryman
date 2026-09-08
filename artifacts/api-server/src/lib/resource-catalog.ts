// ── Resource Catalog ──────────────────────────────────────────────────────
// Authoritative definitions for all harvestable resource types.
// Zone determines which areas of the world the resource spawns in.

export type ResourceZone = 'ocean' | 'mountain' | 'forest' | 'wasteland';

export interface ResourceDef {
  id: string;
  name: string;
  lore: string;
  icon: string;
  zone: ResourceZone;
  basePriceFiat: number;
  harvestSeconds: number;
  weight: number;
  color: string;
}

export const RESOURCE_CATALOG: readonly ResourceDef[] = [
  {
    id: 'brine_crystal',
    name: 'BRINE CRYSTAL',
    lore: 'Saltwater-precipitated lattice from tidal shallows. Pharmaceutical corps pay top ƒ for purity-grade specimens.',
    icon: '💎',
    zone: 'ocean',
    basePriceFiat: 820,
    harvestSeconds: 5,
    weight: 1,
    color: 'rgba(56,189,248,0.18)',
  },
  {
    id: 'silt_ore',
    name: 'SILT ORE',
    lore: 'Dense mineral sediment dredged from riverbed deposits. Not pretty. Smelters love it.',
    icon: '🪨',
    zone: 'ocean',
    basePriceFiat: 420,
    harvestSeconds: 4,
    weight: 2,
    color: 'rgba(100,180,220,0.15)',
  },
  {
    id: 'iron_scrap',
    name: 'IRON SCRAP',
    lore: 'Pre-collapse structural steel, pried from collapsed mountain relay stations. Heavy and honest.',
    icon: '🔩',
    zone: 'mountain',
    basePriceFiat: 580,
    harvestSeconds: 6,
    weight: 3,
    color: 'rgba(150,150,150,0.18)',
  },
  {
    id: 'copper_vein',
    name: 'COPPER VEIN',
    lore: 'Raw copper seam exposed by a rockslide decades ago. The color alone will fetch premium from circuit fabricators.',
    icon: '🔶',
    zone: 'mountain',
    basePriceFiat: 950,
    harvestSeconds: 7,
    weight: 2,
    color: 'rgba(200,120,50,0.18)',
  },
  {
    id: 'darkstone',
    name: 'DARKSTONE',
    lore: 'A crystallized byproduct of the fog — radiates faint warmth, sells well to Corp labs. Origin officially classified.',
    icon: '🖤',
    zone: 'mountain',
    basePriceFiat: 1250,
    harvestSeconds: 8,
    weight: 1,
    color: 'rgba(80,0,160,0.20)',
  },
  {
    id: 'resin_shard',
    name: 'RESIN SHARD',
    lore: 'Fossilized tree resin from the old-growth perimeter. Burn-tested. Collectors and chemists compete for it.',
    icon: '🫙',
    zone: 'forest',
    basePriceFiat: 530,
    harvestSeconds: 4,
    weight: 1,
    color: 'rgba(180,140,40,0.18)',
  },
  {
    id: 'copper_scrap',
    name: 'COPPER SCRAP',
    lore: 'Corroded wiring and pipe salvage from abandoned forest substations. The fungus on it is harmless. Mostly.',
    icon: '🔸',
    zone: 'forest',
    basePriceFiat: 370,
    harvestSeconds: 3,
    weight: 2,
    color: 'rgba(200,140,60,0.15)',
  },
  {
    id: 'waste_iron',
    name: 'WASTE IRON',
    lore: 'Scavenged from wasteland wreckage — twisted frames, broken weapons, old vehicles. Barely viable. Still pays.',
    icon: '⚙️',
    zone: 'wasteland',
    basePriceFiat: 460,
    harvestSeconds: 4,
    weight: 3,
    color: 'rgba(120,100,60,0.18)',
  },
  {
    id: 'void_crystal',
    name: 'VOID CRYSTAL',
    lore: 'Deep wasteland anomaly — pure-black faceted clusters that absorb light. The Corp buys every gram. No questions asked.',
    icon: '🌑',
    zone: 'wasteland',
    basePriceFiat: 1600,
    harvestSeconds: 8,
    weight: 1,
    color: 'rgba(40,0,80,0.22)',
  },
];

export function getResourceDef(id: string): ResourceDef | undefined {
  return RESOURCE_CATALOG.find(r => r.id === id);
}
