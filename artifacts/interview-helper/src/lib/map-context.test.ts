// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { clearMapContext, getMapContext, setBuildingMapContext, setMapContext } from './map-context';
import { getOfficeFloorPlan } from './office-floor-plan';
import { OFFICE_STATION_LAYOUT, OFFICE_TIER_FLOOR } from './office-layout';

describe('map context', () => {
  beforeEach(() => sessionStorage.clear());

  it('stores the office as the current building context', () => {
    setMapContext({
      kind: 'office',
      buildingId: 'salaryman_office',
      buildingLabel: 'OPERATIONS FLOOR',
      officeTier: 'studio',
    });

    expect(getMapContext()).toMatchObject({
      kind: 'office',
      buildingId: 'salaryman_office',
      officeTier: 'studio',
    });
  });

  it('hands a dynamic interior definition to the map and clears it on exit', () => {
    const plan = getOfficeFloorPlan('capsule');
    setBuildingMapContext('tower', 'TOWER — FL 02', '_office_floor', plan, 2);

    expect(getMapContext()).toMatchObject({
      kind: 'building',
      buildingId: 'tower',
      floor: 2,
      floorPlan: { id: 'salaryman_office', width: 352 },
    });

    clearMapContext();
    expect(getMapContext()).toBeNull();
  });

  it('rejects malformed persisted floor plans', () => {
    sessionStorage.setItem('sm_map_context', JSON.stringify({
      kind: 'building',
      buildingId: 'tower',
      buildingLabel: 'TOWER',
      interiorKey: '_office_floor',
      floorPlan: { id: 'broken' },
    }));

    expect(getMapContext()).toBeNull();
  });
});

describe('office floor plan', () => {
  it('uses the same station coordinates and tier counts as the playable office', () => {
    const tier = OFFICE_TIER_FLOOR.coworking;
    const plan = getOfficeFloorPlan('coworking');

    for (const station of OFFICE_STATION_LAYOUT) {
      const object = plan.objects.find((candidate) => candidate.label === station.label);
      expect(object).toMatchObject({
        x: station.col * 16 - 16,
        y: station.row * 16 - 16,
      });
    }

    expect(plan.objects.filter((object) => object.type === 'desk')).toHaveLength(tier.deskCols * tier.deskRows);
    expect(plan.objects.filter((object) => object.type === 'storage_locker')).toHaveLength(tier.capsules);
  });
});