export const NPC_SHOP_REORDER_THRESHOLD_UNITS = 4;
export const NPC_SHOP_REORDER_TARGET_UNITS = 12;
export const NPC_SHOP_SHELF_RESTOCK_THRESHOLD_UNITS = 4;
export const NPC_SHOP_SHELF_TARGET_UNITS = 20;

export function chooseNpcShelfRestock(args: {
  stored: number;
  shelf: number;
  shelfCapacity: number;
}): number {
  const stored = Math.max(0, args.stored);
  const shelf = Math.max(0, args.shelf);
  const capacity = Math.max(0, args.shelfCapacity);
  if (shelf > NPC_SHOP_SHELF_RESTOCK_THRESHOLD_UNITS) return 0;
  return Math.max(0, Math.min(
    NPC_SHOP_SHELF_TARGET_UNITS - shelf,
    capacity - shelf,
    stored,
  ));
}

export function listNpcShopRestockCandidates(args: {
  itemIds: string[];
  stockByItem: Map<string, number>;
  storageCapacityByItem: Map<string, number>;
  blockedItemIds?: Set<string>;
  priorityItemIds?: Set<string>;
}): Array<{ itemId: string; quantity: number }> {
  const candidates = args.itemIds.flatMap((itemId, listingOrder) => {
    if (args.blockedItemIds?.has(itemId)) return [];
    const onHand = Math.max(0, args.stockByItem.get(itemId) ?? 0);
    if (onHand > NPC_SHOP_REORDER_THRESHOLD_UNITS) return [];
    const capacity = Math.max(0, args.storageCapacityByItem.get(itemId) ?? 1_000);
    const quantity = Math.min(NPC_SHOP_REORDER_TARGET_UNITS - onHand, capacity - onHand);
    const priority = args.priorityItemIds?.has(itemId) ? 0 : 1;
    return quantity > 0 ? [{ itemId, quantity, onHand, listingOrder, priority }] : [];
  });
  candidates.sort((a, b) =>
    a.priority - b.priority || a.onHand - b.onHand || a.listingOrder - b.listingOrder);
  return candidates.map(({ itemId, quantity }) => ({ itemId, quantity }));
}

export function chooseNpcShopRestockItem(args: {
  itemIds: string[];
  stockByItem: Map<string, number>;
  storageCapacityByItem: Map<string, number>;
  blockedItemIds?: Set<string>;
  priorityItemIds?: Set<string>;
}): { itemId: string; quantity: number } | null {
  return listNpcShopRestockCandidates(args)[0] ?? null;
}
