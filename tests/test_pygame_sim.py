from pygame_sim.models import Worker
from pygame_sim.state import OfficeState, SECONDS_PER_WORKSPACE_HOUR


def test_two_real_seconds_advance_one_workspace_hour_and_generate_output():
    state = OfficeState.with_default_roster()
    opening = state.funds

    state.update(SECONDS_PER_WORKSPACE_HOUR)

    assert state.hour == 10
    assert state.day == 1
    assert state.funds > opening
    assert state.hours_completed_today == 1


def test_end_of_shift_pays_wages_once_then_next_tick_starts_next_day():
    state = OfficeState.with_default_roster()
    opening = state.funds

    for _ in range(8):
        state.advance_workspace_hour()

    assert state.hour == 17
    assert state.funds < opening + state.total_output
    wages_after_settlement = state.total_wages_paid
    state.advance_workspace_hour()

    assert state.day == 2
    assert state.hour == 9
    assert state.total_wages_paid == 0.0
    assert wages_after_settlement > 0


def test_coffee_boundary_checks_funds_and_recovers_stamina():
    state = OfficeState.with_default_roster()
    worker = state.roster.workers[0]
    worker.stamina = 30.0
    state.funds = worker.coffee_cost - 1

    assert worker.buy_coffee(state) is False
    assert worker.stamina == 30.0

    state.funds = worker.coffee_cost
    assert worker.buy_coffee(state) is True
    assert worker.stamina > 30.0
    assert state.funds == 0.0


def test_stamina_gauge_thresholds_are_contextual():
    worker = Worker("Test", "ROLE", 10, 5, (1, 2, 3))
    worker.stamina = 80
    assert worker.stamina_state == "emerald"
    worker.stamina = 45
    assert worker.stamina_state == "warning"
    worker.stamina = 10
    assert worker.stamina_state == "depletion"