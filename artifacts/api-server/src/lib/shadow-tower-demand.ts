export const PUBLIC_SALE_FLOOR_FROM = 5;
export const PUBLIC_SALE_FLOOR_TO = 62;
export const PUBLIC_SALE_FLOOR_COUNT = PUBLIC_SALE_FLOOR_TO - PUBLIC_SALE_FLOOR_FROM + 1;
export const OFFICES_PER_FLOOR = 4;
export const TOTAL_PUBLIC_OFFICES = PUBLIC_SALE_FLOOR_COUNT * OFFICES_PER_FLOOR;
export const RELEASE_BATCH_SIZE = OFFICES_PER_FLOOR;
export const INITIAL_RELEASED_OFFICES = RELEASE_BATCH_SIZE;
export const MAX_VISIBLE_OFFICES = 40;

export const INTEREST_WEIGHTS = {
  view: 1,
  watch: 4,
  inquiry: 8,
} as const;

export type InterestKind = keyof typeof INTEREST_WEIGHTS;

export type DemandInput = {
  views: number;
  watches: number;
  inquiries: number;
  occupiedOffices: number;
  highestOccupiedOrdinal?: number;
};

export type DemandSnapshot = DemandInput & {
  weightedInterest: number;
  releaseTarget: number;
  demandMultiplier: number;
  pressure: "quiet" | "warming" | "competitive";
};

const integerAtLeastZero = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function calculateShadowTowerDemand(input: DemandInput): DemandSnapshot {
  const views = integerAtLeastZero(input.views);
  const watches = integerAtLeastZero(input.watches);
  const inquiries = integerAtLeastZero(input.inquiries);
  const occupiedOffices = integerAtLeastZero(input.occupiedOffices);
  const weightedInterest =
    views * INTEREST_WEIGHTS.view
    + watches * INTEREST_WEIGHTS.watch
    + inquiries * INTEREST_WEIGHTS.inquiry;

  // One four-office tranche opens at launch. Each additional 24 weighted
  // interest points unlocks exactly one more four-office tranche.
  const interestTranches = Math.floor(weightedInterest / 24);
  const requestedTarget = INITIAL_RELEASED_OFFICES + interestTranches * RELEASE_BATCH_SIZE;
  const occupiedFloor = integerAtLeastZero(input.highestOccupiedOrdinal ?? 0);
  const releaseTarget = clamp(
    Math.max(requestedTarget, occupiedOffices, occupiedFloor),
    INITIAL_RELEASED_OFFICES,
    Math.min(MAX_VISIBLE_OFFICES, TOTAL_PUBLIC_OFFICES),
  );
  const pressureRatio = weightedInterest / Math.max(INITIAL_RELEASED_OFFICES, releaseTarget);
  const demandMultiplier = Number(clamp(1 + pressureRatio * 0.08, 1, 1.75).toFixed(4));
  const pressure = pressureRatio >= 8 ? "competitive" : pressureRatio >= 2 ? "warming" : "quiet";

  return {
    views,
    watches,
    inquiries,
    occupiedOffices,
    highestOccupiedOrdinal: occupiedFloor,
    weightedInterest,
    releaseTarget,
    demandMultiplier,
    pressure,
  };
}

export function isPublicSaleFloor(floorNumber: number) {
  return Number.isInteger(floorNumber)
    && floorNumber >= PUBLIC_SALE_FLOOR_FROM
    && floorNumber <= PUBLIC_SALE_FLOOR_TO;
}

export function officeOrdinal(floorNumber: number, unitNumber: number) {
  return (floorNumber - PUBLIC_SALE_FLOOR_FROM) * OFFICES_PER_FLOOR + (unitNumber - 1);
}

export function isReleasedOffice(floorNumber: number, unitNumber: number, releaseTarget: number) {
  return isPublicSaleFloor(floorNumber)
    && Number.isInteger(unitNumber)
    && unitNumber >= 1
    && unitNumber <= OFFICES_PER_FLOOR
    && officeOrdinal(floorNumber, unitNumber) < releaseTarget;
}