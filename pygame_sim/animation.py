"""Small, deterministic pixel-art character movement poses."""

from __future__ import annotations


def character_pose(
    character_variant: int,
    animation_tick: int,
    *,
    moving: bool,
) -> tuple[int, int, int]:
    """Return (sprite-sheet column, x offset, y offset) without identity swaps."""
    variant = max(0, min(6, int(character_variant)))
    if not moving:
        return variant, 0, 0

    stride = ((0, 0), (0, -1), (0, 0), (0, 1))
    phase = (max(0, int(animation_tick)) // 15) % len(stride)
    offset_x, offset_y = stride[phase]
    return variant, offset_x, offset_y
