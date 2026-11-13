import unittest

from pygame_sim.objects import OfficeObject, OfficeObjectRegistry


class CollisionIndexTests(unittest.TestCase):
    def setUp(self):
        self.registry = OfficeObjectRegistry()

    def add(self, object_id, room, position, half_extents):
        self.registry.add(
            OfficeObject(
                object_id,
                "desk",
                object_id,
                room,
                position,
                "",
                solid_half_extents=half_extents,
            ),
            scale_legacy_coordinates=False,
        )

    def test_spatial_candidates_match_brute_force_overlap_across_cells(self):
        objects = [
            ("a", "lobby", (-1_000, -1_000), (420, 280)),
            ("b", "lobby", (950, 950), (300, 150)),
            ("c", "lobby", (2_100, 2_850), (700, 800)),
            ("d", "recreation", (1_000, 1_000), (200, 300)),
            ("e", "lobby", (5_500, 5_500), (0, 0)),
        ]
        for object_id, room, position, extents in objects:
            self.add(object_id, room, position, extents)

        player_half_extents = (90, 90)
        for room in ("lobby", "recreation", "empty"):
            for x in range(-1_300, 6_201, 250):
                for y in range(-1_300, 6_201, 250):
                    candidates = self.registry.collision_candidates(
                        room, (x, y), player_half_extents
                    )
                    actual = {
                        item.id
                        for item in candidates
                        if abs(x - item.visual_position[0])
                        <= player_half_extents[0] + item.collision_half_extents[0]
                        and abs(y - item.visual_position[1])
                        <= player_half_extents[1] + item.collision_half_extents[1]
                    }
                    expected = {
                        object_id
                        for object_id, object_room, (object_x, object_y), (half_x, half_y)
                        in objects
                        if object_room == room
                        and half_x > 0
                        and half_y > 0
                        and abs(x - object_x) <= player_half_extents[0] + half_x
                        and abs(y - object_y) <= player_half_extents[1] + half_y
                    }
                    self.assertEqual(actual, expected, (room, x, y))

    def test_add_replace_remove_and_replace_all_keep_index_current(self):
        self.add("moving-desk", "lobby", (500, 500), (300, 150))
        self.assertEqual(
            [item.id for item in self.registry.collision_candidates(
                "lobby", (500, 500), (90, 90)
            )],
            ["moving-desk"],
        )

        moved = OfficeObject(
            "moving-desk", "desk", "moving-desk", "lobby", (5_000, 5_000), "",
            solid_half_extents=(300, 150),
        )
        self.assertTrue(self.registry.replace("moving-desk", moved))
        self.assertEqual(
            self.registry.collision_candidates("lobby", (500, 500), (90, 90)),
            (),
        )
        self.assertEqual(
            [item.id for item in self.registry.collision_candidates(
                "lobby", (5_000, 5_000), (90, 90)
            )],
            ["moving-desk"],
        )

        self.add("new-desk", "lobby", (5_000, 5_000), (100, 100))
        self.assertEqual(
            {item.id for item in self.registry.collision_candidates(
                "lobby", (5_000, 5_000), (90, 90)
            )},
            {"moving-desk", "new-desk"},
        )
        self.registry.remove("new-desk")
        self.assertEqual(
            [item.id for item in self.registry.collision_candidates(
                "lobby", (5_000, 5_000), (90, 90)
            )],
            ["moving-desk"],
        )

        replacement = OfficeObject(
            "replacement", "desk", "replacement", "recreation", (1_000, 1_000), "",
            solid_half_extents=(200, 200),
        )
        self.registry.replace_all([replacement])
        self.assertEqual(
            self.registry.collision_candidates("lobby", (5_000, 5_000), (90, 90)),
            (),
        )
        self.assertEqual(
            [item.id for item in self.registry.collision_candidates(
                "recreation", (1_000, 1_000), (90, 90)
            )],
            ["replacement"],
        )

    def test_non_collidable_objects_are_not_indexed(self):
        self.add("prop", "lobby", (400, 400), (0, 0))
        self.assertEqual(
            self.registry.collision_candidates("lobby", (400, 400), (90, 90)),
            (),
        )


if __name__ == "__main__":
    unittest.main()
