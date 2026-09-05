// Shared item rarity vocabulary for inventory, weapons, terminals, furniture.
// Tables that hold items should adopt these as varchar columns (e.g. `rarity`)
// + an `is_collectable` boolean. Collectables are a separate group that can
// overlap with TRASH (most collectables are technically "trash" by raw value
// but valuable as part of a set).
export const ITEM_RARITIES = [
  "trash",
  "common",
  "expensive",
  "rare",
  "very_rare",
  "legendary",
] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const RARITY_DROPS_ON_DEATH: Record<ItemRarity, boolean> = {
  trash: true,
  common: true,
  expensive: true,
  rare: false,
  very_rare: false,
  legendary: false,
};

export const RARITY_LABEL: Record<ItemRarity, string> = {
  trash: "TRASH",
  common: "COMMON",
  expensive: "EXPENSIVE",
  rare: "RARE",
  very_rare: "VERY RARE",
  legendary: "LEGENDARY",
};

export const RARITY_COLOR: Record<ItemRarity, string> = {
  trash: "#71717a",
  common: "#a1a1aa",
  expensive: "#22c55e",
  rare: "#3b82f6",
  very_rare: "#a855f7",
  legendary: "#f59e0b",
};
