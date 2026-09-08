export const LIVE_OFFICE_MIN_SCALE = 3.15;

export function getOfficeCameraScale({
  surveillance,
  viewportWidth,
  viewportHeight,
  floorWidthTiles,
  floorHeightTiles,
}: {
  surveillance: boolean;
  viewportWidth: number;
  viewportHeight: number;
  floorWidthTiles: number;
  floorHeightTiles: number;
}): number {
  if (surveillance) {
    const fitW = viewportWidth / (floorWidthTiles * 16);
    const fitH = viewportHeight / (floorHeightTiles * 16);
    return Math.max(0.2, Math.min(fitW, fitH));
  }
  return Math.max(LIVE_OFFICE_MIN_SCALE, viewportHeight / (floorHeightTiles * 16));
}