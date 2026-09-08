import { describe, expect, it } from 'vitest';
import {
  filterOrgConstructionProjects,
  type ConstructionProjectSummary,
} from './ConstructionOverview';

function project(id: number, owningOrgId: string | null): ConstructionProjectSummary {
  return {
    id,
    plotId: id,
    ownerId: `owner-${id}`,
    buildingType: 'office',
    label: `Project ${id}`,
    laborRequired: 100,
    laborApplied: 0,
    progress: 0,
    status: 'queued',
    owningOrgId,
    owningOrgName: owningOrgId ? `Org ${owningOrgId}` : null,
  };
}

describe('organization construction filtering', () => {
  it('keeps only projects associated with the selected organization', () => {
    const projects = [project(1, '12'), project(2, '13'), project(3, null), project(4, '12')];
    expect(filterOrgConstructionProjects(projects, 12).map((row) => row.id)).toEqual([1, 4]);
  });

  it('does not treat personal projects as organization-owned', () => {
    expect(filterOrgConstructionProjects([project(1, null)], 12)).toEqual([]);
  });
});