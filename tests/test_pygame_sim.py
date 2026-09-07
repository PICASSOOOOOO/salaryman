import unittest
from datetime import datetime, timezone
from tempfile import TemporaryDirectory
from pathlib import Path

from pygame_sim.models import MINIMUM_HOURLY_FIAT, Worker
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
        self.assertGreater(state.roster.workers[0].stamina, 70.0)

    def test_end_of_shift_pays_wages_once_then_next_tick_starts_next_day(self):
        state = OfficeState.with_default_roster()
        state.policy.auto_breaks = False
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
        self.assertEqual(worker.stamina_state, "steady")
        worker.stamina = 45
        self.assertEqual(worker.stamina_state, "warming")
        worker.stamina = 10
        self.assertEqual(worker.stamina_state, "starting")

    def test_desk_drawer_is_clickable_state_not_simulation_time(self):
        state = OfficeState.with_default_roster()
        self.assertFalse(state.drawer_open)
        state.toggle_drawer()
        self.assertTrue(state.drawer_open)
        state.update(SECONDS_PER_WORKSPACE_HOUR)
        self.assertTrue(state.drawer_open)
        state.reset()
        self.assertFalse(state.drawer_open)

    def test_worker_selection_and_coffee_action_are_state_managed(self):
        state = OfficeState.with_default_roster()
        self.assertTrue(state.select_worker(1))
        self.assertEqual(state.selected_worker, 1)
        self.assertTrue(state.buy_coffee(1))
        self.assertIn("BREAK", state.notice)
        self.assertFalse(state.select_worker(99))

    def test_pause_resume_preserves_time_until_resumed(self):
        state = OfficeState.with_default_roster()
        state.toggle_running()
        state.update(SECONDS_PER_WORKSPACE_HOUR * 2)
        self.assertEqual(state.hour, 9)
        state.toggle_running()
        state.update(SECONDS_PER_WORKSPACE_HOUR)
        self.assertEqual(state.hour, 10)

    def test_workers_recover_between_days_so_stamina_cannot_soft_lock_the_run(self):
        state = OfficeState.with_default_roster()
        worker = state.roster.workers[0]
        worker.stamina = 8.0
        for _ in range(8):
            state.advance_workspace_hour()
        self.assertEqual(state.hour, 17)
        state.advance_workspace_hour()
        self.assertEqual(state.day, 2)
        self.assertEqual(worker.status_note, "READY FOR SHIFT")
        self.assertGreater(worker.stamina, 8.0)

    def test_decay_accumulates_and_maintenance_restores_capacity(self):
        state = OfficeState.with_default_roster()
        state.policy.auto_breaks = False
        starting_decay = state.decay
        state.advance_workspace_minutes(60)

        self.assertGreater(state.decay, starting_decay)
        self.assertLess(state.decay_efficiency_multiplier, 1.0)

        state.decay = 60.0
        funds_before = state.funds
        self.assertTrue(state.repair_decay())
        self.assertLess(state.decay, 60.0)
        self.assertLess(state.funds, funds_before)
        self.assertEqual(state.maintenance_runs, 1)

    def test_decay_persists_in_the_office_record(self):
        state = OfficeState.with_default_roster()
        state.decay = 47.5
        state.maintenance_runs = 3

        with TemporaryDirectory() as directory:
            path = Path(directory) / "office.json"
            state.save_to_file(path)
            restored = OfficeState.load_from_file(path)

        self.assertEqual(restored.decay, 47.5)
        self.assertEqual(restored.maintenance_runs, 3)

    def test_work_and_world_actions_gently_increase_stamina(self):
        state = OfficeState.with_default_roster()
        worker = state.roster.workers[0]
        worker.stamina = 40.0
        before = worker.stamina
        self.assertTrue(state.apply_action(0, "coworker_support"))
        self.assertGreater(worker.stamina, before)
        self.assertEqual(worker.status_note, "SUPPORTING COWORKER")
        after_support = worker.stamina
        self.assertTrue(state.apply_action(0, "defense"))
        self.assertGreater(worker.stamina, after_support)
        self.assertEqual(worker.status_note, "DEFENDING TEAM")
        self.assertTrue(state.apply_action(0, "offense"))
        self.assertLessEqual(worker.stamina, worker.max_stamina)

    def test_wages_respect_the_fiat_minimum_and_employer_rates_can_be_higher(self):
        minimum = Worker("Minimum", "ROLE", 10, 1, (1, 2, 3))
        higher = Worker("Higher", "ROLE", 10, 450, (1, 2, 3))
        self.assertEqual(minimum.hourly_wage_fiat, MINIMUM_HOURLY_FIAT)
        self.assertEqual(higher.hourly_wage_fiat, 450)

        state = OfficeState.with_default_roster()
        state.policy.auto_breaks = False
        opening = state.funds
        for _ in range(8):
            state.advance_workspace_hour()
        self.assertLess(state.funds, opening + state.total_output)
        self.assertGreater(state.total_wages_paid, 0)
        self.assertGreater(state.roster.workers[0].wealth_fiat, 300)

    def test_npcs_get_hungry_and_eat_from_personal_wealth(self):
        state = OfficeState.with_default_roster()
        worker = state.roster.workers[0]
        worker.hunger = 88
        wealth_before = worker.wealth_fiat
        state.roster.work_hour(state, 9)
        self.assertEqual(worker.hunger, 100)
        state.start_break("lunch")
        self.assertLess(worker.hunger, 100)
        self.assertLess(worker.wealth_fiat, wealth_before)
        self.assertEqual(worker.meals_eaten_today, 1)

    def test_low_wealth_npcs_still_eat_without_stalling_the_shift(self):
        state = OfficeState.with_default_roster()
        worker = state.roster.workers[0]
        worker.wealth_fiat = 0
        worker.hunger = 95
        state.start_break("lunch")
        self.assertLess(worker.hunger, 95)
        self.assertLess(worker.wealth_fiat, 0)

    def test_real_clock_runs_npc_meals_and_wage_growth(self):
        state = OfficeState.with_default_roster(real_time=True)
        first_worker = state.roster.workers[0]
        initial_wealth = first_worker.wealth_fiat
        day = datetime(2026, 9, 6, tzinfo=timezone.utc)

        state.sync_real_time(day.replace(hour=9, minute=0))
        state.sync_real_time(day.replace(hour=13, minute=45))
        self.assertEqual(state.time_label, "SUN 06 SEP  /  13:45")
        self.assertEqual(state.break_kind, "lunch")
        self.assertEqual(first_worker.meals_eaten_today, 1)
        self.assertLess(first_worker.wealth_fiat, initial_wealth)

        state.sync_real_time(day.replace(hour=17, minute=0))
        self.assertIsNone(state.break_kind)
        self.assertGreater(first_worker.wealth_fiat, initial_wealth)

    def test_automatic_breaks_follow_the_local_policy_without_stopping_the_day(self):
        state = OfficeState.with_default_roster()
        for _ in range(3):
            state.advance_workspace_hour()
        self.assertEqual(state.hour, 12)
        self.assertGreaterEqual(state.breaks_taken_today, 1)
        self.assertIsNone(state.break_kind)
        self.assertGreater(state.work_minutes_today, 0)

    def test_manual_break_setting_allows_work_without_automatic_breaks(self):
        state = OfficeState.with_default_roster()
        state.toggle_auto_breaks()
        for _ in range(3):
            state.advance_workspace_hour()
        self.assertEqual(state.breaks_taken_today, 0)
        self.assertTrue(state.start_break())
        self.assertEqual(state.break_kind, "short")

    def test_recruitment_refresh_and_hire_use_the_office_ledger(self):
        state = OfficeState.with_default_roster()
        state.funds = 20_000
        self.assertTrue(state.refresh_recruitment_candidates())
        self.assertEqual(len(state.recruitment_candidates), 3)

        candidate = state.recruitment_candidates[0]
        before_workers = len(state.roster.workers)
        before_funds = state.funds
        self.assertTrue(state.hire_candidate(0))
        self.assertEqual(len(state.roster.workers), before_workers + 1)
        self.assertEqual(state.roster.workers[-1].name, candidate.name)
        self.assertEqual(state.funds, before_funds - candidate.hiring_cost_fiat)

    def test_recruitment_rejects_unaffordable_hire_without_mutating_the_team(self):
        state = OfficeState.with_default_roster()
        state.funds = 0
        workers_before = len(state.roster.workers)
        self.assertFalse(state.hire_candidate(0))
        self.assertEqual(len(state.roster.workers), workers_before)
        self.assertIn("HIRE DENIED", state.notice)

    def test_office_record_round_trips_workers_and_ledger(self):
        state = OfficeState.with_default_roster()
        state.funds = 4_321
        state.select_worker(1)
        state.buy_coffee(1)

        with TemporaryDirectory() as directory:
            path = Path(directory) / "office.json"
            state.save_to_file(path)
            restored = OfficeState.load_from_file(path)

        self.assertEqual(restored.funds, state.funds)
        self.assertEqual(restored.selected_worker, state.selected_worker)
        self.assertEqual(len(restored.roster.workers), len(state.roster.workers))
        self.assertEqual(restored.roster.workers[1].name, state.roster.workers[1].name)
        self.assertEqual(restored.ledger[-1].label, state.ledger[-1].label)


if __name__ == "__main__":
    unittest.main()