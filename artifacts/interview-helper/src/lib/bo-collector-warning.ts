export type BOCollectorPos = { x: number; y: number };

export interface BOWarningResult {
  shouldWarn: boolean;
  nearDist: number;
  nearAngle: number;
  nearX: number;
  nearY: number;
}

/**
 * Pure helper: decide whether the Banco Ombra screen-edge warning indicator
 * should fire and, if so, at what distance/angle/position.
 *
 * Extracted from the WorldPlay canvas loop so it can be unit-tested without a
 * DOM or canvas context.
 *
 * Safe-zone logic mirrors the inline render code:
 *   - no collectors present            → no warning
 *   - player inside their home         → no warning (hamletBuildingId match)
 *   - player inside an office building → no warning (isOfficeBid returns true)
 *   - nearest collector ≥ 150 units    → no warning
 *   - nearest collector < 150 units    → warning (shouldWarn = true)
 *
 * @param boCollectors     Active collector world-positions
 * @param px               Player world-x
 * @param py               Player world-y
 * @param interior         Current interior ({bid}) or null when outdoors
 * @param hamletBuildingId Player's registered home building id
 * @param isOfficeBid      Returns true for building ids that are office safe-zones
 */
export function computeBoWarning(
  boCollectors: BOCollectorPos[],
  px: number,
  py: number,
  interior: { bid: string } | null,
  hamletBuildingId: string,
  isOfficeBid: (bid: string) => boolean,
): BOWarningResult {
  if (boCollectors.length === 0) {
    return { shouldWarn: false, nearDist: Infinity, nearAngle: 0, nearX: 0, nearY: 0 };
  }

  const bid = interior?.bid ?? '';
  const safe = !!interior && (bid === hamletBuildingId || isOfficeBid(bid));
  if (safe) {
    return { shouldWarn: false, nearDist: Infinity, nearAngle: 0, nearX: 0, nearY: 0 };
  }

  let nearDist = Infinity;
  let nearAngle = 0;
  let nearX = 0;
  let nearY = 0;
  for (const bc of boCollectors) {
    const d = Math.hypot(bc.x - px, bc.y - py);
    if (d < nearDist) {
      nearDist = d;
      nearAngle = Math.atan2(bc.y - py, bc.x - px);
      nearX = bc.x;
      nearY = bc.y;
    }
  }

  return { shouldWarn: nearDist < 150, nearDist, nearAngle, nearX, nearY };
}
