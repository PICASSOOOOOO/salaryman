"""Small, persistent story beats for the first playable Tower slice."""

from __future__ import annotations

from typing import Any


OPEN_MIC_STORY_COMPLETE_STAGE = 5
OPEN_MIC_EVENT_COMPLETE_STAGE = 3
OPEN_MIC_EVENT_OBJECT_IDS = (
    "floor-06-open-mic-sound-desk",
    "floor-06-open-mic-sign-up",
    "floor-06-open-mic-microphone",
)

_OBJECTIVES = (
    "SPEAK WITH MILA AT RECEPTION",
    "CHECK THE EVENT NOTE AT THE RECEPTION DESK",
    "VISIT THE OPEN-MIC CONCOURSE ON FLOOR 06",
    "RETURN TO THE LOBBY TO REPORT BACK",
    "TELL MILA WHAT YOU FOUND",
)
_EVENT_OBJECTIVES = (
    "CHECK THE SOUND LEVELS ON FLOOR 06",
    "CONFIRM THE FIRST PERFORMER SIGN-UP",
    "TAKE THE MICROPHONE AND START THE FIRST SET",
    "OPEN MIC / FIRST SET COMPLETE ON FLOOR 06",
)

_STORY_LINES = {
    1: "MILA / RADIO CAN CARRY THE SHOW. THE SCHOOL WANTS THE ROOM OPEN TO EVERYONE.",
    2: "EVENT NOTE / FLOOR 06 / RADIO STATION + SCHOOL + FLOWER SHOP / FIRST SET TBD.",
    3: "FLOOR 06 / RADIO, MUSIC, SCHOOL, AND FLOWER SHOP / OPEN-MIC SCOUTING COMPLETE.",
    4: "MILA / THE CONCOURSE IS SHARED SPACE. BRING THE PLAN BACK TO ME.",
    5: "MILA / FIRST SET READY. FLOOR 06 STAYS OPEN TO EVERYONE.",
}
_EVENT_LINES = (
    "OPEN MIC / CHECK THE SOUND LEVELS FIRST.",
    "SOUND CHECK COMPLETE / CONFIRM THE FIRST PERFORMER.",
    "FIRST SET CONFIRMED / TAKE THE MICROPHONE.",
    "FIRST SET COMPLETE / THE FLOOR IS OPEN TO EVERYONE.",
)


def normalize_open_mic_story_stage(value: object) -> int:
    """Bound persisted story progress and reject bools/strings as stage values."""
    if not isinstance(value, int) or isinstance(value, bool):
        return 0
    return max(0, min(OPEN_MIC_STORY_COMPLETE_STAGE, value))


def normalize_open_mic_event_stage(value: object) -> int:
    """Bound the saved open-mic event stage and reject bools/strings."""
    if not isinstance(value, int) or isinstance(value, bool):
        return 0
    return max(0, min(OPEN_MIC_EVENT_COMPLETE_STAGE, value))


def open_mic_story_objective(
    stage: object,
    event_stage: object = 0,
) -> str:
    """Return the story or live-event objective for the existing HUD."""
    story_stage = normalize_open_mic_story_stage(stage)
    if story_stage < OPEN_MIC_STORY_COMPLETE_STAGE:
        return _OBJECTIVES[story_stage]
    return _EVENT_OBJECTIVES[normalize_open_mic_event_stage(event_stage)]


def advance_open_mic_story(
    state: Any,
    scene: Any,
    command: object | None = None,
) -> str | None:
    """Advance only from the expected lobby interaction or Floor 06 visit."""
    stage = normalize_open_mic_story_stage(state.open_mic_story_stage)
    next_stage: int | None = None

    if stage == 0 or stage == 1 or stage == 4:
        if not isinstance(command, dict) or command.get("name") != "interact":
            return None
        payload = command.get("payload", {})
        if not isinstance(payload, dict):
            return None
        nearby = scene.nearby_object
        if nearby is None:
            return None
        target_id = payload.get("object_id")
        if target_id is not None and target_id != nearby.id:
            return None
        target_id = nearby.id
        if scene.current_room != "lobby":
            return None
        if stage == 0 and target_id == "lobby-receptionist":
            next_stage = 1
        elif stage == 1 and target_id == "lobby-reception-desk":
            next_stage = 2
        elif stage == 4 and target_id == "lobby-receptionist":
            next_stage = OPEN_MIC_STORY_COMPLETE_STAGE
    elif stage == 2 and scene.current_floor == 6 and scene.current_room == "recreation":
        next_stage = 3
    elif stage == 3 and scene.current_floor == 1 and scene.current_room == "lobby":
        next_stage = 4

    if next_stage is None:
        return None
    state.open_mic_story_stage = next_stage
    return _STORY_LINES[next_stage]


def advance_open_mic_event(
    state: Any,
    scene: Any,
    command: object | None = None,
) -> str | None:
    """Advance the public Floor 06 event through nearby stations in order."""
    if normalize_open_mic_story_stage(state.open_mic_story_stage) < OPEN_MIC_STORY_COMPLETE_STAGE:
        return None
    if not isinstance(command, dict) or command.get("name") != "interact":
        return None
    payload = command.get("payload", {})
    if not isinstance(payload, dict):
        return None
    nearby = scene.nearby_object
    if nearby is None or scene.current_floor != 6 or scene.current_room != "recreation":
        return None
    requested_id = payload.get("object_id")
    if requested_id is not None and requested_id != nearby.id:
        return None
    if nearby.id not in OPEN_MIC_EVENT_OBJECT_IDS:
        return None

    stage = normalize_open_mic_event_stage(state.open_mic_event_stage)
    if stage >= OPEN_MIC_EVENT_COMPLETE_STAGE:
        return _EVENT_LINES[OPEN_MIC_EVENT_COMPLETE_STAGE]
    expected_id = OPEN_MIC_EVENT_OBJECT_IDS[stage]
    if nearby.id != expected_id:
        return _EVENT_LINES[stage]

    next_stage = stage + 1
    state.open_mic_event_stage = next_stage
    return _EVENT_LINES[next_stage]
