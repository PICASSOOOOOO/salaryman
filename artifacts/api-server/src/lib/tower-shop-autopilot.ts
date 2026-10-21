export const NPC_SHOP_REORDER_THRESHOLD_UNITS = 4;
export const NPC_SHOP_REORDER_TARGET_UNITS = 12;

export function chooseNpcShopRestockItem(args: {
  itemIds: string[];
  stockByItem: Map<string, number>;
  storageCapacityByItem: Map<string, number>;
  blockedItemIds?: Set<string>;
}): { itemId: string; quantity: number } | null {
  const candidates = args.itemIds.flatMap((itemId, listingOrder) => {
    if (args.blockedItemIds?.has(itemId)) return [];
    const onHand = Math.max(0, args.stockByItem.get(itemId) ?? 0);
    if (onHand > NPC_SHOP_REORDER_THRESHOLD_UNITS) return [];
    const capacity = Math.max(0, args.storageCapacityByItem.get(itemId) ?? 1_000);
    const quantity = Math.min(NPC_SHOP_REORDER_TARGET_UNITS - onHand, capacity - onHand);
    return quantity > 0 ? [{ itemId, quantity, onHand, listingOrder }] : [];
  });
  candidates.sort((a, b) => a.onHand - b.onHand || a.listingOrder - b.listingOrder);
  const selected = candidates[0];
  return selected ? { itemId: selected.itemId, quantity: selected.quantity } : null;
}
