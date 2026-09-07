"""Solar-punk Pygame renderer and vector UI primitives."""

from __future__ import annotations

import pygame

from .models import Worker
from .scene import TowerScene
from .state import OfficeState


class Palette:
    OCEAN = (9, 57, 65)
    OCEAN_DEEP = (5, 40, 48)
    OBSIDIAN = (12, 31, 34)
    GLASS = (224, 241, 220)
    GLASS_BRIGHT = (241, 248, 228)
    INK = (17, 45, 46)
    MUTED = (93, 131, 125)
    SEAFOAM = (71, 190, 154)
    SUN = (248, 185, 87)
    CORAL = (240, 119, 103)
    LEAF = (125, 181, 84)
    WHITE = (248, 250, 232)


def _ui_font(size: int, *, bold: bool = False) -> pygame.font.Font:
    """Choose a readable native UI font without depending on one OS."""
    for family in ("Inter", "Segoe UI", "Helvetica Neue", "Arial", "DejaVu Sans"):
        font_path = pygame.font.match_font(family, bold=bold)
        if font_path:
            return pygame.font.Font(font_path, size)
    return pygame.font.Font(None, size)


class SolarPunkRenderer:
    """Owns only presentation; state transitions remain in OfficeState."""

    def __init__(self, screen: pygame.Surface) -> None:
        self.screen = screen
        self.width, self.height = screen.get_size()
        self.font_xl = _ui_font(28, bold=True)
        self.font_lg = _ui_font(19, bold=True)
        self.font_md = _ui_font(14, bold=True)
        self.font_sm = _ui_font(11)
        # Keep the compact label sizing without the terminal-like typeface.
        # The office UI is a modern business surface, not a CRT interface.
        self.font_mono = _ui_font(11)
        self.drawer_rect = pygame.Rect(0, 0, 0, 0)
        self.run_rect = pygame.Rect(0, 0, 0, 0)
        self.reset_rect = pygame.Rect(0, 0, 0, 0)
        self.record_rect = pygame.Rect(0, 0, 0, 0)
        self.record_close_rect = pygame.Rect(0, 0, 0, 0)
        self.worker_rects: dict[int, pygame.Rect] = {}
        self.recruitment_rect = pygame.Rect(0, 0, 0, 0)
        self.refresh_rect = pygame.Rect(0, 0, 0, 0)
        self.candidate_rects: dict[int, pygame.Rect] = {}

    def text(
        self,
        value: str,
        position: tuple[int, int],
        font: pygame.font.Font,
        color: tuple[int, int, int] = Palette.INK,
    ) -> None:
        self.screen.blit(font.render(value, True, color), position)

    def panel(
        self,
        rect: pygame.Rect,
        fill: tuple[int, int, int],
        stroke: tuple[int, int, int] = Palette.MUTED,
        radius: int = 14,
        width: int = 1,
    ) -> None:
        pygame.draw.rect(self.screen, fill, rect, border_radius=radius)
        pygame.draw.rect(self.screen, stroke, rect, width=width, border_radius=radius)

    def draw(self, state: OfficeState, coffee_rects: dict[int, pygame.Rect]) -> None:
        self.screen.fill(Palette.OCEAN_DEEP)
        self.draw_ecosystem_backdrop()
        self.draw_header(state)
        self.draw_shift_rail(state)
        if state.recruitment_open:
            self.draw_recruitment_desk(state)
        else:
            self.draw_worker_grid(state, coffee_rects)
        self.draw_activity_panel(state)
        if state.drawer_open:
            self.draw_office_record(state)

    def draw_tower(self, state: OfficeState, scene: TowerScene) -> None:
        """Render the first physical tower slice without owning simulation state."""
        # This is deliberately a bright, legible "dollhouse" plan rather than a
        # second simulation.  World positions and interaction ownership remain in
        # TowerScene; this method only turns those coordinates into a place.
        self.screen.fill((218, 238, 229))
        self.draw_tower_header(state, scene)
        map_rect = pygame.Rect(28, 104, self.width - 56, 488)
        self.panel(map_rect, (249, 246, 226), (124, 181, 169), radius=18, width=2)
        self.text("SUNLIT TOWER / FLOOR 01", (52, 122), self.font_lg, Palette.INK)
        self.text("WASD / ARROWS MOVE   E INTERACT   1/2/3 ROOMS   TAB DASHBOARD   SPACE PAUSE", (54, 148), self.font_mono, Palette.MUTED)

        world = pygame.Rect(70, 174, self.width - 140, 378)
        self.panel(world, (224, 232, 216), (151, 188, 169), radius=12, width=2)
        scale_x = world.width / scene.width
        scale_y = world.height / scene.height

        # A soft water court and perimeter planting establish an optimistic,
        # inhabited building before furnishing the actual room bounds.
        court = pygame.Rect(world.x + world.width // 2 - 105, world.y + 92, 210, 148)
        pygame.draw.ellipse(self.screen, (140, 209, 224), court)
        pygame.draw.ellipse(self.screen, (202, 241, 238), court.inflate(-16, -18))
        for x in range(world.x + 30, world.right - 20, 74):
            self._draw_planter(x, world.y + 24)
            self._draw_planter(x, world.bottom - 24)

        for room in (room for room in scene.rooms if room.id != "public"):
            x, y, width, height = room.bounds
            rect = pygame.Rect(
                world.x + int(x * scale_x),
                world.y + int(y * scale_y),
                max(20, int(width * scale_x)),
                max(20, int(height * scale_y)),
            )
            active = room.id == scene.current_room
            self._draw_room_shell(rect, room.id, room.label, room.accent, active)

        for item in scene.objects.objects:
            if item.room not in {scene.current_room, "public"}:
                continue
            ix = world.x + int(item.position[0] * scale_x)
            iy = world.y + int(item.position[1] * scale_y)
            self._draw_tower_object(item.kind, ix, iy, item == scene.nearby_object)
            if item == scene.nearby_object:
                label = self.font_sm.render(item.label, True, Palette.INK)
                badge = label.get_rect(midleft=(ix + 17, iy - 15))
                badge.inflate_ip(10, 6)
                self.panel(badge, (255, 246, 194), Palette.SUN, radius=5, width=2)
                self.screen.blit(label, (badge.x + 5, badge.y + 3))

        px = world.x + int(scene.player_position[0] * scale_x)
        py = world.y + int(scene.player_position[1] * scale_y)
        self._draw_player(px, py)

        self.draw_tower_footer(state, scene)

    def _draw_room_shell(
        self, rect: pygame.Rect, room_id: str, label: str, accent: tuple[int, int, int], active: bool
    ) -> None:
        """Draw architectural surfaces for a room without changing its bounds."""
        fill = (255, 252, 235) if active else (240, 240, 224)
        self.panel(rect, fill, Palette.SUN if active else (157, 183, 167), radius=8, width=3 if active else 1)
        # Pale floor boards make the plan read as architecture, not a wireframe.
        for y in range(rect.y + 25, rect.bottom - 5, 14):
            pygame.draw.line(self.screen, (226, 224, 204), (rect.x + 7, y), (rect.right - 7, y), 1)
        self.text(label, (rect.x + 9, rect.y + 7), self.font_sm, Palette.INK)
        if room_id == "lobby":
            pygame.draw.rect(self.screen, (132, 204, 215), (rect.x + 14, rect.bottom - 25, rect.width - 28, 10), border_radius=5)
            self._draw_planter(rect.x + 24, rect.y + 35)
            self._draw_planter(rect.right - 24, rect.y + 35)
        elif room_id == "recreation":
            for x in range(rect.x + 30, rect.right - 15, 55):
                pygame.draw.circle(self.screen, (226, 170, 91), (x, rect.y + 28), 8)
                pygame.draw.circle(self.screen, (255, 239, 181), (x - 2, rect.y + 26), 3)
        elif room_id == "executive":
            pygame.draw.rect(self.screen, (150, 207, 220), (rect.x + 12, rect.y + 29, rect.width - 24, 12), border_radius=4)
            self._draw_planter(rect.x + 25, rect.bottom - 25)
            self._draw_planter(rect.right - 25, rect.bottom - 25)

    def _draw_planter(self, x: int, y: int) -> None:
        pygame.draw.ellipse(self.screen, (185, 154, 104), (x - 10, y - 4, 20, 9))
        pygame.draw.circle(self.screen, (84, 157, 87), (x - 5, y - 9), 6)
        pygame.draw.circle(self.screen, (109, 184, 92), (x + 3, y - 11), 6)
        pygame.draw.circle(self.screen, (67, 137, 82), (x + 7, y - 6), 5)

    def _draw_tower_object(self, kind: str, x: int, y: int, nearby: bool) -> None:
        """Small but recognizable procedural silhouettes for every ObjectKind."""
        outline = Palette.SUN if nearby else (47, 96, 91)
        if nearby:
            pygame.draw.circle(self.screen, (255, 229, 132), (x, y), 17)
        if kind == "window":
            pygame.draw.rect(self.screen, (91, 181, 209), (x - 12, y - 6, 24, 12), border_radius=2)
            pygame.draw.line(self.screen, (230, 249, 244), (x, y - 5), (x, y + 5), 1)
        elif kind in ("elevator", "stairs"):
            pygame.draw.rect(self.screen, (121, 150, 151), (x - 10, y - 12, 20, 24), border_radius=2)
            if kind == "elevator":
                pygame.draw.line(self.screen, (236, 239, 220), (x, y - 10), (x, y + 10), 2)
            else:
                for dy in range(-7, 9, 5):
                    pygame.draw.line(self.screen, (239, 236, 214), (x - 6, y + dy), (x + 6, y + dy), 1)
        elif kind in ("arcade", "vending_machine", "atm", "crt_terminal"):
            pygame.draw.rect(self.screen, (57, 101, 105), (x - 9, y - 13, 18, 25), border_radius=3)
            pygame.draw.rect(self.screen, (117, 205, 210) if kind != "vending_machine" else (238, 185, 89), (x - 6, y - 9, 12, 8), border_radius=1)
            pygame.draw.circle(self.screen, (238, 244, 215), (x, y + 6), 2)
        elif kind in ("desk", "chair"):
            if kind == "desk":
                pygame.draw.rect(self.screen, (172, 119, 74), (x - 13, y - 6, 26, 12), border_radius=3)
                pygame.draw.line(self.screen, (108, 77, 56), (x - 8, y + 6), (x - 8, y + 11), 2)
                pygame.draw.line(self.screen, (108, 77, 56), (x + 8, y + 6), (x + 8, y + 11), 2)
            else:
                pygame.draw.circle(self.screen, (83, 136, 146), (x, y - 3), 8)
                pygame.draw.line(self.screen, (52, 89, 91), (x, y + 4), (x, y + 11), 3)
        elif kind in ("telephone", "pay_phone"):
            pygame.draw.rect(self.screen, (224, 117, 87) if kind == "pay_phone" else (67, 126, 113), (x - 9, y - 7, 18, 14), border_radius=4)
            pygame.draw.arc(self.screen, (246, 239, 207), (x - 7, y - 10, 14, 10), 3.3, 6.1, 2)
        elif kind == "tv":
            pygame.draw.rect(self.screen, (60, 88, 86), (x - 12, y - 8, 24, 16), border_radius=3)
            pygame.draw.rect(self.screen, (125, 205, 213), (x - 9, y - 5, 18, 10))
            pygame.draw.line(self.screen, (60, 88, 86), (x - 4, y + 8), (x - 7, y + 12), 2)
        pygame.draw.circle(self.screen, outline, (x, y), 15, 2 if nearby else 1)

    def _draw_player(self, x: int, y: int) -> None:
        """A friendly procedural character, with a clear footprint and facing."""
        pygame.draw.ellipse(self.screen, (139, 177, 160), (x - 11, y + 8, 22, 7))
        pygame.draw.circle(self.screen, (77, 76, 70), (x, y - 4), 9)  # hair
        pygame.draw.circle(self.screen, (216, 151, 107), (x, y - 2), 7)  # face
        pygame.draw.rect(self.screen, Palette.CORAL, (x - 7, y + 5, 14, 12), border_radius=5)
        pygame.draw.line(self.screen, (45, 75, 76), (x - 4, y + 15), (x - 5, y + 20), 3)
        pygame.draw.line(self.screen, (45, 75, 76), (x + 4, y + 15), (x + 5, y + 20), 3)

    def draw_tower_header(self, state: OfficeState, scene: TowerScene) -> None:
        header = pygame.Rect(28, 18, self.width - 56, 72)
        self.panel(header, (255, 252, 235), (140, 190, 168), radius=16, width=2)
        self.text("SALARYMAN", (48, 30), self.font_xl, Palette.INK)
        self.text("PHYSICAL OFFICE SIMULATION", (50, 64), self.font_mono, Palette.MUTED)
        self.text(f"FLOOR {scene.current_floor:02d}", (540, 37), self.font_lg, Palette.SUN)
        self.text(f"ƒ{state.funds:,.2f}", (760, 33), self.font_lg, Palette.SEAFOAM)
        self.text(state.time_label, (940, 39), self.font_sm, Palette.MUTED)

    def draw_tower_footer(self, state: OfficeState, scene: TowerScene) -> None:
        footer = pygame.Rect(28, 610, self.width - 56, 78)
        self.panel(footer, (255, 252, 235), (140, 190, 168), radius=14, width=2)
        nearby = scene.nearby_object
        if nearby:
            prompt = pygame.Rect(46, 622, min(430, self.width - 550), 28)
            self.panel(prompt, (255, 242, 190), Palette.SUN, radius=8, width=2)
            self.text(f"[E] {nearby.prompt}", (58, 630), self.font_md, Palette.INK)
            self.text(f"ROOM  {scene.room.label}  ·  OBJECT  {nearby.label}", (52, 658), self.font_mono, Palette.MUTED)
        else:
            self.text("WALK CLOSER TO A PHYSICAL OBJECT", (52, 628), self.font_md, Palette.INK)
            self.text(f"ROOM  {scene.room.label}", (52, 656), self.font_mono, Palette.MUTED)
        self.text(state.notice, (760, 644), self.font_mono, Palette.SEAFOAM)

    def draw_ecosystem_backdrop(self) -> None:
        # Layered ocean glass, sun disk, canopy shapes, and waterline geometry
        # keep the screen alive without relying on external image assets.
        pygame.draw.circle(self.screen, (244, 199, 104), (self.width - 100, 88), 44)
        pygame.draw.circle(self.screen, (251, 218, 133), (self.width - 100, 88), 32)
        pygame.draw.rect(self.screen, (7, 72, 76), (0, 132, self.width, self.height - 132))
        pygame.draw.rect(self.screen, (13, 90, 84), (0, self.height - 118, self.width, 118))

        for x in range(-20, self.width + 80, 88):
            pygame.draw.line(self.screen, (22, 111, 98), (x, self.height - 96), (x + 50, self.height - 56), 2)
            pygame.draw.line(self.screen, (22, 111, 98), (x + 50, self.height - 56), (x + 120, self.height - 82), 2)
        for x in range(30, self.width, 150):
            pygame.draw.line(self.screen, (39, 132, 111), (x, 168), (x - 18, 220), 3)
            pygame.draw.circle(self.screen, Palette.LEAF, (x - 18, 220), 6)
            pygame.draw.circle(self.screen, Palette.LEAF, (x + 2, 198), 5)

    def draw_header(self, state: OfficeState) -> None:
        header = pygame.Rect(28, 24, self.width - 56, 98)
        self.panel(header, Palette.GLASS_BRIGHT, (153, 207, 173), radius=18, width=2)
        self.text("SALARYMAN", (50, 42), self.font_xl, Palette.INK)
        self.text("OFFICE ECOLOGY / LIVE LEDGER", (52, 78), self.font_mono, Palette.MUTED)

        self.text("AVAILABLE CAPITAL", (330, 42), self.font_sm, Palette.MUTED)
        funds_color = Palette.CORAL if state.funds < 0 else Palette.SEAFOAM
        self.text(f"ƒ{state.funds:,.2f}", (330, 61), self.font_lg, funds_color)
        self.text("TODAY NET", (540, 42), self.font_sm, Palette.MUTED)
        self.text(f"{'+' if state.net_today >= 0 else ''}ƒ{state.net_today:,.2f}", (540, 61), self.font_lg, Palette.SUN)

        self.text(state.time_label, (760, 44), self.font_lg, Palette.INK)
        if state.break_kind:
            state_label = state.break_label
            state_color = Palette.SUN
        elif state.is_working:
            state_label = "ACTIVE SHIFT"
            state_color = Palette.SEAFOAM
        elif not state.running:
            state_label = "SHIFT PAUSED"
            state_color = Palette.SUN
        else:
            state_label = "NEXT SHIFT"
            state_color = Palette.CORAL
        self.text(state_label, (762, 77), self.font_sm, state_color)

    def draw_shift_rail(self, state: OfficeState) -> None:
        rail = pygame.Rect(28, 142, self.width - 56, 54)
        self.panel(rail, (18, 92, 88), (52, 144, 127), radius=16)
        self.text(f"WORK CYCLE  ·  {state.break_label}", (48, 161), self.font_sm, Palette.GLASS)
        track = pygame.Rect(160, 164, self.width - 345, 12)
        pygame.draw.rect(self.screen, (6, 55, 62), track, border_radius=6)
        pygame.draw.rect(
            self.screen,
            Palette.SEAFOAM if state.is_working else Palette.SUN,
            pygame.Rect(track.x, track.y, max(12, int(track.width * state.shift_progress)), track.height),
            border_radius=6,
        )
        self.text("09:00", (160, 178), self.font_mono, Palette.GLASS)
        end_hour = state.policy.overtime_end_hour if state.policy.overtime_allowed else 17
        self.text(f"{end_hour:02d}:00", (track.right - 36, 178), self.font_mono, Palette.GLASS)
        self.run_rect = pygame.Rect(self.width - 178, 153, 140, 31)
        self.panel(
            self.run_rect,
            (203, 229, 190) if state.running else (245, 224, 171),
            Palette.SEAFOAM if state.running else Palette.SUN,
            radius=8,
        )
        self.text(
            "PAUSE SHIFT" if state.running else "RESUME SHIFT",
            (self.run_rect.x + 12, self.run_rect.y + 9),
            self.font_mono,
            Palette.INK,
        )

    def draw_worker_grid(self, state: OfficeState, coffee_rects: dict[int, pygame.Rect]) -> None:
        self.text("WORKFLOOR", (36, 218), self.font_lg, Palette.GLASS_BRIGHT)
        self.text("SELECT A WORKER TO DIRECT THEIR NEXT BREAK", (36, 245), self.font_sm, (176, 219, 192))

        columns = 4 if len(state.roster.workers) > 3 else 3
        card_width = (self.width - 92 - (columns - 3) * 18) // columns
        self.worker_rects.clear()
        for index, worker in enumerate(state.roster.workers[:columns]):
            rect = pygame.Rect(28 + index * (card_width + 18), 272, card_width, 264)
            self.worker_rects[index] = rect
            coffee_rects[index] = self.draw_worker_card(state, worker, rect)
        if len(state.roster.workers) > columns:
            self.text(
                f"+{len(state.roster.workers) - columns} MORE IN OFFICE RECORD",
                (36, 540),
                self.font_mono,
                Palette.SUN,
            )

    def draw_recruitment_desk(self, state: OfficeState) -> None:
        self.text("RECRUITMENT DESK", (36, 218), self.font_lg, Palette.GLASS_BRIGHT)
        self.text(
            "REVIEW CANDIDATES BEFORE ADDING THEM TO THE ACTIVE TEAM",
            (36, 245),
            self.font_sm,
            (176, 219, 192),
        )
        self.refresh_rect = pygame.Rect(self.width - 222, 214, 174, 30)
        self.panel(self.refresh_rect, (203, 229, 190), Palette.SEAFOAM, radius=8)
        self.text("REFRESH POOL  ƒ50", (self.refresh_rect.x + 18, self.refresh_rect.y + 8), self.font_mono, Palette.INK)

        self.candidate_rects.clear()
        card_width = (self.width - 92) // 3
        for index, candidate in enumerate(state.recruitment_candidates[:3]):
            rect = pygame.Rect(28 + index * (card_width + 18), 272, card_width, 264)
            self.candidate_rects[index] = rect
            self.panel(rect, Palette.GLASS_BRIGHT, candidate.accent, radius=16, width=2)
            inner = rect.inflate(-18, -18)
            pygame.draw.circle(self.screen, candidate.accent, (inner.x + 27, inner.y + 30), 14)
            pygame.draw.circle(self.screen, Palette.GLASS_BRIGHT, (inner.x + 27, inner.y + 30), 6)
            self.text(candidate.name, (inner.x + 51, inner.y + 18), self.font_lg, Palette.INK)
            self.text(candidate.role, (inner.x + 18, inner.y + 57), self.font_mono, Palette.MUTED)
            self.text(
                f"OUTPUT  +ƒ{candidate.productivity_per_hour:,.0f}/HR",
                (inner.x + 18, inner.y + 104),
                self.font_mono,
                Palette.INK,
            )
            self.text(
                f"WAGE  ƒ{candidate.hourly_wage_fiat:,.0f}/HR",
                (inner.x + 18, inner.y + 128),
                self.font_mono,
                Palette.INK,
            )
            self.text(
                f"ONBOARDING  ƒ{candidate.hiring_cost_fiat:,.0f}",
                (inner.x + 18, inner.y + 152),
                self.font_mono,
                Palette.MUTED,
            )
            hire_rect = pygame.Rect(inner.x + 18, inner.bottom - 42, inner.width - 36, 30)
            affordable = state.funds >= candidate.hiring_cost_fiat
            self.panel(
                hire_rect,
                (203, 229, 190) if affordable else (218, 220, 201),
                candidate.accent,
                radius=8,
            )
            self.text("HIRE CANDIDATE", (hire_rect.x + 16, hire_rect.y + 8), self.font_sm, Palette.INK)

        if not state.recruitment_candidates:
            self.text("NO CANDIDATES AVAILABLE", (42, 330), self.font_md, Palette.SUN)

    def draw_worker_card(self, state: OfficeState, worker: Worker, rect: pygame.Rect) -> pygame.Rect:
        selected = state.selected_worker == state.roster.workers.index(worker)
        self.panel(
            rect,
            Palette.GLASS_BRIGHT if selected else Palette.GLASS,
            Palette.SUN if selected else (153, 207, 173),
            radius=16,
            width=3 if selected else 2,
        )
        inner = rect.inflate(-18, -18)
        self.panel(inner, (232, 245, 224), (184, 216, 184), radius=11)
        pygame.draw.circle(self.screen, worker.accent, (inner.x + 27, inner.y + 30), 14)
        pygame.draw.circle(self.screen, Palette.GLASS_BRIGHT, (inner.x + 27, inner.y + 30), 6)
        self.text(worker.name, (inner.x + 51, inner.y + 18), self.font_lg, Palette.INK)
        self.text(worker.role, (inner.x + 51, inner.y + 43), self.font_mono, Palette.MUTED)
        self.text(str(state.roster.workers.index(worker) + 1), (inner.right - 28, inner.y + 18), self.font_md, worker.accent)

        status_color = Palette.SEAFOAM
        if worker.stamina_state == "warming":
            status_color = Palette.SUN
        elif worker.stamina_state == "starting":
            status_color = Palette.CORAL
        self.text(worker.status_note, (inner.x + 18, inner.y + 72), self.font_sm, status_color)

        self.text(f"OUTPUT  +ƒ{worker.productivity_per_hour:,.0f}/HR", (inner.x + 18, inner.y + 104), self.font_mono, Palette.INK)
        self.text(f"WAGE  ƒ{worker.hourly_wage_fiat:,.0f}/HR", (inner.x + 18, inner.y + 124), self.font_mono, Palette.INK)
        self.text(f"HUNGER  {worker.hunger:02.0f}%  ·  MEALS {worker.meals_eaten_today}", (inner.x + 18, inner.y + 144), self.font_mono, Palette.MUTED)
        self.text(f"NPC WEALTH  ƒ{worker.wealth_fiat:,.0f}", (inner.x + 18, inner.y + 164), self.font_mono, Palette.SEAFOAM)

        bar = pygame.Rect(inner.x + 18, inner.y + 188, inner.width - 36, 16)
        pygame.draw.rect(self.screen, (191, 213, 190), bar, border_radius=8)
        gauge_color = {
            "steady": Palette.SEAFOAM,
            "warming": Palette.SUN,
            "starting": Palette.CORAL,
        }[worker.stamina_state]
        fill = pygame.Rect(bar.x, bar.y, max(3, int(bar.width * worker.stamina_ratio)), bar.height)
        pygame.draw.rect(self.screen, gauge_color, fill, border_radius=8)
        self.text(f"STAMINA {worker.stamina:02.0f}%", (bar.x, bar.bottom + 5), self.font_mono, gauge_color)

        coffee_rect = pygame.Rect(inner.right - 116, inner.bottom - 35, 98, 27)
        affordable = state.funds >= worker.coffee_cost
        button_fill = (203, 229, 190) if affordable else (218, 220, 201)
        self.panel(coffee_rect, button_fill, worker.accent, radius=8, width=1)
        self.text("BUY COFFEE", (coffee_rect.x + 9, coffee_rect.y + 7), self.font_sm, Palette.INK)
        self.text(f"ƒ{worker.coffee_cost:.0f}", (coffee_rect.right - 27, coffee_rect.y + 7), self.font_sm, Palette.MUTED)
        return coffee_rect

    def draw_activity_panel(self, state: OfficeState) -> None:
        panel = pygame.Rect(28, 558, self.width - 56, 128)
        self.panel(panel, (8, 66, 70), (52, 144, 127), radius=16, width=2)
        self.text("OFFICE STATUS", (50, 580), self.font_md, Palette.GLASS_BRIGHT)
        self.text(
            f"FOCUS HOURS {state.hours_completed_today}/8  ·  "
            f"ROSTER {len(state.roster.workers)}  ·  "
            f"BREAKS {state.breaks_taken_today}  ·  ƒ{state.total_output:,.2f}",
            (50, 607),
            self.font_mono,
            (176, 219, 192),
        )
        self.text(
            "ATRIUM LIGHT  /  WATER LOOP  /  PEOPLE ON SHIFT",
            (50, 635),
            self.font_sm,
            Palette.SUN,
        )
        self.text(f"{state.notice}     B BREAK  T AUTO BREAKS", (50, 660), self.font_mono, Palette.GLASS)
        self.reset_rect = pygame.Rect(self.width - 454, 648, 116, 26)
        self.panel(self.reset_rect, (18, 92, 88), (52, 144, 127), radius=7)
        self.text("RESET DAY  R", (self.reset_rect.x + 12, self.reset_rect.y + 7), self.font_mono, Palette.GLASS)
        self.recruitment_rect = pygame.Rect(self.width - 590, 648, 126, 26)
        self.panel(self.recruitment_rect, (232, 245, 224), (184, 216, 184), radius=7)
        self.text(
            "TEAM  N" if state.recruitment_open else "HIRE  N",
            (self.recruitment_rect.x + 26, self.recruitment_rect.y + 7),
            self.font_mono,
            Palette.INK,
        )

        self.drawer_rect = pygame.Rect(self.width - 276, 580, 224, 78)
        self.panel(self.drawer_rect, (232, 245, 224), (184, 216, 184), radius=11, width=2)
        pygame.draw.rect(
            self.screen,
            Palette.SUN,
            pygame.Rect(self.drawer_rect.x + 84, self.drawer_rect.y + 9, 56, 5),
            border_radius=3,
        )
        self.text("DESK DRAWER", (self.drawer_rect.x + 16, self.drawer_rect.y + 28), self.font_md, Palette.INK)
        self.text("OFFICE RECORD  ›", (self.drawer_rect.x + 16, self.drawer_rect.y + 50), self.font_mono, Palette.MUTED)

    def draw_office_record(self, state: OfficeState) -> None:
        """Render the migrated finance/game information as a physical drawer."""
        overlay = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        overlay.fill((3, 27, 30, 178))
        self.screen.blit(overlay, (0, 0))

        record = pygame.Rect(76, 72, self.width - 152, self.height - 112)
        self.record_rect = record
        self.record_close_rect = pygame.Rect(record.right - 132, record.y + 20, 100, 28)
        self.panel(record, Palette.GLASS_BRIGHT, (153, 207, 173), radius=18, width=2)
        self.text("OFFICE RECORD", (104, 100), self.font_xl, Palette.INK)
        self.text("THE DESK DRAWER / FINANCE + SIMULATION MEMORY", (106, 137), self.font_mono, Palette.MUTED)
        self.panel(self.record_close_rect, (226, 239, 218), (184, 216, 184), radius=7)
        self.text("CLOSE", (self.record_close_rect.x + 26, self.record_close_rect.y + 8), self.font_mono, Palette.INK)

        left = pygame.Rect(104, 172, 296, 168)
        middle = pygame.Rect(420, 172, 296, 168)
        right = pygame.Rect(736, 172, 296, 168)
        for card in (left, middle, right):
            self.panel(card, (232, 245, 224), (184, 216, 184), radius=12)

        self.text("FINANCE", (left.x + 18, left.y + 17), self.font_md, Palette.INK)
        self.text(f"AVAILABLE  ƒ{state.funds:,.2f}", (left.x + 18, left.y + 52), self.font_lg, Palette.SEAFOAM)
        self.text(f"OUTPUT TODAY  +ƒ{state.total_output:,.2f}", (left.x + 18, left.y + 90), self.font_mono, Palette.INK)
        self.text(f"WAGES PAID  -ƒ{state.total_wages_paid:,.2f}", (left.x + 18, left.y + 116), self.font_mono, Palette.CORAL)
        self.text(f"NET TODAY  ƒ{state.net_today:,.2f}", (left.x + 18, left.y + 142), self.font_mono, Palette.MUTED)

        self.text("SIMULATION", (middle.x + 18, middle.y + 17), self.font_md, Palette.INK)
        self.text(state.time_label, (middle.x + 18, middle.y + 52), self.font_lg, Palette.SUN)
        self.text(f"SHIFT  {state.hours_completed_today}/8 HOURS", (middle.x + 18, middle.y + 90), self.font_mono, Palette.INK)
        self.text(f"ROSTER  {len(state.roster.workers)} WORKERS", (middle.x + 18, middle.y + 116), self.font_mono, Palette.INK)
        self.text("2 REAL SEC = 1 WORK HOUR", (middle.x + 18, middle.y + 142), self.font_mono, Palette.MUTED)

        self.text("WORK POLICY", (right.x + 18, right.y + 17), self.font_md, Palette.INK)
        self.text(state.policy.jurisdiction, (right.x + 18, right.y + 53), self.font_lg, Palette.SEAFOAM)
        auto_label = "AUTO BREAKS ON" if state.policy.auto_breaks else "BREAKS MANUAL"
        self.text(auto_label, (right.x + 18, right.y + 91), self.font_mono, Palette.INK)
        self.text("2.5H / 15M  ·  MEAL 60M", (right.x + 18, right.y + 119), self.font_mono, Palette.MUTED)
        self.text("T TOGGLE POLICY  ·  SET LOCALLY", (right.x + 18, right.y + 142), self.font_mono, Palette.CORAL)

        ledger = pygame.Rect(104, 364, self.width - 208, 126)
        self.panel(ledger, (8, 66, 70), (52, 144, 127), radius=12)
        self.text("RECENT LEDGER", (124, 382), self.font_md, Palette.GLASS_BRIGHT)
        entries = state.ledger[-4:]
        for index, entry in enumerate(reversed(entries)):
            sign = "+" if entry.amount >= 0 else ""
            color = Palette.SEAFOAM if entry.amount >= 0 else Palette.CORAL
            self.text(entry.label.upper()[:42], (124, 410 + index * 18), self.font_mono, Palette.GLASS)
            self.text(f"{sign}ƒ{entry.amount:,.2f}", (720, 410 + index * 18), self.font_mono, color)
            self.text(f"ƒ{entry.balance:,.2f}", (900, 410 + index * 18), self.font_mono, Palette.GLASS)

        self.text(
            "THE DESKTOP CLIENT OWNS THE OFFICE SIMULATION. THE WEB APP REMAINS THE PRACTICAL CONTROL PLANE.",
            (104, 522),
            self.font_mono,
            Palette.INK,
        )