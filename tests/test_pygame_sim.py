import unittest

from pygame_sim.models import Worker
from pygame_sim.state import OfficeState, SECONDS_PER_WORKSPACE_HOUR


class PygameSimulationTests(unittest.TestCase):
    def test_two_real_seconds_advance_one_workspace_hour_and_generate_output(self):
        state = OfficeState.with_default_roster()
        opening = state.funds

        state.update(SECONDS_PER_WORKSPACE_HOUR)

        self.assertEqual(state.hour, 10)
        self.assertEqual(state.day, 1)
        self.assertGreater(state.funds, opening)
        self.assertEqual(state.hours_completed_today, 1)

    def test_end_of_shift_pays_wages_once_then_next_tick_starts_next_day(self):
        state = OfficeState.with_default_roster()
        opening = state.funds

        for _ in range(8):
            state.advance_workspace_hour()

        self.assertEqual(state.hour, 17)
        self.assertLess(state.funds, opening + state.total_output)
        wages_after_settlement = state.total_wages_paid
        state.advance_workspace_hour()

        self.assertEqual(state.day, 2)
        self.assertEqual(state.hour, 9)
        self.assertEqual(state.total_wages_paid, 0.0)
        self.assertGreater(wages_after_settlement, 0)

    def test_coffee_boundary_checks_funds_and_recovers_stamina(self):
        state = OfficeState.with_default_roster()
        worker = state.roster.workers[0]
        worker.stamina = 30.0
        state.funds = worker.coffee_cost - 1

        self.assertFalse(worker.buy_coffee(state))
        self.assertEqual(worker.stamina, 30.0)

        state.funds = worker.coffee_cost
        self.assertTrue(worker.buy_coffee(state))
        self.assertGreater(worker.stamina, 30.0)
        self.assertEqual(state.funds, 0.0)

    def test_stamina_gauge_thresholds_are_contextual(self):
        worker = Worker("Test", "ROLE", 10, 5, (1, 2, 3))
        worker.stamina = 80
        self.assertEqual(worker.stamina_state, "emerald")
        worker.stamina = 45
        self.assertEqual(worker.stamina_state, "warning")
        worker.stamina = 10
        self.assertEqual(worker.stamina_state, "depletion")

    def test_desk_drawer_is_clickable_state_not_simulation_time(self):
        state = OfficeState.with_default_roster()
        self.assertFalse(state.drawer_open)
        state.toggle_drawer()
        self.assertTrue(state.drawer_open)
        state.update(SECONDS_PER_WORKSPACE_HOUR)
        self.assertTrue(state.drawer_open)
        state.reset()
        self.assertFalse(state.drawer_open)


if __name__ == "__main__":
    unittest.main()