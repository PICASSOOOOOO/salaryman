"""Solar-punk Pygame renderer and vector UI primitives."""

from __future__ import annotations

import os
import math
from pathlib import Path

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
    MATRIX_BG = (5, 13, 16)
    MATRIX_PANEL = (9, 25, 27)
    MATRIX_PANEL_2 = (12, 36, 35)
    MATRIX_GREEN = (69, 220, 139)
    MATRIX_BRIGHT = (171, 255, 188)
    MATRIX_DIM = (57, 128, 95)
    MATRIX_GRID = (24, 76, 63)
    MATRIX_AMBER = (226, 169, 77)


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
        self.overlay_close_rect = pygame.Rect(0, 0, 0, 0)
        self.repair_rect = pygame.Rect(0, 0, 0, 0)
        self.admin_tools_rect = pygame.Rect(0, 0, 0, 0)
        self.admin_economy_rect = pygame.Rect(0, 0, 0, 0)
        self.admin_maintenance_rect = pygame.Rect(0, 0, 0, 0)
        self.worker_rects: dict[int, pygame.Rect] = {}
        self.recruitment_rect = pygame.Rect(0, 0, 0, 0)
        self.refresh_rect = pygame.Rect(0, 0, 0, 0)
        self.candidate_rects: dict[int, pygame.Rect] = {}
        self._pixel_assets: dict[str, pygame.Surface] = {}
        self.pablo_status = "PABLO CORE / OFFLINE"
        self.pablo_status_color = Palette.MATRIX_DIM
        self._floor_tiles: tuple[pygame.Surface, ...] | None = None
        self._facing = "down"
        self._anim_tick = 0
        self._motion_clock = 0.0
        self._asset_root = self._find_pixel_assets()

    def set_pablo_status(self, status: dict[str, object]) -> None:
        model = str(status.get("model") or "offline").upper()
        active = status.get("active") is True
        verified = isinstance(status.get("astra"), dict) and status["astra"].get("verified") is True
        if active and verified:
            self.pablo_status = f"PABLO CORE / {model} VERIFIED"
            self.pablo_status_color = Palette.MATRIX_GREEN
        elif model != "OFFLINE":
            self.pablo_status = f"PABLO CORE / {model} FALLBACK-READY"
            self.pablo_status_color = Palette.MATRIX_AMBER
        else:
            self.pablo_status = "PABLO CORE / OFFLINE"
            self.pablo_status_color = Palette.MATRIX_DIM

    @staticmethod
    def _find_pixel_assets() -> Path | None:
        """Locate bundled pixel-agents in both source and frozen clients."""
        candidates = [
            Path(getattr(__import__("sys"), "_MEIPASS", "")) / "pixel-agents",
            Path(__file__).resolve().parents[1] / "artifacts" / "interview-helper" / "public" / "pixel-agents",
            Path.cwd() / "artifacts" / "interview-helper" / "public" / "pixel-agents",
        ]
        for root in candidates:
            if (root / "assets" / "floors" / "floor_0.png").exists():
                return root / "assets"
            if (root / "floors" / "floor_0.png").exists():
                return root
        return None

    def _asset(self, relative: str) -> pygame.Surface | None:
        if relative in self._pixel_assets:
            return self._pixel_assets[relative]
        if self._asset_root is None:
            return None
        path = self._asset_root / relative
        try:
            image = pygame.image.load(str(path)).convert_alpha()
        except (pygame.error, OSError):
            return None
        self._pixel_assets[relative] = image
        return image

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
        """Render the authoritative scene as a camera-following pixel-art room."""
        self.screen.fill((8, 43, 49))
        self.draw_tower_header(state, scene)
        viewport = pygame.Rect(18, 68, self.width - 36, 520)
        self._draw_pixel_room(viewport, scene)

        self.draw_tower_footer(state, scene)
        if state.active_page is not None:
            self.draw_game_page(state, scene)
        elif state.tool_menu_open:
            self.draw_operator_menu(state)

    def _draw_pixel_room(self, viewport: pygame.Rect, scene: TowerScene) -> None:
        room_x, room_y, room_w, room_h = scene.room.bounds
        scale = min((viewport.width - 44) / room_w, (viewport.height - 44) / room_h)
        # The room is still larger than the viewport, but the desktop capture
        # must make the avatar readable.  Keep the camera close enough to show
        # the character's walk cycle instead of presenting an editor overview.
        # Show enough of the room to read its architecture. The previous
        # close crop made desks and signs clip into the HUD and hid the
        # hallway/office relationship.
        scale = max(0.40, min(0.52, scale * 2.45))
        view_w, view_h = viewport.width / scale, viewport.height / scale
        camera_x = max(room_x, min(scene.player_position[0] - view_w / 2, room_x + room_w - view_w))
        camera_y = max(room_y, min(scene.player_position[1] - view_h / 2, room_y + room_h - view_h))
        pygame.draw.rect(self.screen, (23, 31, 35), viewport)
        self._draw_perspective_floor(viewport)
        def point(position: tuple[int, int]) -> tuple[int, int]:
            return (viewport.x + int((position[0] - camera_x) * scale),
                    viewport.y + int((position[1] - camera_y) * scale))
        # Keep the architecture legible at close camera distances. Repeating
        # the tiny source wall tile becomes visual noise and collides with the
        # room label, so use a clean structural beam instead.
        beam = pygame.Rect(viewport.x + 8, viewport.y, viewport.width - 16, 42)
        pygame.draw.rect(self.screen, (29, 52, 54), beam)
        pygame.draw.line(self.screen, (164, 201, 158), beam.topleft, beam.topright, 2)
        pygame.draw.line(self.screen, (74, 112, 100), beam.bottomleft, beam.bottomright, 2)
        for x in range(beam.left + 10, beam.right, 34):
            pygame.draw.line(self.screen, (55, 87, 82), (x, beam.top + 6), (x, beam.bottom - 5), 1)
        lower_beam = pygame.Rect(viewport.x + 8, viewport.bottom - 13, viewport.width - 16, 13)
        pygame.draw.rect(self.screen, (48, 67, 62), lower_beam)
        pygame.draw.line(self.screen, (164, 201, 158), lower_beam.topleft, lower_beam.topright, 2)
        self.text(scene.room.label, (viewport.x + 18, viewport.y + 14), self.font_lg, Palette.GLASS_BRIGHT)
        self.text("WASD / ARROWS  MOVE   E  INTERACT", (viewport.right - 290, viewport.y + 19), self.font_mono, (180, 220, 178))

        # Decorative room composition uses real furniture sprites, while the
        # interaction registry remains the sole authority for object behavior.
        placements = {
            "lobby": [("furniture/BOOKSHELF/BOOKSHELF.png", (900, 1850)),
                      ("furniture/LARGE_PLANT/LARGE_PLANT.png", (2500, 1850)),
                      ("furniture/SOFA/SOFA_FRONT.png", (1650, 2450)),
                      ("furniture/WHITEBOARD/WHITEBOARD.png", (2250, 2200))],
            "recreation": [("furniture/SOFA/SOFA_FRONT.png", (1200, 4200)),
                           ("furniture/PLANT/PLANT.png", (8500, 4200)),
                           ("furniture/BOOKSHELF/BOOKSHELF.png", (4600, 4300))],
            "executive": [("furniture/BOOKSHELF/BOOKSHELF.png", (2450, 6400)),
                          ("furniture/PLANT/PLANT.png", (2450, 7000)),
                          ("furniture/WHITEBOARD/WHITEBOARD.png", (1100, 6400))],
            "public": [("furniture/BOOKSHELF/BOOKSHELF.png", (4550, 6400)),
                       ("furniture/PLANT/PLANT.png", (4550, 7000)),
                       ("furniture/WHITEBOARD/WHITEBOARD.png", (3200, 6400))],
            "office_03": [("furniture/BOOKSHELF/BOOKSHELF.png", (6650, 6400)),
                          ("furniture/PLANT/PLANT.png", (6650, 7000)),
                          ("furniture/WHITEBOARD/WHITEBOARD.png", (5300, 6400))],
            "office_04": [("furniture/BOOKSHELF/BOOKSHELF.png", (8750, 6400)),
                          ("furniture/PLANT/PLANT.png", (8750, 7000)),
                          ("furniture/WHITEBOARD/WHITEBOARD.png", (7400, 6400))],
        }
        for asset, position in placements.get(scene.current_room, []):
            screen_position = point(position)
            depth = max(0.72, min(1.28, 0.72 + (screen_position[1] - viewport.top) / max(1, viewport.height) * 0.56))
            self._draw_sprite_shadow(screen_position, depth)
            self._blit_furniture(asset, screen_position, scale, depth_scale=depth)
        for item in scene.objects.objects:
            if item.room != scene.current_room:
                continue
            ix, iy = point(item.position)
            depth = max(0.72, min(1.28, 0.72 + (iy - viewport.top) / max(1, viewport.height) * 0.56))
            self._draw_tower_object(item.kind, ix, iy, item == scene.nearby_object, scale, depth)
            if item == scene.nearby_object:
                pygame.draw.circle(self.screen, (255, 224, 112), (ix, iy), 20, 2)
                self.text("[E] " + item.label, (ix + 18, iy - 24), self.font_sm, Palette.SUN)
        if scene.velocity != (0.0, 0.0):
            vx, vy = scene.velocity
            self._facing = "right" if abs(vx) > abs(vy) and vx > 0 else "left" if abs(vx) > abs(vy) else "down" if vy > 0 else "up"
            self._anim_tick += 1
            self._motion_clock += 0.12
        else:
            self._motion_clock += 0.035
        self._draw_player(
            *point(scene.player_position),
            scale=scale,
            moving=scene.velocity != (0.0, 0.0),
        )

    def _draw_perspective_floor(self, viewport: pygame.Rect) -> None:
        """Draw a warm pseudo-3D floor plane with a real vanishing point."""
        floor = viewport.inflate(-18, -28)
        horizon_y = floor.top + int(floor.height * 0.16)
        vanishing_point = (floor.centerx, horizon_y)
        bands = 15
        for index in range(bands):
            start = index / bands
            end = (index + 1) / bands
            y0 = horizon_y + int((floor.bottom - horizon_y) * (start ** 1.65))
            y1 = horizon_y + int((floor.bottom - horizon_y) * (end ** 1.65))
            color = ((194, 160, 108), (208, 176, 120), (184, 149, 100))[index % 3]
            pygame.draw.rect(self.screen, color, (floor.left, y0, floor.width, max(2, y1 - y0)))
            pygame.draw.line(self.screen, (151, 116, 78), (floor.left, y1), (floor.right, y1), 1)

        for ratio in (0.04, 0.18, 0.34, 0.50, 0.66, 0.82, 0.96):
            bottom_x = floor.left + int(floor.width * ratio)
            pygame.draw.line(self.screen, (165, 128, 84), vanishing_point, (bottom_x, floor.bottom), 1)

        # Soft daylight pools keep the starting state optimistic and alive.
        glow = pygame.Surface(self.screen.get_size(), pygame.SRCALPHA)
        pygame.draw.circle(glow, (255, 226, 150, 30), (floor.left + 130, horizon_y + 80), 110)
        pygame.draw.circle(glow, (115, 220, 205, 24), (floor.right - 150, horizon_y + 105), 145)
        self.screen.blit(glow, (0, 0))

        pygame.draw.rect(self.screen, (52, 65, 58), viewport, width=max(8, int(28 * 0.34)))
        pygame.draw.rect(
            self.screen,
            (151, 194, 143),
            viewport.inflate(-max(8, int(28 * 0.34)), -max(8, int(28 * 0.34))),
            width=2,
        )

    def _build_floor_tiles(self) -> tuple[pygame.Surface, ...]:
        """Build a small hand-authored tile set around the imported art scale."""
        colors = ((203, 170, 117), (213, 181, 126), (195, 163, 111))
        tiles: list[pygame.Surface] = []
        for index, color in enumerate(colors):
            tile = pygame.Surface((16, 16), pygame.SRCALPHA)
            tile.fill(color)
            pygame.draw.line(tile, (157, 122, 82), (0, 15), (15, 15), 1)
            pygame.draw.line(tile, (232, 204, 153), (15, 0), (15, 15), 1)
            if index == 1:
                pygame.draw.line(tile, (225, 193, 140), (2, 4), (9, 4), 1)
            elif index == 2:
                pygame.draw.line(tile, (173, 138, 94), (4, 11), (13, 11), 1)
            tiles.append(tile)
        return tuple(tiles)

    def _blit_furniture(
        self,
        name: str,
        position: tuple[int, int],
        scale: float,
        *,
        depth_scale: float = 1.0,
    ) -> None:
        image = self._asset(name)
        if image:
            pixel_scale = min(3.0, max(1.4, scale * 8 * depth_scale))
            source_width, source_height = image.get_size()
            size = (max(8, int(source_width * pixel_scale)),
                    max(8, int(source_height * pixel_scale)))
            self.screen.blit(pygame.transform.scale(image, size), (position[0] - size[0] // 2, position[1] - size[1] // 2))

    def _draw_sprite_shadow(self, position: tuple[int, int], depth_scale: float) -> None:
        width = max(14, int(26 * depth_scale))
        height = max(4, int(8 * depth_scale))
        pygame.draw.ellipse(
            self.screen,
            (25, 39, 34),
            (position[0] - width // 2, position[1] + height, width, height),
        )

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

    def _draw_tower_object(
        self,
        kind: str,
        x: int,
        y: int,
        nearby: bool,
        scale: float = 1.0,
        depth_scale: float = 1.0,
    ) -> None:
        """Draw a registry object with a matching pixel-art prop where available."""
        sprite_names = {
            "desk": "furniture/DESK/DESK_FRONT.png",
            "chair": "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png",
            "tv": "furniture/PC/PC_FRONT_ON_1.png",
            "window": "furniture/WHITEBOARD/WHITEBOARD.png",
            "arcade": "furniture/PC/PC_FRONT_ON_2.png",
            "vending_machine": "furniture/PC/PC_FRONT_ON_3.png",
            "crt_terminal": "furniture/PC/PC_FRONT_ON_1.png",
            "telephone": "furniture/COFFEE/COFFEE.png",
        }
        if kind == "desk_lamp":
            pygame.draw.ellipse(self.screen, (82, 100, 94), (x - 10, y + 8, 20, 6))
            pygame.draw.line(self.screen, (56, 74, 70), (x, y + 7), (x, y - 8), 3)
            pygame.draw.polygon(self.screen, (238, 190, 89), [(x - 10, y - 9), (x + 10, y - 9), (x + 6, y - 17), (x - 6, y - 17)])
            if nearby:
                pygame.draw.circle(self.screen, Palette.SUN, (x, y - 8), 17, 2)
            return
        if kind in sprite_names and self._asset(sprite_names[kind]):
            self._draw_sprite_shadow((x, y), depth_scale)
            self._blit_furniture(sprite_names[kind], (x, y), scale, depth_scale=depth_scale)
            if nearby:
                pygame.draw.circle(self.screen, Palette.SUN, (x, y), 17, 2)
            return
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
        elif kind == "door":
            pygame.draw.rect(self.screen, (111, 77, 60), (x - 18, y - 24, 36, 48), border_radius=3)
            pygame.draw.rect(self.screen, (217, 177, 112), (x - 13, y - 19, 26, 43), width=2)
            pygame.draw.circle(self.screen, Palette.SUN, (x + 7, y + 3), 2)
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

    def _draw_player(
        self,
        x: int,
        y: int,
        scale: float = 1.0,
        *,
        moving: bool = False,
    ) -> None:
        """Draw a real 16-bit character frame, facing the scene's movement."""
        sheet = self._asset("characters/char_0.png")
        if sheet:
            # Character sheets are 7 columns x 4 cardinal rows, 16x24 each.
            rows = {"down": 0, "left": 1, "right": 2, "up": 3}
            frame = (self._anim_tick // 3) % 7 if moving else 0
            crop = sheet.subsurface(pygame.Rect(frame * 16, rows[self._facing] * 24, 16, 24))
            sprite_scale = min(5.4, max(2.8, scale * 12))
            size = (max(16, int(16 * sprite_scale)), max(24, int(24 * sprite_scale)))
            bob = int(math.sin(self._motion_clock * 3.0) * (3 if moving else 1))
            self._draw_sprite_shadow((x, y), sprite_scale / 3.0)
            self.screen.blit(
                pygame.transform.scale(crop, size),
                (x - size[0] // 2, y - size[1] + 7 - bob),
            )
            return
        pygame.draw.ellipse(self.screen, (139, 177, 160), (x - 11, y + 8, 22, 7))
        pygame.draw.circle(self.screen, (77, 76, 70), (x, y - 4), 9)
        pygame.draw.circle(self.screen, (216, 151, 107), (x, y - 2), 7)
        pygame.draw.rect(self.screen, Palette.CORAL, (x - 7, y + 5, 14, 12), border_radius=5)

    def draw_tower_header(self, state: OfficeState, scene: TowerScene) -> None:
        # This rail is intentionally always at y=0. World panels and page
        # overlays move underneath it; economic context never disappears.
        header = pygame.Rect(0, 0, self.width, 58)
        pygame.draw.rect(self.screen, Palette.MATRIX_BG, header)
        pygame.draw.line(self.screen, Palette.MATRIX_GREEN, (0, header.bottom - 1), (self.width, header.bottom - 1), 2)
        self.text("SALARYMAN", (18, 10), self.font_lg, Palette.MATRIX_BRIGHT)
        self.text(f"FLOOR {scene.current_floor:02d}", (19, 35), self.font_mono, Palette.MATRIX_DIM)
        self.text(self.pablo_status, (805, 35), self.font_mono, self.pablo_status_color)

        self.text("CAPITAL", (180, 9), self.font_mono, Palette.MATRIX_DIM)
        self.text(f"ƒ{state.funds:,.2f}", (180, 25), self.font_md, Palette.MATRIX_BRIGHT)
        self.text("NET", (336, 9), self.font_mono, Palette.MATRIX_DIM)
        net_color = Palette.MATRIX_GREEN if state.net_today >= 0 else Palette.CORAL
        self.text(f"{'+' if state.net_today >= 0 else ''}ƒ{state.net_today:,.0f}", (336, 25), self.font_md, net_color)
        self.text("DECAY", (465, 9), self.font_mono, Palette.MATRIX_DIM)
        decay_color = Palette.MATRIX_GREEN if state.decay < 45 else Palette.MATRIX_AMBER if state.decay < 75 else Palette.CORAL
        self.text(f"{state.decay:02.0f}% {state.decay_label}", (465, 25), self.font_md, decay_color)
        self.text(state.time_label, (665, 20), self.font_mono, Palette.MATRIX_BRIGHT)

        if state.has_operator_access:
            self.admin_tools_rect = pygame.Rect(self.width - 190, 10, 172, 36)
            self.panel(self.admin_tools_rect, Palette.MATRIX_PANEL_2, Palette.MATRIX_GREEN, radius=4, width=1)
            self.text(
                "OPERATOR MENU  M",
                (self.admin_tools_rect.x + 15, self.admin_tools_rect.y + 11),
                self.font_mono,
                Palette.MATRIX_BRIGHT,
            )
        else:
            self.admin_tools_rect = pygame.Rect(0, 0, 0, 0)
            self.text("LIVE OBJECT ACCESS", (self.width - 174, 21), self.font_mono, Palette.MATRIX_DIM)

    def draw_tower_footer(self, state: OfficeState, scene: TowerScene) -> None:
        footer = pygame.Rect(18, 600, self.width - 36, 104)
        self.panel(footer, Palette.MATRIX_BG, Palette.MATRIX_GRID, radius=5, width=1)
        self.draw_minimap(scene, pygame.Rect(30, 616, 218, 76))
        nearby = scene.nearby_object
        if nearby:
            prompt = pygame.Rect(270, 620, min(430, self.width - 600), 30)
            self.panel(prompt, Palette.MATRIX_PANEL_2, Palette.MATRIX_AMBER, radius=3, width=1)
            self.text(f"[E] {nearby.prompt}", (282, 629), self.font_md, Palette.MATRIX_BRIGHT)
            self.text(f"ROOM  {scene.room.label}  /  OBJECT  {nearby.label}", (274, 661), self.font_mono, Palette.MATRIX_DIM)
        else:
            self.text("WALK CLOSER TO A LIVE OBJECT", (274, 628), self.font_md, Palette.MATRIX_BRIGHT)
            self.text(f"ROOM  {scene.room.label}", (274, 661), self.font_mono, Palette.MATRIX_DIM)
        self.text(state.notice, (720, 625), self.font_mono, Palette.MATRIX_GREEN)
        self.draw_tool_inventory(state, pygame.Rect(self.width - 286, 616, 256, 76))

    def matrix_panel(
        self,
        rect: pygame.Rect,
        accent: tuple[int, int, int] = Palette.MATRIX_GREEN,
    ) -> None:
        """A restrained game-console panel: bevel, grid, and object accents."""
        self.panel(rect, Palette.MATRIX_PANEL, accent, radius=4, width=1)
        inner = rect.inflate(-8, -8)
        for x in range(inner.left + 12, inner.right, 28):
            pygame.draw.line(self.screen, Palette.MATRIX_GRID, (x, inner.top), (x, inner.bottom), 1)
        for y in range(inner.top + 12, inner.bottom, 18):
            pygame.draw.line(self.screen, Palette.MATRIX_GRID, (inner.left, y), (inner.right, y), 1)
        for point in (
            (rect.left + 5, rect.top + 5),
            (rect.right - 5, rect.top + 5),
            (rect.left + 5, rect.bottom - 5),
            (rect.right - 5, rect.bottom - 5),
        ):
            pygame.draw.circle(self.screen, accent, point, 2)

    def draw_minimap(self, scene: TowerScene, rect: pygame.Rect) -> None:
        self.matrix_panel(rect, Palette.MATRIX_DIM)
        self.text("LOCAL MAP", (rect.x + 10, rect.y + 7), self.font_mono, Palette.MATRIX_BRIGHT)
        map_rect = pygame.Rect(rect.x + 10, rect.y + 26, rect.width - 20, rect.height - 34)
        map_scale_x = map_rect.width / max(1, scene.width)
        map_scale_y = map_rect.height / max(1, scene.height)
        for room in scene.rooms:
            x, y, width, height = room.bounds
            room_rect = pygame.Rect(
                map_rect.x + int(x * map_scale_x),
                map_rect.y + int(y * map_scale_y),
                max(4, int(width * map_scale_x)),
                max(4, int(height * map_scale_y)),
            )
            color = Palette.MATRIX_GREEN if room.id == scene.current_room else Palette.MATRIX_DIM
            pygame.draw.rect(self.screen, color, room_rect, width=2)
        px, py = scene.player_position
        player_point = (
            map_rect.x + int(px * map_scale_x),
            map_rect.y + int(py * map_scale_y),
        )
        pygame.draw.circle(self.screen, Palette.MATRIX_AMBER, player_point, 3)

    def draw_tool_inventory(self, state: OfficeState, rect: pygame.Rect) -> None:
        self.matrix_panel(rect, Palette.MATRIX_AMBER)
        self.text("TOOL BELT", (rect.x + 10, rect.y + 7), self.font_mono, Palette.MATRIX_BRIGHT)
        entries = [(key, value) for key, value in state.office_inventory.items() if value > 0]
        if not entries:
            self.text("EMPTY / USE LIVE VENDING", (rect.x + 10, rect.y + 34), self.font_mono, Palette.MATRIX_DIM)
            return
        for index, (item_id, quantity) in enumerate(entries[:3]):
            label = item_id.replace("_", " ").upper()[:14]
            self.text(f"{index + 1} {label}", (rect.x + 10 + index * 82, rect.y + 34), self.font_mono, Palette.MATRIX_GREEN)
            self.text(f"x{quantity}", (rect.x + 10 + index * 82, rect.y + 51), self.font_mono, Palette.MATRIX_DIM)

    def draw_operator_menu(self, state: OfficeState) -> None:
        menu = pygame.Rect(self.width - 242, 60, 224, 126)
        self.matrix_panel(menu, Palette.MATRIX_GREEN)
        self.text("OPERATOR ACCESS", (menu.x + 14, menu.y + 12), self.font_md, Palette.MATRIX_BRIGHT)
        self.text(f"ROLE / {state.role.upper()}", (menu.x + 14, menu.y + 35), self.font_mono, Palette.MATRIX_DIM)
        self.admin_economy_rect = pygame.Rect(menu.x + 12, menu.y + 60, menu.width - 24, 24)
        self.admin_maintenance_rect = pygame.Rect(menu.x + 12, menu.y + 91, menu.width - 24, 24)
        for rect, label in (
            (self.admin_economy_rect, "ECONOMIC CONTROL"),
            (self.admin_maintenance_rect, "TOOLS / MAINTENANCE"),
        ):
            self.panel(rect, Palette.MATRIX_PANEL_2, Palette.MATRIX_DIM, radius=2, width=1)
            self.text(label, (rect.x + 10, rect.y + 7), self.font_mono, Palette.MATRIX_GREEN)

    def draw_game_page(self, state: OfficeState, scene: TowerScene) -> None:
        veil = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pygame.draw.rect(veil, (2, 8, 10, 218), pygame.Rect(0, 58, self.width, self.height - 58))
        self.screen.blit(veil, (0, 0))
        page = pygame.Rect(42, 76, self.width - 84, 514)
        accent = Palette.MATRIX_AMBER if state.active_page == "economy" else Palette.MATRIX_GREEN
        self.matrix_panel(page, accent)
        self.text(
            "ECONOMIC CONTROL" if state.active_page == "economy" else "TOOLS / MAINTENANCE",
            (page.x + 24, page.y + 18),
            self.font_xl,
            Palette.MATRIX_BRIGHT,
        )
        source = state.page_source or "LIVE OBJECT"
        self.text(f"ACCESS PATH / {source}", (page.x + 26, page.y + 54), self.font_mono, Palette.MATRIX_DIM)
        self.overlay_close_rect = pygame.Rect(page.right - 108, page.y + 18, 82, 28)
        self.panel(self.overlay_close_rect, Palette.MATRIX_PANEL_2, accent, radius=2, width=1)
        self.text("CLOSE  ESC", (self.overlay_close_rect.x + 10, self.overlay_close_rect.y + 8), self.font_mono, accent)
        if state.active_page == "economy":
            self.draw_economy_page(state, page)
        else:
            self.draw_tools_page(state, page)

    def draw_economy_page(self, state: OfficeState, page: pygame.Rect) -> None:
        cards = (
            (pygame.Rect(page.x + 24, page.y + 86, 250, 112), "AVAILABLE", f"ƒ{state.funds:,.2f}", Palette.MATRIX_BRIGHT),
            (pygame.Rect(page.x + 290, page.y + 86, 250, 112), "NET TODAY", f"{'+' if state.net_today >= 0 else ''}ƒ{state.net_today:,.2f}", Palette.MATRIX_GREEN),
            (pygame.Rect(page.x + 556, page.y + 86, 250, 112), "DECAY LOAD", f"{state.decay:,.1f}%  {state.decay_label}", Palette.MATRIX_AMBER),
        )
        for rect, label, value, color in cards:
            self.matrix_panel(rect, color)
            self.text(label, (rect.x + 16, rect.y + 16), self.font_mono, Palette.MATRIX_DIM)
            self.text(value, (rect.x + 16, rect.y + 48), self.font_lg, color)
        ledger = pygame.Rect(page.x + 24, page.y + 218, page.width - 48, 224)
        self.matrix_panel(ledger, Palette.MATRIX_AMBER)
        self.text("LIVE LEDGER / RECENT MOVEMENT", (ledger.x + 16, ledger.y + 14), self.font_md, Palette.MATRIX_BRIGHT)
        self.text("ENTRY", (ledger.x + 16, ledger.y + 45), self.font_mono, Palette.MATRIX_DIM)
        self.text("DELTA", (ledger.right - 230, ledger.y + 45), self.font_mono, Palette.MATRIX_DIM)
        self.text("BALANCE", (ledger.right - 102, ledger.y + 45), self.font_mono, Palette.MATRIX_DIM)
        for index, entry in enumerate(reversed(state.ledger[-7:])):
            y = ledger.y + 72 + index * 20
            color = Palette.MATRIX_GREEN if entry.amount >= 0 else Palette.CORAL
            self.text(entry.label.upper()[:43], (ledger.x + 16, y), self.font_mono, Palette.MATRIX_BRIGHT)
            self.text(f"{'+' if entry.amount >= 0 else ''}ƒ{entry.amount:,.2f}", (ledger.right - 230, y), self.font_mono, color)
            self.text(f"ƒ{entry.balance:,.2f}", (ledger.right - 102, y), self.font_mono, Palette.MATRIX_DIM)

    def draw_tools_page(self, state: OfficeState, page: pygame.Rect) -> None:
        decay_card = pygame.Rect(page.x + 24, page.y + 86, 420, 300)
        self.matrix_panel(decay_card, Palette.MATRIX_GREEN)
        self.text("DECAY CONTROL", (decay_card.x + 18, decay_card.y + 16), self.font_lg, Palette.MATRIX_BRIGHT)
        self.text("NEGLECT REDUCES OUTPUT / MAINTENANCE RESTORES CAPACITY", (decay_card.x + 18, decay_card.y + 50), self.font_mono, Palette.MATRIX_DIM)
        self.text(f"{state.decay:02.1f}%  {state.decay_label}", (decay_card.x + 18, decay_card.y + 92), self.font_xl, Palette.MATRIX_AMBER)
        bar = pygame.Rect(decay_card.x + 18, decay_card.y + 145, decay_card.width - 36, 18)
        pygame.draw.rect(self.screen, Palette.MATRIX_BG, bar)
        pygame.draw.rect(self.screen, Palette.MATRIX_AMBER, pygame.Rect(bar.x, bar.y, max(2, int(bar.width * state.decay_ratio)), bar.height))
        self.text(f"OUTPUT MULTIPLIER  x{state.decay_efficiency_multiplier:.2f}", (decay_card.x + 18, decay_card.y + 184), self.font_mono, Palette.MATRIX_BRIGHT)
        self.text("WORK THE SYSTEM OR IT WORKS AGAINST YOU.", (decay_card.x + 18, decay_card.y + 214), self.font_mono, Palette.MATRIX_GREEN)
        self.repair_rect = pygame.Rect(decay_card.x + 18, decay_card.bottom - 48, decay_card.width - 36, 30)
        self.panel(self.repair_rect, Palette.MATRIX_PANEL_2, Palette.MATRIX_GREEN, radius=2, width=1)
        cost = 40 + round(state.decay * 0.5)
        self.text(f"RUN MAINTENANCE  ƒ{cost}", (self.repair_rect.x + 14, self.repair_rect.y + 9), self.font_mono, Palette.MATRIX_BRIGHT)

        inventory = pygame.Rect(page.x + 468, page.y + 86, page.width - 492, 300)
        self.matrix_panel(inventory, Palette.MATRIX_AMBER)
        self.text("FIELD TOOLS", (inventory.x + 18, inventory.y + 16), self.font_lg, Palette.MATRIX_BRIGHT)
        self.text("OBJECTS FEED THE BELT / THE BELT KEEPS WORK MOVING", (inventory.x + 18, inventory.y + 50), self.font_mono, Palette.MATRIX_DIM)
        entries = [(key, value) for key, value in state.office_inventory.items() if value > 0]
        if entries:
            for index, (item_id, quantity) in enumerate(entries[:6]):
                row = pygame.Rect(inventory.x + 18, inventory.y + 82 + index * 30, inventory.width - 36, 24)
                self.panel(row, Palette.MATRIX_PANEL_2, Palette.MATRIX_GRID, radius=2, width=1)
                self.text(item_id.replace("_", " ").upper(), (row.x + 10, row.y + 7), self.font_mono, Palette.MATRIX_GREEN)
                self.text(f"x{quantity}", (row.right - 46, row.y + 7), self.font_mono, Palette.MATRIX_BRIGHT)
        else:
            self.text("NO FIELD TOOLS / VISIT A LIVE VENDING MACHINE", (inventory.x + 18, inventory.y + 96), self.font_mono, Palette.MATRIX_DIM)

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