export type TowerShopPricingPolicy = {
  baseWholesaleBps: number;
  minWholesaleBps: number;
  maxWholesaleBps: number;
  minDemandSupplyRatioBps: number;
  maxDemandSupplyRatioBps: number;
  supplierCostBps: number;
  deliveryBaseFiat: number;
  deliveryPerItemFiat: number;
};

// These defaults are deliberately centralized so balancing does not change settlement code.
export const DEFAULT_TOWER_SHOP_PRICING_POLICY: TowerShopPricingPolicy = {
  baseWholesaleBps: 6_500,
  minWholesaleBps: 4_000,
  maxWholesaleBps: 9_000,
  minDemandSupplyRatioBps: 5_000,
  maxDemandSupplyRatioBps: 15_000,
  supplierCostBps: 8_500,
  deliveryBaseFiat: 250,
  deliveryPerItemFiat: 50,
};

export type TowerShopOrderQuoteInput = {
  retailUnitPriceFiat: number;
  quantity: number;
  btcMultiplierBps: number;
  demandIndex: number;
  supplyIndex: number;
  policy?: TowerShopPricingPolicy;
};

export type TowerShopOrderQuote = {
  wholesaleRateBps: number;
  marketRetailUnitFiat: number;
  goodsCostFiat: number;
  deliveryFeeFiat: number;
  shopTotalFiat: number;
  supplierCostFiat: number;
  shippingCompanyMarginFiat: number;
};

function requireInteger(name: string, value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
}

export function quoteTowerShopOrder(input: TowerShopOrderQuoteInput): TowerShopOrderQuote {
  const policy = input.policy ?? DEFAULT_TOWER_SHOP_PRICING_POLICY;
  requireInteger("retailUnitPriceFiat", input.retailUnitPriceFiat, 1, 1_000_000_000);
  requireInteger("quantity", input.quantity, 1, 1_000_000);
  requireInteger("btcMultiplierBps", input.btcMultiplierBps, 4_000, 40_000);
  requireInteger("demandIndex", input.demandIndex, 0, 10_000);
  requireInteger("supplyIndex", input.supplyIndex, 0, 10_000);
  requireInteger("baseWholesaleBps", policy.baseWholesaleBps, 1, 10_000);
  requireInteger("minWholesaleBps", policy.minWholesaleBps, 1, 10_000);
  requireInteger("maxWholesaleBps", policy.maxWholesaleBps, policy.minWholesaleBps, 10_000);
  requireInteger("minDemandSupplyRatioBps", policy.minDemandSupplyRatioBps, 1, 100_000);
  requireInteger("maxDemandSupplyRatioBps", policy.maxDemandSupplyRatioBps, policy.minDemandSupplyRatioBps, 100_000);
  requireInteger("supplierCostBps", policy.supplierCostBps, 0, 10_000);
  requireInteger("deliveryBaseFiat", policy.deliveryBaseFiat, 0, 1_000_000_000);
  requireInteger("deliveryPerItemFiat", policy.deliveryPerItemFiat, 0, 1_000_000_000);

  const demandSupplyRatioBps = input.supplyIndex === 0
    ? policy.maxDemandSupplyRatioBps
    : Math.max(
      policy.minDemandSupplyRatioBps,
      Math.min(
        policy.maxDemandSupplyRatioBps,
        Math.round((input.demandIndex * 10_000) / input.supplyIndex),
      ),
    );
  const wholesaleRateBps = Math.max(
    policy.minWholesaleBps,
    Math.min(
      policy.maxWholesaleBps,
      Math.round((policy.baseWholesaleBps * demandSupplyRatioBps) / 10_000),
    ),
  );
  const marketRetailUnitFiat = Math.max(
    1,
    Math.round((input.retailUnitPriceFiat * input.btcMultiplierBps) / 10_000),
  );
  const goodsCostFiat = Math.ceil(
    (marketRetailUnitFiat * input.quantity * wholesaleRateBps) / 10_000,
  );
  const deliveryFeeFiat = Math.ceil(
    ((policy.deliveryBaseFiat + policy.deliveryPerItemFiat * input.quantity) * input.btcMultiplierBps) / 10_000,
  );
  const shopTotalFiat = goodsCostFiat + deliveryFeeFiat;
  const supplierCostFiat = Math.ceil((goodsCostFiat * policy.supplierCostBps) / 10_000);
  const shippingCompanyMarginFiat = shopTotalFiat - supplierCostFiat;

  if (![goodsCostFiat, deliveryFeeFiat, shopTotalFiat, supplierCostFiat, shippingCompanyMarginFiat]
    .every(Number.isSafeInteger)) {
    throw new Error("Tower shop order quote exceeds safe integer range");
  }

  return {
    wholesaleRateBps,
    marketRetailUnitFiat,
    goodsCostFiat,
    deliveryFeeFiat,
    shopTotalFiat,
    supplierCostFiat,
    shippingCompanyMarginFiat,
  };
}
