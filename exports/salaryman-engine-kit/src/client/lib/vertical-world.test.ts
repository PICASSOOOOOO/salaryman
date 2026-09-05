import { describe, expect, it } from 'vitest';
import {
  UNDERGROUND_ENTRY,
  UNDERGROUND_POIS,
  isUndergroundPoint,
  isUndergroundTile,
  parseLayerTile,
  surfaceTileId,
  undergroundTileId,
} from './vertical-world';

describe('vertical world layers', () => {
  it('keeps legacy surface tiles unprefixed', () => {
    expect(surfaceTileId(6900, 7380)).toBe('26,28');
  });

  it('namespaces underground exploration independently', () => {
    expect(undergroundTileId(6900, 7380)).toBe('u:26,28');
    expect(isUndergroundTile('u:26,28')).toBe(true);
    expect(isUndergroundTile('26,28')).toBe(false);
  });

  it('parses both layer formats', () => {
    expect(parseLayerTile('26,28')).toEqual({ layer: 'surface', x: 26, y: 28 });
    expect(parseLayerTile('u:26,28')).toEqual({ layer: 'underground', x: 26, y: 28 });
    expect(parseLayerTile('not-a-tile')).toBeNull();
  });

  it('places the entry and every landmark inside the playable district', () => {
    expect(isUndergroundPoint(UNDERGROUND_ENTRY.x, UNDERGROUND_ENTRY.y)).toBe(true);
    expect(UNDERGROUND_POIS.length).toBeGreaterThanOrEqual(5);
    for (const poi of UNDERGROUND_POIS) {
      expect(isUndergroundPoint(poi.x, poi.y), poi.id).toBe(true);
    }
  });
});