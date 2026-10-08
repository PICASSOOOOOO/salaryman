from __future__ import annotations

from collections import deque
import unittest

from pygame_sim.objects import build_tower_object_registry
from pygame_sim.scene import FLOOR_PLAN, TowerScene
from pygame_sim.state import OfficeState


def maze_cells(level: int) -> set[tuple[int, int]]:
    room = next(room for room in FLOOR_PLAN["rooms"] if room["id"] == f"basement_b{level}")
    return {tuple(cell) for cell in room["mazeCells"]}


class BasementMazeTests(unittest.TestCase):
    def test_tunnel_routes_are_connected_and_have_dead_ends(self) -> None:
        for level in (4, 5, 6):
            cells = maze_cells(level)
            self.assertIn((5, 5), cells)
            visited: set[tuple[int, int]] = set()
            pending = deque([(5, 5)])
            while pending:
                current = pending.popleft()
                if current in visited:
                    continue
                visited.add(current)
                x, y = current
                pending.extend(
                    neighbor
                    for neighbor in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                    if neighbor in cells and neighbor not in visited
                )
            self.assertEqual(visited, cells)

            dead_ends = [
                cell for cell in cells
                if sum(
                    (cell[0] + dx, cell[1] + dy) in cells
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                ) == 1
            ]
            self.assertTrue(dead_ends)

    def test_simulation_walkability_uses_the_tunnel_cells(self) -> None:
        scene = TowerScene()
        blocked_points = {
            4: (3_500, 3_500),
            5: (3_500, 4_500),
            6: (3_500, 4_500),
        }
        for level in (4, 5, 6):
            self.assertTrue(scene.select_basement_level(level))
            self.assertTrue(scene._room_position_is_walkable((5_000, 5_000)))
            self.assertFalse(scene._room_position_is_walkable(blocked_points[level]))

    def test_basement_stairs_and_utility_stations_land_inside_the_tunnels(self) -> None:
        registry = build_tower_object_registry()
        for level in (4, 5, 6):
            room = f"basement_b{level}"
            cells = maze_cells(level)
            for object_id in (f"basement-stairs-up-b{level}", f"basement-stairs-down-b{level}"):
                stair = registry.get(object_id)
                if level == 6 and object_id.endswith("down-b6"):
                    self.assertIsNone(stair)
                    continue
                self.assertIsNotNone(stair)
                assert stair is not None
                self.assertIn((stair.position[0] // 1_000, stair.position[1] // 1_000), cells)
            for item in registry.objects:
                if item.room == room and item.kind == "utility_station":
                    self.assertIn((item.position[0] // 1_000, item.position[1] // 1_000), cells)
            self.assertTrue(any(item.id.startswith(f"basement-b{level}-maze-") for item in registry.objects))

    def test_ghost_is_a_reachable_physical_interaction_with_a_conversation_page(self) -> None:
        scene = TowerScene()
        self.assertTrue(scene.select_basement_level(4))
        scene.set_basement_snapshot({
            "level": 4,
            "ghost": {
                "id": "tower-ghost",
                "x": 7_500,
                "y": 3_500,
                "location": "SUPPLY TUNNEL",
            },
        })
        self.assertIsNotNone(scene.objects.get("tower-ghost"))
        state = OfficeState()
        far_result = scene.interact(state, "tower-ghost")
        self.assertFalse(far_result.success)
        self.assertIsNone(state.active_page)
        scene.player_position = (7_500, 3_500)

        result = scene.interact(state, "tower-ghost")

        self.assertTrue(result.success)
        self.assertEqual(result.route, "merchant")
        self.assertEqual(state.active_page, "merchant")
        self.assertEqual(scene.objects.get("tower-ghost").label, "THE GHOST")  # type: ignore[union-attr]


if __name__ == "__main__":
    unittest.main()
