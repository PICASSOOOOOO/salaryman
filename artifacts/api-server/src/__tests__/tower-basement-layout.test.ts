import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getTowerGhostHideout,
  isTowerBasementMazePointWalkable,
  isTowerBasementMazeSegmentWalkable,
  TOWER_BASEMENT_MAZES,
  TOWER_BASEMENT_BACK_ENTRANCE,
  TOWER_GHOST_HIDEOUTS,
  TOWER_LOBBY_BACK_ENTRANCE,
} from "../lib/tower-basement-layout";

type FloorPlan = {
  rooms: Array<{ id: string; mazeCells?: number[][] }>;
  businessSuiteLayout: {
    lobbyBackEntrance: number[];
    b1: { exteriorGate: number[] };
  };
};

const floorPlan = JSON.parse(
  readFileSync(new URL("../../../../godot/office-client/floor_plan.json", import.meta.url), "utf8"),
) as FloorPlan;

function key([x, y]: readonly [number, number]): string {
  return `${x},${y}`;
}

describe("Tower basement maze layout", () => {
  it("keeps the B1 exterior gate and lobby rear door aligned with the server route", () => {
    expect(TOWER_BASEMENT_BACK_ENTRANCE).toEqual({
      level: 1,
      x: floorPlan.businessSuiteLayout.b1.exteriorGate[0],
      y: floorPlan.businessSuiteLayout.b1.exteriorGate[1],
    });
    expect(TOWER_LOBBY_BACK_ENTRANCE).toEqual({
      x: floorPlan.businessSuiteLayout.lobbyBackEntrance[0],
      y: floorPlan.businessSuiteLayout.lobbyBackEntrance[1],
    });
    expect(isTowerBasementMazePointWalkable(
      TOWER_BASEMENT_BACK_ENTRANCE.level,
      TOWER_BASEMENT_BACK_ENTRANCE.x,
      TOWER_BASEMENT_BACK_ENTRANCE.y,
    )).toBe(true);
  });

  it("matches the Godot floor plan and keeps every corridor connected to the stair landing", () => {
    for (const [levelText, cells] of Object.entries(TOWER_BASEMENT_MAZES)) {
      const level = Number(levelText);
      const room = floorPlan.rooms.find((candidate) => candidate.id === `basement_b${level}`);
      expect(room?.mazeCells?.map((cell) => key(cell as [number, number])).sort())
        .toEqual(cells.map(key).sort());
      expect(isTowerBasementMazePointWalkable(level, 5_000, 5_000)).toBe(true);

      const known = new Set(cells.map(key));
      const visited = new Set<string>();
      const queue: Array<readonly [number, number]> = [[5, 5]];
      while (queue.length > 0) {
        const [x, y] = queue.shift()!;
        const current = key([x, y]);
        if (visited.has(current)) continue;
        visited.add(current);
        for (const neighbor of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
          if (known.has(key(neighbor)) && !visited.has(key(neighbor))) queue.push(neighbor);
        }
      }
      expect(visited).toEqual(known);
      expect(cells.some((cell) => {
        const [x, y] = cell;
        const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        return neighbors.filter((neighbor) => known.has(key(neighbor as [number, number]))).length === 1;
      })).toBe(true);
    }
  });

  it("rejects off-corridor and diagonal wall-cutting movement", () => {
    expect(isTowerBasementMazePointWalkable(4, 3_500, 3_500)).toBe(false);
    expect(isTowerBasementMazePointWalkable(4, 5_000, 5_000)).toBe(true);
    expect(isTowerBasementMazePointWalkable(7, 5_000, 5_000)).toBe(false);
    expect(isTowerBasementMazeSegmentWalkable(4, { x: 5_500, y: 5_500 }, { x: 7_500, y: 5_500 })).toBe(true);
    expect(isTowerBasementMazeSegmentWalkable(4, { x: 5_500, y: 5_500 }, { x: 6_500, y: 3_500 })).toBe(false);
  });

  it("rotates the Ghost only among reachable lower-floor, stairwell, and rear-shipping hideouts", () => {
    for (const hideout of TOWER_GHOST_HIDEOUTS) {
      expect(isTowerBasementMazePointWalkable(hideout.level, hideout.x, hideout.y)).toBe(true);
    }
    expect(getTowerGhostHideout(new Date(0))).toEqual(TOWER_GHOST_HIDEOUTS[0]);
    expect(getTowerGhostHideout(new Date(10 * 60 * 1_000))).toEqual(TOWER_GHOST_HIDEOUTS[1]);
  });
});
