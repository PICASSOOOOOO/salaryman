"""Solar-punk Pygame renderer and vector UI primitives."""

from __future__ import annotations

from datetime import datetime
import math
import os
from pathlib import Path

import pygame

from .animation import character_pose
from .automation import AUTOMATION_CHARACTERS
from .business_services import BUSINESS_ACTION_LABELS
from .customization import (
    DECOR_PRESETS,
    WALL_FINISHES,
    WALL_FINISH_BY_ID,
    room_decor_placements,
)
from .models import Worker
from .pest_work import MELEE_MOVES, PEST_JOBS, STAMINA_SUPPLY_ITEMS
from .scene import FLOOR_PLAN, TowerScene
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
        self.system_module_rects: dict[str, pygame.Rect] = {}
        self.repair_rect = pygame.Rect(0, 0, 0, 0)
        self.admin_tools_rect = pygame.Rect(0, 0, 0, 0)
        self.admin_economy_rect = pygame.Rect(0, 0, 0, 0)
        self.admin_maintenance_rect = pygame.Rect(0, 0, 0, 0)
        self.customize_wall_rects: dict[str, pygame.Rect] = {}
        self.customize_decor_rects: dict[str, pygame.Rect] = {}
        self.worker_rects: dict[int, pygame.Rect] = {}
        self.recruitment_rect = pygame.Rect(0, 0, 0, 0)
        self.refresh_rect = pygame.Rect(0, 0, 0, 0)
        self.candidate_rects: dict[int, pygame.Rect] = {}
        self._pixel_assets: dict[str, pygame.Surface] = {}
        self._last_actor_positions: dict[str, tuple[int, int]] = {}
        self._last_player_room: str | None = None
        self.pablo_status = "PABLO CORE / OFFLINE"
        self.pablo_status_color = Palette.MATRIX_DIM
        self._floor_tiles: tuple[pygame.Surface, ...] | None = None
        self._facing = "down"
        self._anim_tick = 0
        self._character_frame_cache: dict[tuple[str, str, int], pygame.Surface] = {}
        self._asset_root = self._find_pixel_assets()
        self._camera_scale = 0.0
        self._camera_x = 0.0
        self._camera_y = 0.0
        self._camera_room: tuple[int, str] | None = None
        self.game_page_actions: dict[str, pygame.Rect] = {}

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

    def draw_tower(
        self,
        state: OfficeState,
        scene: TowerScene,
        *,
        delta_seconds: float = 1 / 60,
    ) -> None:
        """Render the authoritative scene as a camera-following pixel-art room."""
        self.screen.fill((8, 43, 49))
        self.draw_tower_header(state, scene)
        viewport = pygame.Rect(18, 68, self.width - 36, 520)
        self._draw_pixel_room(viewport, scene, state, delta_seconds=delta_seconds)

        self.draw_tower_footer(state, scene)
        if state.active_page is not None:
            if state.active_page == "automation":
                self.draw_automation_page(state, scene)
            elif state.active_page == "customize":
                self.draw_customization_page(state, scene)
            elif state.active_page == "systems":
                self.draw_device_page(state, scene)
            elif state.active_page in {"player", "settings", "inventory", "vending", "bank", "phone", "reception"}:
                self.draw_player_service_page(state, scene)
            else:
                self.draw_game_page(state, scene)
        elif state.tool_menu_open:
            self.draw_operator_menu(state)

    def _draw_pixel_room(
        self,
        viewport: pygame.Rect,
        scene: TowerScene,
        state: OfficeState,
        *,
        delta_seconds: float,
    ) -> None:
        room_x, room_y, room_w, room_h = scene.room.bounds
        # Keep the playable office readable at trailer scale. The prior broad
        # framing left too much empty floor around the salaryman, making the
        # real object prompts and NPC actions look static at a glance.
        base_scale = max(
            0.32,
            min(
                0.58,
                min((viewport.width - 44) / room_w, (viewport.height - 44) / room_h)
                * 2.0,
            ),
        )
        focus_id = state.active_object_id
        focus_object = scene.objects.get(focus_id) if focus_id else None
        if focus_object is None and scene.camera_focus_seconds > 0:
            focus_object = scene.objects.get(scene.camera_focus_object_id or "")
        if (
            focus_object is not None
            and focus_object.room == scene.current_room
            and focus_object.camera_focus_enabled
        ):
            target_scale = max(base_scale, 0.88)
            target_center = focus_object.visual_position
        else:
            target_scale = base_scale
            target_center = scene.player_position

        room_key = (scene.current_floor, scene.current_room)
        view_w = viewport.width / max(0.01, target_scale)
        view_h = viewport.height / max(0.01, target_scale)

        def camera_origin(center: float, size: float, origin: float, extent: float) -> float:
            if size >= extent:
                return origin + (extent - size) / 2
            return max(origin, min(center - size / 2, origin + extent - size))

        target_x = camera_origin(target_center[0], view_w, room_x, room_w)
        target_y = camera_origin(target_center[1], view_h, room_y, room_h)
        if self._camera_room != room_key or self._camera_scale <= 0:
            self._camera_room = room_key
            self._camera_scale = base_scale
            base_view_w = viewport.width / base_scale
            base_view_h = viewport.height / base_scale
            self._camera_x = camera_origin(
                scene.player_position[0], base_view_w, room_x, room_w
            )
            self._camera_y = camera_origin(
                scene.player_position[1], base_view_h, room_y, room_h
            )
        blend = 1.0 - math.exp(-7.0 * max(0.0, delta_seconds))
        self._camera_scale += (target_scale - self._camera_scale) * blend
        view_w = viewport.width / max(0.01, self._camera_scale)
        view_h = viewport.height / max(0.01, self._camera_scale)
        target_x = camera_origin(target_center[0], view_w, room_x, room_w)
        target_y = camera_origin(target_center[1], view_h, room_y, room_h)
        self._camera_x += (target_x - self._camera_x) * blend
        self._camera_y += (target_y - self._camera_y) * blend
        scale = self._camera_scale
        camera_x, camera_y = self._camera_x, self._camera_y
        view_w, view_h = viewport.width / scale, viewport.height / scale
        pygame.draw.rect(self.screen, (23, 31, 35), viewport)
        appearance = state.get_room_customization(scene.current_room)
        wall_finish = WALL_FINISH_BY_ID[appearance["wall_style"]]
        self._draw_square_office_floor(
            viewport,
            scene.room.bounds,
            camera_x,
            camera_y,
            scale,
            floor_number=scene.current_floor,
        )
        def point(position: tuple[int, int]) -> tuple[int, int]:
            return (
                viewport.x + int((position[0] - camera_x) * scale),
                viewport.y + int((position[1] - camera_y) * scale),
            )
        # Keep the architecture legible at close camera distances. Repeating
        # the tiny source wall tile becomes visual noise and collides with the
        # room label, so use a clean structural beam instead.
        beam = pygame.Rect(viewport.x + 8, viewport.y, viewport.width - 16, 42)
        pygame.draw.rect(self.screen, wall_finish.beam, beam)
        pygame.draw.line(self.screen, wall_finish.edge, beam.topleft, beam.topright, 2)
        pygame.draw.line(self.screen, wall_finish.detail, beam.bottomleft, beam.bottomright, 2)
        for x in range(beam.left + 10, beam.right, 34):
            pygame.draw.line(
                self.screen,
                wall_finish.detail,
                (x, beam.top + 6),
                (x, beam.bottom - 5),
                1,
            )
        lower_beam = pygame.Rect(viewport.x + 8, viewport.bottom - 13, viewport.width - 16, 13)
        pygame.draw.rect(self.screen, wall_finish.lower_beam, lower_beam)
        pygame.draw.line(
            self.screen,
            wall_finish.edge,
            lower_beam.topleft,
            lower_beam.topright,
            2,
        )
        location_label = (
            f"BASEMENT B{scene.basement_level}"
            if scene.is_basement
            else f"FLOOR {scene.current_floor:02d} / BASE"
        )
        self.text(location_label, (viewport.x + 18, viewport.y + 14), self.font_lg, Palette.GLASS_BRIGHT)

        content_clip = pygame.Rect(
            viewport.x,
            viewport.y + 43,
            viewport.width,
            viewport.height - 56,
        )
        previous_clip = self.screen.get_clip()
        self.screen.set_clip(content_clip)

        # Personal decor is visual-only. The scene's object registry remains
        # the authority for interaction and collision.
        placements = room_decor_placements(
            scene.current_room,
            scene.room.bounds,
            appearance["decor_style"],
        )
        for asset, position in placements:
            screen_position = point(position)
            depth = max(0.72, min(1.28, 0.72 + (screen_position[1] - viewport.top) / max(1, viewport.height) * 0.56))
            self._draw_sprite_shadow(screen_position, depth)
            self._blit_furniture(asset, screen_position, scale, depth_scale=depth)
        for item in scene.objects.objects:
            if item.room != scene.current_room:
                continue
            ix, iy = point(item.visual_position)
            depth = max(0.72, min(1.28, 0.72 + (iy - viewport.top) / max(1, viewport.height) * 0.56))
            self._draw_tower_object(item.kind, ix, iy, item == scene.nearby_object, scale, depth)
            if item.kind in {"business_suite", "business_kiosk"}:
                label = item.label.upper()[:27]
                label_surface = self.font_sm.render(label, True, Palette.INK)
                tag = pygame.Rect(ix - label_surface.get_width() // 2 - 5, iy - 40, label_surface.get_width() + 10, 18)
                pygame.draw.rect(self.screen, (228, 234, 211), tag, border_radius=3)
                pygame.draw.rect(self.screen, (73, 109, 94), tag, 1, border_radius=3)
                self.screen.blit(label_surface, (tag.x + 5, tag.y + 2))
            if item == scene.nearby_object:
                pygame.draw.circle(self.screen, (255, 224, 112), (ix, iy), 20, 2)
                self.text("[E] " + item.label, (ix + 18, iy - 24), self.font_sm, Palette.SUN)
        self._draw_office_workstations(point, scene, scale)
        self._draw_office_npcs(point, scene, state, scale)
        self._draw_automation_npcs(point, scene, scale)
        self._draw_basement_actors(point, scene)
        if scene.velocity != (0.0, 0.0):
            vx, vy = scene.velocity
            self._facing = "right" if abs(vx) > abs(vy) and vx > 0 else "left" if abs(vx) > abs(vy) else "down" if vy > 0 else "up"
        player_position = scene.player_position
        player_moving = self._actor_is_moving("player", player_position)
        player_moving = player_moving and self._last_player_room == scene.current_room
        self._last_player_room = scene.current_room
        if player_moving:
            self._anim_tick += 1
        self._draw_player(
            *point(player_position),
            scale=scale,
            moving=player_moving,
            action=scene.player_action,
            action_elapsed=scene.player_action_elapsed,
        )
        self.screen.set_clip(previous_clip)

    def _draw_office_npcs(
        self,
        point: object,
        scene: TowerScene,
        state: OfficeState,
        scale: float,
    ) -> None:
        """Place the office roster into the active room as visible NPCs."""
        character_assets = (
            "characters/char_1.png",
            "characters/char_2.png",
            "characters/char_3.png",
            "characters/char_4.png",
            "characters/char_5.png",
        )
        for index, worker in enumerate(state.roster.workers[: len(character_assets)]):
            pose = scene.npc_pose(scene.current_room, index)
            if pose is None:
                continue
            (npc_x, npc_y), facing = pose
            screen_x, screen_y = point((npc_x, npc_y))
            character_variant = index % 7
            moving = self._actor_is_moving(f"worker:{index}:{worker.name}", (npc_x, npc_y))
            self._draw_npc(
                screen_x,
                screen_y,
                worker.name,
                worker.accent,
                scale,
                facing=facing,
                character_variant=character_variant,
                animation_tick=int(scene.npc_motion_seconds * 60),
                moving=moving,
                character_asset=character_assets[index],
            )

    def _draw_automation_npcs(
        self,
        point: object,
        scene: TowerScene,
        scale: float,
    ) -> None:
        """Render linked automation roles as inspectable, moving coworkers."""
        nearby = scene.nearby_automation_character
        for index, agent in enumerate(scene.automation_character_states()):
            world_position = (int(agent["x"]), int(agent["y"]))
            screen_x, screen_y = point(world_position)
            raw_accent = agent.get("accent")
            accent = (
                tuple(int(channel) for channel in raw_accent)
                if isinstance(raw_accent, (list, tuple))
                else (146, 175, 161)
            )
            if len(accent) != 3:
                accent = (146, 175, 161)
            enabled = agent.get("enabled")
            sync_state = agent.get("syncState")
            if enabled is True:
                label, label_color = "ENABLED", accent
            elif enabled is False:
                label, label_color = "PAUSED", (193, 197, 174)
            elif sync_state == "connecting":
                label, label_color = "SYNCING", (205, 173, 113)
            elif sync_state == "unlinked":
                label, label_color = "UNLINKED", (173, 184, 166)
            else:
                label, label_color = "UNAVAILABLE", (196, 150, 125)
            character_variant = index % 7
            moving = self._actor_is_moving(
                f"automation:{agent.get('domain', index)}",
                world_position,
            )
            self._draw_npc(
                screen_x,
                screen_y,
                str(agent.get("name", "AUTO")),
                accent,
                scale,
                facing=str(agent.get("facing", "down")),
                character_variant=character_variant,
                animation_tick=int(scene.npc_motion_seconds * 60),
                moving=moving,
                character_asset=str(agent.get("sprite", "characters/char_1.png")),
            )
            self.text(label, (screen_x - 40, screen_y + 12), self.font_sm, label_color)
            if nearby is not None and nearby.domain == agent.get("domain"):
                pygame.draw.circle(self.screen, (255, 224, 112), (screen_x, screen_y), 22, 2)
                self.text(
                    f"[E] INSPECT {agent.get('name', 'AUTO')}",
                    (screen_x + 18, screen_y - 25),
                    self.font_sm,
                    Palette.SUN,
                )

    def _actor_is_moving(self, actor_id: str, position: tuple[int, int]) -> bool:
        previous = self._last_actor_positions.get(actor_id)
        self._last_actor_positions[actor_id] = position
        return previous is not None and previous != position

    def _draw_npc(
        self,
        x: int,
        y: int,
        name: str,
        accent: tuple[int, int, int],
        scale: float,
        *,
        facing: str,
        character_variant: int,
        animation_tick: int,
        moving: bool,
        character_asset: str,
    ) -> None:
        """Draw a moving teammate with the same stable sprite path as the player."""
        variant, offset_x, offset_y = character_pose(
            character_variant,
            animation_tick,
            moving=moving,
        )
        rendered, bounds, sprite_scale = self._character_sprite(
            facing,
            variant,
            scale,
            npc=True,
            character_asset=character_asset,
        )
        if rendered is not None and bounds is not None:
            self._draw_sprite_shadow((x, y), sprite_scale / 3.0)
            self.screen.blit(
                rendered,
                (
                    round(x - (bounds.left + bounds.width / 2.0)) + offset_x,
                    y + 7 - bounds.bottom + offset_y,
                ),
            )
            label_y = y + 7 - bounds.bottom - 15
        else:
            label_y = y - 52
        pygame.draw.circle(self.screen, accent, (x, label_y + 5), 4)
        self.text(name.upper()[:14], (x - 34, label_y - 8), self.font_mono, accent)

    def _draw_basement_actors(self, point: object, scene: TowerScene) -> None:
        if not scene.is_basement or scene.basement_snapshot is None:
            return
        snapshot = scene.basement_snapshot
        building = snapshot.get("building")
        if isinstance(building, dict):
            vitals = (
                f"POWER {building.get('powerCondition', 0)}%"
                f"  WATER {building.get('plumbingCondition', 0)}%"
                f"  UPKEEP {building.get('upkeepCondition', 0)}%"
            )
            self.text(vitals, (28, 122), self.font_mono, Palette.MATRIX_GREEN)

        operations = snapshot.get("towerOperations")
        if isinstance(operations, dict):
            player = snapshot.get("player")
            carried = player.get("carriedTrash", 0) if isinstance(player, dict) else 0
            status = (
                f"TRASH {operations.get('accumulatedTrash', 0)}"
                f"  LOADING {operations.get('incomingSupplyCrates', 0)}"
                f"  B4 STOCK {operations.get('storedSupplyCrates', 0)}"
                f"  CARRY {carried}"
            )
            self.text(status, (28, 146), self.font_mono, Palette.MATRIX_DIM)

        crew = snapshot.get("npcCrew", [])
        if isinstance(crew, list):
            for member in crew:
                if not isinstance(member, dict):
                    continue
                x, y = point((int(member["x"]), int(member["y"])))
                pygame.draw.ellipse(self.screen, (17, 22, 20), (x - 10, y + 6, 20, 7))
                pygame.draw.circle(self.screen, (217, 176, 130), (x, y - 7), 5)
                pygame.draw.rect(self.screen, (82, 145, 112), (x - 6, y - 2, 12, 14), border_radius=3)
                label = str(member.get("label", "STAFF")).split(" / ", 1)[0][:14].upper()
                self.text(label, (x - 34, y - 25), self.font_mono, Palette.MATRIX_DIM)

        pests = snapshot.get("pests", [])
        if isinstance(pests, list):
            for pest in pests:
                if not isinstance(pest, dict) or pest.get("status") == "sold":
                    continue
                x, y = point((int(pest["x"]), int(pest["y"])))
                active = pest.get("status") == "active"
                claimed = pest.get("claimedByYou") is True
                color = Palette.CORAL if active else (
                    Palette.MATRIX_GREEN if claimed else (132, 143, 137)
                )
                width = max(12, int(22 * max(0.5, min(1.5, self._camera_scale))))
                pygame.draw.ellipse(
                    self.screen,
                    (15, 18, 17),
                    (x - width // 2, y + 3, width, max(6, width // 3)),
                )
                pygame.draw.ellipse(
                    self.screen,
                    color,
                    (x - width // 2, y - width // 3, width, max(8, width // 2)),
                )
                label = (
                    f"{str(pest.get('kind', 'pest')).upper()} "
                    f"{pest.get('health', 0)}/{pest.get('maxHealth', 0)}"
                    if active
                    else ("CARRY" if claimed else "CARCASS")
                )
                self.text(label, (x - 42, y - width // 2 - 20), self.font_mono, color)

    def _draw_office_workstations(
        self,
        point: object,
        scene: TowerScene,
        scale: float,
    ) -> None:
        """Build the office around real desk, chair, and PC assets."""
        layouts = {
            "executive": (
                # Executive workstations are registry-owned composite objects.
            ),
            "public": (
                ((3_260, 5_950), (3_260, 6_210), (3_260, 5_850), "cushioned"),
                ((4_440, 5_950), (4_440, 6_210), (4_440, 5_850), "wooden"),
                ((3_260, 7_020), (3_260, 6_760), (3_260, 7_110), "wooden"),
                ((4_440, 7_020), (4_440, 6_760), (4_440, 7_110), "cushioned"),
            ),
            "office_03": (
                ((5_360, 5_950), (5_360, 6_210), (5_360, 5_850), "cushioned"),
                ((6_540, 5_950), (6_540, 6_210), (6_540, 5_850), "wooden"),
                ((5_360, 7_020), (5_360, 6_760), (5_360, 7_110), "wooden"),
                ((6_540, 7_020), (6_540, 6_760), (6_540, 7_110), "cushioned"),
            ),
            "office_04": (
                ((7_460, 5_950), (7_460, 6_210), (7_460, 5_850), "cushioned"),
                ((8_640, 5_950), (8_640, 6_210), (8_640, 5_850), "wooden"),
                ((7_460, 7_020), (7_460, 6_760), (7_460, 7_110), "wooden"),
                ((8_640, 7_020), (8_640, 6_760), (8_640, 7_110), "cushioned"),
            ),
        }
        layout = layouts.get(scene.current_room)
        if layout is None:
            return

        def screen_position(position: tuple[int, int]) -> tuple[int, int]:
            return point(position)

        # Low panels make the repeated desk clusters read as cubicles without
        # inventing a non-existent cubicle sprite. The executive room stays a
        # single private office and uses its live desk object instead.

        for desk_position, chair_position, _pc_position, chair_style in layout:
            desk_screen = screen_position(desk_position)
            chair_screen = screen_position(chair_position)
            # PC_FRONT_ON is a tabletop asset. Anchor it to the desk rather
            # than treating it as a floor prop; the previous -100 world-unit
            # offset left the monitor visibly floating above the workstation.
            pc_screen = screen_position((desk_position[0], desk_position[1] - 30))
            depth = max(0.72, min(1.28, 0.72 + (desk_screen[1] - 68) / 520 * 0.56))
            chair_asset = (
                "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png"
                if chair_style == "cushioned"
                else "furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png"
            )
            self._draw_sprite_shadow(chair_screen, depth)
            self._blit_furniture(chair_asset, chair_screen, scale, depth_scale=depth)
            self._draw_sprite_shadow(desk_screen, depth)
            self._blit_furniture("furniture/DESK/DESK_FRONT.png", desk_screen, scale, depth_scale=depth)
            self._blit_furniture("furniture/PC/PC_FRONT_ON_1.png", pc_screen, scale, depth_scale=depth)
            lamp_screen = screen_position(
                (desk_position[0] - 100, desk_position[1] - 58)
            )
            self._draw_tower_object(
                "desk_lamp",
                lamp_screen[0],
                lamp_screen[1],
                False,
                scale,
                depth,
            )

    def _draw_square_office_floor(
        self,
        viewport: pygame.Rect,
        world_bounds: tuple[int, int, int, int],
        camera_x: float,
        camera_y: float,
        scale: float,
        *,
        floor_number: int = 1,
    ) -> None:
        """Draw a massive world-anchored floor through a straight top-down camera."""
        world_x, world_y, world_w, world_h = world_bounds
        is_lobby = floor_number == 1
        is_premium = floor_number >= 63
        pygame.draw.rect(
            self.screen,
            (188, 194, 188) if is_lobby else (27, 38, 42) if is_premium else (174, 179, 175),
            viewport,
        )
        old_clip = self.screen.get_clip()
        self.screen.set_clip(viewport)

        def world_rect(rect: tuple[int, int, int, int]) -> pygame.Rect:
            x, y, width, height = rect
            return pygame.Rect(
                viewport.x + int((x - camera_x) * scale),
                viewport.y + int((y - camera_y) * scale),
                max(1, int(width * scale)),
                max(1, int(height * scale)),
            )

        center_x = world_x + world_w // 2
        center_y = world_y + world_h // 2

        base_layout = FLOOR_PLAN["baseLayout"]
        if is_lobby:
            # The lobby is a separate arrival scene: one broad reception
            # chamber, lounge seating, and the lift core instead of office
            # rectangles.
            lobby = world_rect((center_x - 9_000, center_y - 7_000, 18_000, 14_000))
            pygame.draw.rect(self.screen, (204, 207, 194), lobby)
            pygame.draw.rect(self.screen, (80, 101, 92), lobby, max(1, int(34 * scale)))
            reception = world_rect((center_x - 2_600, center_y - 2_000, 5_200, 1_000))
            pygame.draw.rect(self.screen, (91, 116, 101), reception)
            pygame.draw.rect(self.screen, (205, 183, 117), reception, max(1, int(12 * scale)))
            for seat_x in (center_x - 5_200, center_x - 3_200, center_x + 3_200, center_x + 5_200):
                lounge = world_rect((seat_x - 550, center_y + 2_000 - 300, 1_100, 600))
                pygame.draw.rect(self.screen, (111, 133, 120), lounge)
                pygame.draw.rect(self.screen, (69, 89, 82), lounge, max(1, int(8 * scale)))
        else:
            office_fill = (46, 61, 70) if is_premium else (179, 184, 179)
            office_stroke = (202, 170, 92) if is_premium else (100, 111, 107)
            hallway_fill = (47, 61, 67) if is_premium else (126, 134, 131)
            hallway_stroke = (225, 203, 139) if is_premium else (207, 212, 207)
            # Four individual office rectangles sit around the horizontal and
            # vertical hallway. The hall stays continuous from the lift core
            # to every office entrance.
            for office in base_layout["offices"]:
                bay = world_rect(tuple(office["bounds"]))
                pygame.draw.rect(self.screen, office_fill, bay)
                pygame.draw.rect(self.screen, office_stroke, bay, max(1, int(24 * scale)))

            for hallway_data in base_layout["hallways"]:
                hallway = world_rect(tuple(hallway_data))
                pygame.draw.rect(self.screen, hallway_fill, hallway)
                pygame.draw.rect(self.screen, hallway_stroke, hallway, 2)

        def draw_persian_rug(rug_data: tuple[int, int, int, int]) -> None:
            rug = world_rect(rug_data)
            if not rug.colliderect(viewport):
                return
            pygame.draw.rect(self.screen, (86, 27, 38), rug)
            border_1 = rug.inflate(-max(2, int(80 * scale)), -max(2, int(80 * scale)))
            pygame.draw.rect(self.screen, (207, 154, 67), border_1, max(1, int(34 * scale)))
            border_2 = border_1.inflate(-max(2, int(120 * scale)), -max(2, int(120 * scale)))
            pygame.draw.rect(self.screen, (28, 58, 77), border_2)
            center = border_2.inflate(-max(2, int(150 * scale)), -max(2, int(150 * scale)))
            pygame.draw.rect(self.screen, (177, 57, 52), center)
            motif_w = max(5, int(min(180, rug_data[2] // 5) * scale))
            motif_h = max(5, int(min(180, rug_data[3] // 5) * scale))
            motif = pygame.Rect(0, 0, motif_w, motif_h)
            motif.center = rug.center
            pygame.draw.rect(self.screen, (187, 126, 72), motif)
            pygame.draw.rect(self.screen, (47, 67, 76), motif.inflate(-2, -2))

            # Quiet woven repeats: low-contrast blocks and border ticks rather
            # than loud geometric emblems.
            accent = (157, 91, 68)
            tick = max(2, int(22 * scale))
            for x_ratio in (0.25, 0.75):
                for y_ratio in (0.32, 0.68):
                    x = border_2.left + int(border_2.width * x_ratio)
                    y = border_2.top + int(border_2.height * y_ratio)
                    pygame.draw.rect(
                        self.screen,
                        accent,
                        pygame.Rect(x - tick, y - tick, tick * 2, tick * 2),
                    )
            pygame.draw.line(
                self.screen,
                (116, 73, 66),
                (center.left + tick, center.centery),
                (center.right - tick, center.centery),
                1,
            )

        # Persian-inspired runners soften the concrete circulation network.
        # They are finite floor objects, not a texture repeated across the
        # entire 100-million-pixel world.
        horizontal_y = center_y - 350
        for rug_x in range(center_x - 20_000, center_x + 20_001, 1_800):
            draw_persian_rug((rug_x - 600, horizontal_y, 1_200, 700))
        vertical_x = center_x - 350
        for rug_y in range(center_y - 20_000, center_y + 20_001, 1_800):
            if abs(rug_y - center_y) < 1_000:
                continue
            draw_persian_rug((vertical_x, rug_y - 600, 700, 1_200))

        if is_lobby:
            elevator_lobby_bounds = tuple(base_layout["elevatorLobby"]["bounds"])
            elevator_x, elevator_y = center_x, center_y
        else:
            elevator_x, elevator_y = tuple(base_layout["elevator"]["position"])
            elevator_lobby_bounds = (
                elevator_x - 1_800,
                elevator_y - 2_200,
                3_600,
                4_400,
            )
        elevator_lobby = world_rect(elevator_lobby_bounds)
        pygame.draw.rect(self.screen, (145, 153, 149), elevator_lobby)
        pygame.draw.rect(self.screen, (92, 104, 100), elevator_lobby, max(1, int(20 * scale)))

        elevator = world_rect((elevator_x - 650, elevator_y - 700, 1_300, 1_400))
        pygame.draw.rect(self.screen, (48, 63, 62), elevator)
        pygame.draw.rect(self.screen, (202, 211, 202), elevator, max(1, int(18 * scale)))
        door_split = elevator.centerx
        pygame.draw.line(
            self.screen,
            (117, 137, 130),
            (door_split, elevator.top),
            (door_split, elevator.bottom),
            max(1, int(8 * scale)),
        )

        for office in base_layout["offices"]:
            entrance_x, entrance_y = office["entrance"]
            entrance = world_rect((entrance_x - 300, entrance_y - 300, 600, 600))
            pygame.draw.rect(self.screen, (95, 107, 103), entrance)

        self.screen.set_clip(old_clip)
        pygame.draw.rect(self.screen, (52, 65, 58), viewport, width=9)
        pygame.draw.rect(self.screen, (151, 194, 143), viewport, width=2)

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
            # The executive trailer is intentionally reduced to the four
            # workstations; furniture is the visual focus of this room.
            return

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
            "arcade": "furniture/PC/PC_FRONT_ON_2.png",
            "vending_machine": "furniture/PC/PC_FRONT_ON_3.png",
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
            width = max(48, int(280 * scale))
            height = max(24, int(120 * scale))
            window = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (55, 107, 122), window, border_radius=3)
            pygame.draw.rect(self.screen, (154, 218, 222), window.inflate(-6, -6), border_radius=2)
            pygame.draw.rect(self.screen, (43, 73, 77), window, width=max(2, int(8 * scale)), border_radius=3)
            pygame.draw.line(self.screen, (43, 89, 96), window.midtop, window.midbottom, max(2, int(4 * scale)))
            pygame.draw.line(self.screen, (43, 89, 96), window.midleft, window.midright, max(2, int(4 * scale)))
            pygame.draw.line(
                self.screen,
                (224, 245, 224),
                (window.left + 8, window.top + 8),
                (window.right - 10, window.top + 8),
                max(1, int(2 * scale)),
            )
        elif kind == "trash_can":
            width = max(12, int(360 * scale))
            height = max(16, int(480 * scale))
            body = pygame.Rect(
                x - width // 2,
                y - height // 2 + 3,
                width,
                height - 5,
            )
            pygame.draw.ellipse(
                self.screen,
                (38, 49, 44),
                (body.left - 1, body.bottom - 5, width + 2, 9),
            )
            pygame.draw.rect(
                self.screen,
                (71, 96, 81),
                body,
                border_radius=max(2, int(5 * scale)),
            )
            pygame.draw.rect(
                self.screen,
                (42, 62, 53),
                body,
                width=1,
                border_radius=max(2, int(5 * scale)),
            )
            lid = pygame.Rect(body.left - 2, body.top - 2, width + 4, max(6, int(8 * scale)))
            pygame.draw.ellipse(self.screen, (166, 151, 113), lid)
            pygame.draw.ellipse(
                self.screen,
                (42, 53, 48),
                lid.inflate(-max(4, int(8 * scale)), -max(3, int(5 * scale))),
            )
            pygame.draw.line(
                self.screen,
                (173, 158, 120),
                (body.left + 3, body.top + 5),
                (body.left + 3, body.bottom - 4),
                1,
            )
        elif kind == "fire_extinguisher":
            width = max(7, int(170 * scale))
            height = max(12, int(310 * scale))
            body = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.ellipse(self.screen, (122, 39, 33), (body.left, body.bottom - 5, width, 10))
            pygame.draw.rect(self.screen, (181, 54, 45), body, border_radius=max(2, int(5 * scale)))
            pygame.draw.rect(self.screen, (227, 216, 190), body.inflate(-max(4, width // 3), -max(4, height // 2)))
            pygame.draw.rect(self.screen, (71, 73, 61), (x - width // 4, body.top - 5, width // 2, 6))
            pygame.draw.line(self.screen, (47, 51, 44), (body.right, body.top + 5), (body.right + 5, y), 2)
        elif kind == "temple_tree":
            planter_radius = max(8, int(180 * scale))
            pygame.draw.ellipse(
                self.screen,
                (91, 67, 48),
                (x - planter_radius, y + planter_radius // 2, planter_radius * 2, planter_radius // 2),
            )
            pygame.draw.line(self.screen, (126, 91, 59), (x, y + 4), (x, y - planter_radius), max(3, int(18 * scale)))
            canopy = max(14, int(290 * scale))
            for dx, dy, radius in ((0, -canopy, canopy), (-canopy // 2, -canopy // 2, canopy * 3 // 4), (canopy // 2, -canopy // 2, canopy * 3 // 4), (0, -canopy * 3 // 2, canopy * 2 // 3)):
                pygame.draw.circle(self.screen, (71, 104, 72), (x + dx, y + dy), radius)
                pygame.draw.circle(self.screen, (101, 133, 90), (x + dx - radius // 4, y + dy - radius // 4), max(2, radius // 3))
        elif kind == "reflection_screen":
            width = max(28, int(760 * scale))
            height = max(16, int(310 * scale))
            screen = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (81, 104, 89), screen, border_radius=3)
            pygame.draw.rect(self.screen, (164, 153, 121), screen, max(2, int(12 * scale)), border_radius=3)
            pygame.draw.line(self.screen, (189, 192, 165), screen.midtop, screen.midbottom, max(1, int(3 * scale)))
        elif kind == "meditation_cushion":
            radius = max(8, int(270 * scale))
            pygame.draw.ellipse(self.screen, (79, 68, 59), (x - radius, y - radius // 2, radius * 2, radius))
            pygame.draw.ellipse(self.screen, (147, 128, 100), (x - radius + 2, y - radius // 2, radius * 2 - 4, radius - 5), max(1, int(5 * scale)))
        elif kind == "temple_audio_control":
            panel = pygame.Rect(x - max(10, int(170 * scale)), y - max(8, int(110 * scale)), max(20, int(340 * scale)), max(16, int(220 * scale)))
            pygame.draw.rect(self.screen, (66, 83, 70), panel, border_radius=2)
            pygame.draw.rect(self.screen, (196, 180, 139), panel, max(1, int(5 * scale)), border_radius=2)
            pygame.draw.circle(self.screen, (171, 137, 78), (panel.centerx - panel.width // 5, panel.centery), max(2, panel.width // 10))
            pygame.draw.circle(self.screen, (50, 59, 51), (panel.centerx + panel.width // 5, panel.centery), max(2, panel.width // 10))
        elif kind == "chapel_pew":
            width = max(30, int(520 * scale))
            height = max(12, int(150 * scale))
            bench = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (114, 78, 51), bench, border_radius=3)
            pygame.draw.rect(self.screen, (162, 119, 75), (bench.left, bench.top - max(7, height // 2), width, max(8, height // 3)), border_radius=2)
            for leg_x in (bench.left + width // 6, bench.right - width // 6):
                pygame.draw.line(self.screen, (80, 57, 42), (leg_x, bench.bottom - 1), (leg_x, bench.bottom + height // 2), max(2, int(8 * scale)))
        elif kind == "chapel_altar":
            width = max(40, int(640 * scale))
            top = pygame.Rect(x - width // 2, y - max(10, int(100 * scale)), width, max(12, int(120 * scale)))
            pygame.draw.rect(self.screen, (117, 81, 52), top, border_radius=2)
            pygame.draw.rect(self.screen, (188, 156, 101), top.inflate(5, 3), max(1, int(5 * scale)))
            pygame.draw.line(self.screen, (224, 211, 177), (top.left + width // 5, top.bottom), (top.right - width // 5, top.bottom), max(2, int(18 * scale)))
        elif kind == "library_shelf":
            width = max(30, int(540 * scale))
            height = max(38, int(520 * scale))
            shelf = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (105, 73, 49), shelf)
            colors = ((113, 131, 103), (155, 101, 73), (81, 116, 130))
            for row in range(4):
                row_y = shelf.top + 8 + row * (height - 16) // 4
                pygame.draw.line(self.screen, (188, 153, 102), (shelf.left, row_y), (shelf.right, row_y), max(2, int(8 * scale)))
                for column in range(6):
                    book_x = shelf.left + 10 + column * max(3, (width - 20) // 6)
                    book_height = max(8, int((105 + (row + column) % 3 * 22) * scale))
                    pygame.draw.rect(self.screen, colors[(row + column) % len(colors)], (book_x, row_y - book_height, max(3, int(42 * scale)), book_height))
        elif kind == "reading_table":
            radius = max(18, int(320 * scale))
            pygame.draw.ellipse(self.screen, (106, 74, 49), (x - radius, y - radius // 2, radius * 2, radius))
            pygame.draw.ellipse(self.screen, (172, 137, 90), (x - radius + 4, y - radius // 2 + 2, radius * 2 - 8, radius - 8), max(2, int(8 * scale)))
            pygame.draw.rect(self.screen, (224, 211, 176), (x - radius // 4, y - radius // 5, radius // 2, max(3, int(28 * scale))), border_radius=2)
        elif kind == "museum_case":
            width = max(35, int(390 * scale))
            height = max(24, int(250 * scale))
            case = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (116, 91, 63), case.inflate(0, max(4, height // 4)), border_radius=2)
            pygame.draw.rect(self.screen, (153, 184, 173), case, max(1, int(5 * scale)), border_radius=2)
            pygame.draw.rect(self.screen, (208, 191, 148), (x - width // 8, y - height // 5, width // 4, max(4, height // 3)), border_radius=2)
        elif kind == "restroom_stall":
            width = max(34, int(420 * scale))
            height = max(38, int(520 * scale))
            stall = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (115, 118, 98), stall, border_radius=3)
            pygame.draw.rect(self.screen, (42, 57, 49), stall, 2, border_radius=3)
            door = pygame.Rect(stall.x + 4, stall.y + 5, width - 8, height - 10)
            pygame.draw.rect(self.screen, (154, 144, 111), door, border_radius=2)
            pygame.draw.rect(self.screen, (63, 76, 62), door, 1, border_radius=2)
            pygame.draw.line(
                self.screen,
                (204, 193, 153),
                (door.x + 5, door.y + 4),
                (door.right - 5, door.y + 4),
                1,
            )
            pygame.draw.circle(self.screen, (54, 72, 56), (door.right - 5, door.centery), 2)
            pygame.draw.rect(
                self.screen,
                (96, 124, 92) if not nearby else Palette.SUN,
                (stall.left + 4, stall.top - 5, max(8, width - 8), 3),
            )
        elif kind == "shipping_station":
            width = max(38, int(520 * scale))
            height = max(30, int(380 * scale))
            pallet = pygame.Rect(x - width // 2, y + height // 5, width, max(5, int(12 * scale)))
            pygame.draw.rect(self.screen, (104, 76, 53), pallet, border_radius=2)
            for offset in (-0.3, 0.0, 0.3):
                crate_width = max(12, int(width * 0.31))
                crate_height = max(18, int(height * 0.7))
                crate_x = int(x + width * offset - crate_width / 2)
                crate_y = pallet.top - crate_height
                crate = pygame.Rect(crate_x, crate_y, crate_width, crate_height)
                pygame.draw.rect(self.screen, (157, 113, 70), crate, border_radius=2)
                pygame.draw.rect(self.screen, (74, 64, 48), crate, 1, border_radius=2)
                pygame.draw.line(
                    self.screen,
                    (198, 157, 96),
                    (crate.centerx, crate.top + 2),
                    (crate.centerx, crate.bottom - 2),
                    1,
                )
        elif kind == "loading_gate":
            width = max(40, int(600 * scale))
            height = max(34, int(460 * scale))
            gate = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (49, 65, 59), gate, border_radius=2)
            pygame.draw.rect(self.screen, (143, 149, 125), gate, 2, border_radius=2)
            for offset in range(8, width - 3, max(8, int(22 * scale))):
                pygame.draw.line(
                    self.screen,
                    (117, 130, 111),
                    (gate.x + offset, gate.y + 4),
                    (gate.x + offset, gate.bottom - 4),
                    1,
                )
            pygame.draw.rect(
                self.screen,
                (194, 147, 69) if not nearby else Palette.SUN,
                (gate.left, gate.bottom - max(6, int(13 * scale)), width, max(3, int(6 * scale))),
            )
        elif kind == "business_suite":
            width = max(38, int(520 * scale))
            height = max(24, int(300 * scale))
            desk = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.ellipse(self.screen, (66, 79, 62), (desk.x - 2, desk.bottom - 3, desk.width + 4, 9))
            pygame.draw.rect(self.screen, (150, 116, 76), desk, border_radius=3)
            pygame.draw.rect(self.screen, (74, 66, 51), desk, 2, border_radius=3)
            sign = pygame.Rect(desk.x + 5, desk.y - max(12, int(20 * scale)), max(18, width - 10), max(12, int(17 * scale)))
            pygame.draw.rect(self.screen, (47, 94, 81), sign, border_radius=2)
            pygame.draw.rect(self.screen, (197, 179, 124) if not nearby else Palette.SUN, sign, 1, border_radius=2)
        elif kind == "business_kiosk":
            width = max(18, int(250 * scale))
            height = max(32, int(470 * scale))
            kiosk = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.ellipse(self.screen, (68, 78, 64), (kiosk.x - 4, kiosk.bottom - 5, kiosk.width + 8, 10))
            pygame.draw.rect(self.screen, (71, 108, 91), kiosk, border_radius=4)
            pygame.draw.rect(self.screen, (33, 60, 55), kiosk, 2, border_radius=4)
            screen = pygame.Rect(kiosk.x + 4, kiosk.y + 5, kiosk.width - 8, max(10, int(175 * scale)))
            pygame.draw.rect(self.screen, (175, 206, 172), screen, border_radius=2)
            pygame.draw.rect(self.screen, (46, 80, 67), screen, 1, border_radius=2)
            pygame.draw.circle(self.screen, Palette.SUN if nearby else (198, 185, 134), (kiosk.centerx, kiosk.bottom - 9), 3)
        elif kind == "yard_gate":
            width = max(40, int(800 * scale))
            height = max(20, int(260 * scale))
            gate = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (120, 137, 114), gate, border_radius=2)
            pygame.draw.rect(self.screen, (50, 77, 64), gate, 2, border_radius=2)
            for offset in range(8, width - 3, max(10, int(75 * scale))):
                pygame.draw.line(self.screen, (54, 82, 68), (gate.x + offset, gate.y + 3), (gate.x + offset, gate.bottom - 3), 1)
            pygame.draw.line(self.screen, Palette.SUN if nearby else (193, 161, 91), gate.midleft, gate.midright, 2)
        elif kind == "delivery_truck":
            width = max(42, int(1_050 * scale))
            height = max(58, int(1_750 * scale))
            truck = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.ellipse(self.screen, (44, 58, 48), (truck.x - 5, truck.bottom - 8, truck.width + 10, 16))
            pygame.draw.rect(self.screen, (66, 107, 84), truck, border_radius=7)
            cargo = pygame.Rect(truck.x + 5, truck.y + 7, truck.width - 10, int(truck.height * 0.65))
            pygame.draw.rect(self.screen, (166, 151, 112), cargo, border_radius=4)
            pygame.draw.rect(self.screen, (60, 75, 59), cargo, 2, border_radius=4)
            pygame.draw.rect(self.screen, (117, 162, 171), (truck.x + 6, cargo.bottom + 4, truck.width - 12, truck.height - cargo.height - 12), border_radius=3)
            for wheel_y in (truck.y + 18, truck.bottom - 18):
                pygame.draw.rect(self.screen, (35, 42, 36), (truck.left - 4, wheel_y, 7, 16), border_radius=2)
                pygame.draw.rect(self.screen, (35, 42, 36), (truck.right - 3, wheel_y, 7, 16), border_radius=2)
        elif kind == "forklift":
            width = max(30, int(470 * scale))
            height = max(38, int(680 * scale))
            body = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.ellipse(self.screen, (43, 54, 45), (body.x - 3, body.bottom - 5, body.width + 6, 10))
            pygame.draw.rect(self.screen, (215, 169, 73), body, border_radius=5)
            pygame.draw.rect(self.screen, (55, 68, 52), body, 2, border_radius=5)
            pygame.draw.rect(self.screen, (62, 86, 74), (body.x + 7, body.y + 8, body.width - 14, int(body.height * 0.43)), border_radius=3)
            pygame.draw.line(self.screen, (66, 72, 55), (body.left - 7, body.bottom - 7), (body.left - 7, body.bottom + 22), 3)
            pygame.draw.line(self.screen, (66, 72, 55), (body.left - 7, body.bottom + 20), (body.centerx + 8, body.bottom + 20), 3)
        elif kind in {"pallet", "supply_crate"}:
            size = max(18, int(440 * scale))
            height = max(14, int((260 if kind == "pallet" else 400) * scale))
            box = pygame.Rect(x - size // 2, y - height // 2, size, height)
            fill = (127, 92, 58) if kind == "pallet" else (171, 126, 75)
            pygame.draw.ellipse(self.screen, (51, 56, 43), (box.x - 3, box.bottom - 4, box.width + 6, 9))
            pygame.draw.rect(self.screen, fill, box, border_radius=2)
            pygame.draw.rect(self.screen, (66, 59, 43), box, 1, border_radius=2)
            pygame.draw.line(self.screen, (206, 169, 106), box.midleft, box.midright, 1)
        elif kind in ("elevator", "stairs"):
            pygame.draw.rect(self.screen, (121, 150, 151), (x - 10, y - 12, 20, 24), border_radius=2)
            if kind == "elevator":
                pygame.draw.line(self.screen, (236, 239, 220), (x, y - 10), (x, y + 10), 2)
            else:
                for dy in range(-7, 9, 5):
                    pygame.draw.line(self.screen, (239, 236, 214), (x - 6, y + dy), (x + 6, y + dy), 1)
        elif kind == "crt_terminal":
            width = max(46, int(94 * scale))
            height = max(34, int(68 * scale))
            case = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (161, 143, 104), case, border_radius=4)
            pygame.draw.rect(self.screen, (88, 78, 57), case, 2, border_radius=4)
            bezel = pygame.Rect(case.x + 4, case.y + 3, width - 8, max(17, int(height * 0.57)))
            pygame.draw.rect(self.screen, (83, 76, 59), bezel, border_radius=3)
            screen = bezel.inflate(-7, -6)
            pygame.draw.rect(self.screen, (129, 153, 104), screen, border_radius=2)
            pygame.draw.line(
                self.screen,
                (179, 194, 136),
                (screen.x + 3, screen.y + 4),
                (screen.right - 4, screen.y + 4),
                1,
            )
            keyboard = pygame.Rect(case.x + 7, bezel.bottom + 3, width - 14, max(5, height - bezel.height - 9))
            pygame.draw.rect(self.screen, (103, 91, 68), keyboard, border_radius=2)
            key_count = 6
            for key in range(key_count):
                key_x = keyboard.x + 3 + key * max(3, (keyboard.width - 6) // key_count)
                pygame.draw.line(self.screen, (190, 176, 137), (key_x, keyboard.y + 2), (key_x, keyboard.bottom - 2), 1)
            pygame.draw.circle(self.screen, (223, 174, 88), (case.right - 7, case.bottom - 6), 2)
            pygame.draw.line(self.screen, (119, 103, 73), (case.left + 5, case.bottom + 2), (case.right - 5, case.bottom + 2), 2)
        elif kind == "pay_phone":
            width = max(30, int(62 * scale))
            height = max(60, int(122 * scale))
            cabinet = pygame.Rect(x - width // 2, y - height // 2, width, height)
            pygame.draw.rect(self.screen, (190, 160, 115), cabinet, border_radius=4)
            pygame.draw.rect(self.screen, (69, 84, 74), cabinet, 2, border_radius=4)
            hood = pygame.Rect(cabinet.x - 2, cabinet.y - 3, width + 4, max(9, int(height * 0.16)))
            pygame.draw.rect(self.screen, (169, 84, 57), hood, border_radius=3)
            label = pygame.Rect(cabinet.x + 5, hood.bottom + 4, width - 10, max(8, int(height * 0.16)))
            pygame.draw.rect(self.screen, (218, 202, 157), label, border_radius=2)
            pygame.draw.line(self.screen, (74, 82, 66), (label.x + 2, label.centery), (label.right - 2, label.centery), 1)
            dial = (cabinet.centerx, label.bottom + max(7, int(height * 0.2)))
            pygame.draw.circle(self.screen, (83, 88, 71), dial, max(4, width // 5))
            pygame.draw.circle(self.screen, (218, 202, 157), dial, max(2, width // 9), 1)
            handset_x = cabinet.right - max(5, width // 5)
            pygame.draw.line(self.screen, (51, 65, 58), (handset_x, cabinet.y + 10), (handset_x, cabinet.y + int(height * 0.39)), max(2, width // 12))
            pygame.draw.circle(self.screen, (51, 65, 58), (handset_x, cabinet.y + 11), max(3, width // 9))
            pygame.draw.circle(self.screen, (51, 65, 58), (handset_x, cabinet.y + int(height * 0.39)), max(3, width // 9))
            pygame.draw.rect(self.screen, (213, 192, 147), (cabinet.x + 4, cabinet.bottom - 13, width - 8, 5), border_radius=1)
        elif kind in ("arcade", "vending_machine", "atm"):
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
        elif kind == "telephone":
            pygame.draw.rect(self.screen, (67, 126, 113), (x - 9, y - 7, 18, 14), border_radius=4)
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
        action: str = "stand",
        action_elapsed: float = 0.0,
    ) -> None:
        """Draw one fixed avatar variant with a separate low-amplitude walk pose."""
        character_variant, step_x, step_y = character_pose(
            0,
            self._anim_tick,
            moving=moving and action == "stand",
        )
        rendered, rendered_bounds, sprite_scale = self._character_sprite(
            self._facing,
            character_variant,
            scale,
            character_asset="characters/char_0.png",
        )
        if rendered is not None and rendered_bounds is not None:
            jump_offset = 0
            seated_offset_x = 0
            seated_offset_y = 0
            if action == "jump":
                jump_phase = min(1.0, action_elapsed / 0.8)
                jump_offset = round(-48 * (4 * jump_phase * (1 - jump_phase)))
            displayed = rendered
            if action == "sit":
                displayed = pygame.transform.scale(
                    rendered,
                    (rendered.get_width(), max(32, int(rendered.get_height() * 0.72))),
                )
                # A seated character should not look like a frozen cropped
                # sprite. Keep the motion deliberately small so the chair
                # remains the visual anchor while the player breathes.
                seated_offset_x = round(math.sin(action_elapsed * 1.1) * 1.0)
                seated_offset_y = round(math.sin(action_elapsed * 1.8) * 1.2)
                displayed = pygame.transform.rotate(
                    displayed,
                    math.sin(action_elapsed * 0.9) * 1.4,
                )
            elif action == "sleep":
                displayed = pygame.transform.rotate(rendered, 90)
            displayed_bounds = displayed.get_bounding_rect(min_alpha=1)
            self._draw_sprite_shadow((x, y), sprite_scale / 3.0)
            rendered_center_x = displayed_bounds.left + displayed_bounds.width / 2.0
            rendered_bottom = displayed_bounds.bottom
            self.screen.blit(
                displayed,
                (
                    round(x - rendered_center_x + seated_offset_x + step_x),
                    y + 7 - rendered_bottom + jump_offset + seated_offset_y + step_y,
                ),
            )
            if action == "sleep":
                self.text("Z", (x + 24, y - 66), self.font_lg, Palette.MATRIX_BRIGHT)
                self.text("Z", (x + 43, y - 88), self.font_md, Palette.MATRIX_DIM)
            return
        pygame.draw.ellipse(self.screen, (139, 177, 160), (x - 11, y + 8, 22, 7))
        pygame.draw.circle(self.screen, (77, 76, 70), (x, y - 4), 9)
        pygame.draw.circle(self.screen, (216, 151, 107), (x, y - 2), 7)
        pygame.draw.rect(self.screen, Palette.CORAL, (x - 7, y + 5, 14, 12), border_radius=5)

    def _character_sprite(
        self,
        facing: str,
        character_variant: int,
        scale: float,
        *,
        npc: bool = False,
        character_asset: str = "characters/char_0.png",
    ) -> tuple[pygame.Surface | None, pygame.Rect | None, float]:
        """Extract one 16x32 avatar cell; sheet columns identify looks, not walk frames."""
        sheet = self._asset(character_asset)
        if sheet is None:
            return None, None, 0.0
        # Character sheets are 7 identity variants x 3 facing rows.
        character_variant = max(0, min(6, int(character_variant)))
        row_by_facing = {"down": 0, "up": 1, "left": 2, "right": 2}
        row = row_by_facing.get(facing, 0)
        cache_key = (character_asset, facing, character_variant)
        crop = self._character_frame_cache.get(cache_key)
        if crop is None:
            source = sheet.subsurface(
                pygame.Rect(character_variant * 16, row * 32, 16, 32)
            )
            if facing == "left":
                source = pygame.transform.flip(source, True, False)
            crop = pygame.Surface((16, 32), pygame.SRCALPHA)
            bounds = source.get_bounding_rect(min_alpha=1)
            centered_left = (16 - bounds.width) // 2
            crop.blit(source, (centered_left - bounds.left, 32 - bounds.bottom))
            self._character_frame_cache[cache_key] = crop
        sprite_scale = min(5.0, max(2.8, scale * 11))
        size = (max(16, int(16 * sprite_scale)), max(32, int(32 * sprite_scale)))
        rendered = pygame.transform.scale(crop, size)
        return rendered, rendered.get_bounding_rect(min_alpha=1), sprite_scale

    def draw_tower_header(self, state: OfficeState, scene: TowerScene) -> None:
        # This rail is intentionally always at y=0. World panels and page
        # overlays move underneath it; economic context never disappears.
        header = pygame.Rect(0, 0, self.width, 58)
        pygame.draw.rect(self.screen, Palette.MATRIX_BG, header)
        pygame.draw.line(self.screen, Palette.MATRIX_GREEN, (0, header.bottom - 1), (self.width, header.bottom - 1), 2)
        self.text("SALARYMAN", (18, 10), self.font_lg, Palette.MATRIX_BRIGHT)
        floor_label = "LOBBY" if scene.current_floor == 1 else "PREMIUM" if scene.current_floor >= 63 else "OFFICE"
        self.text(f"FLOOR {scene.current_floor:02d} · {floor_label}", (19, 35), self.font_mono, Palette.MATRIX_DIM)
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
            prompt_text = nearby.prompt
            if nearby.kind == "crt_terminal" and scene.is_seated_at_workstation(nearby.parent_id):
                prompt_text = "USE COMPUTER"
            self.text(f"[E] {prompt_text}", (282, 629), self.font_md, Palette.MATRIX_BRIGHT)
            self.text(
                f"ROOM  {scene.room.label}  ·  [B] CUSTOMIZE",
                (274, 661),
                self.font_mono,
                Palette.MATRIX_DIM,
            )
        else:
            self.text("WALK CLOSER TO A LIVE OBJECT", (274, 628), self.font_md, Palette.MATRIX_BRIGHT)
            self.text(
                f"ROOM  {scene.room.label}  ·  [B] CUSTOMIZE",
                (274, 661),
                self.font_mono,
                Palette.MATRIX_DIM,
            )
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

    def draw_automation_page(
        self,
        state: OfficeState,
        scene: TowerScene,
    ) -> None:
        """Show live read-only status in the native game interface."""
        dim = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        dim.fill((4, 17, 20, 205))
        self.screen.blit(dim, (0, 0))

        panel = pygame.Rect(170, 112, self.width - 340, 480)
        pygame.draw.rect(self.screen, (20, 43, 43), panel, border_radius=12)
        pygame.draw.rect(self.screen, (114, 179, 139), panel, 2, border_radius=12)
        self.text("AUTOMATION / READ ONLY", (panel.x + 30, panel.y + 24), self.font_mono, (147, 214, 168))
        self.overlay_close_rect = pygame.Rect(panel.right - 94, panel.y + 18, 68, 32)
        pygame.draw.rect(self.screen, (42, 67, 62), self.overlay_close_rect, border_radius=6)
        self.text("CLOSE", (self.overlay_close_rect.x + 12, self.overlay_close_rect.y + 8), self.font_sm, (227, 232, 215))

        profile = next(
            (candidate for candidate in AUTOMATION_CHARACTERS if candidate.domain == scene.selected_automation_domain),
            None,
        )
        if profile is None:
            self.text("AUTOMATION NOT FOUND", (panel.x + 30, panel.y + 100), self.font_lg, (237, 210, 144))
            return

        self.text(f"{profile.name} / {profile.role}", (panel.x + 30, panel.y + 91), self.font_lg, profile.accent)
        self.text(profile.domain.replace("_", " ").upper(), (panel.x + 30, panel.y + 132), self.font_mono, (222, 228, 211))
        status = scene.automation_domain_status(profile)
        if status is not None:
            status_label = "ENABLED · ROUTINE PREVIEW" if status.enabled else "PAUSED · AT WORKSTATION"
            status_color = (133, 224, 166) if status.enabled else (223, 194, 127)
            _, _, activity = scene.automation_pose(profile)
            last_run = "NO RUN RECORDED"
            if status.last_run_at:
                try:
                    last_run = datetime.fromisoformat(
                        status.last_run_at.replace("Z", "+00:00")
                    ).astimezone().strftime("%Y-%m-%d  %H:%M")
                except ValueError:
                    last_run = status.last_run_at[:19]
        else:
            status_label = scene.autopilot_snapshot.message or "STATUS NOT AVAILABLE"
            status_color = (223, 194, 127)
            activity = "WAITING FOR A VALID STATUS SYNC"
            last_run = "HIDDEN OR NOT CONNECTED"

        self.text(status_label, (panel.x + 30, panel.y + 196), self.font_lg, status_color)
        self.text(f"ROUTE PREVIEW  /  {activity}", (panel.x + 30, panel.y + 244), self.font_mono, (227, 232, 215))
        self.text(f"LAST SERVER RUN  /  {last_run}", (panel.x + 30, panel.y + 284), self.font_mono, (177, 195, 177))
        self.text(
            f"NATIVE GAME MODULE  /  {profile.app_label}",
            (panel.x + 30, panel.y + 334),
            self.font_md,
            profile.accent,
        )
        self.text(
            "Read-only status from SALARYMAN. No external action starts here.",
            (panel.x + 30, panel.y + 382),
            self.font_sm,
            (186, 204, 187),
        )
        if scene.autopilot_snapshot.state != "connected":
            self.text(scene.autopilot_snapshot.message or "STATUS SYNC UNAVAILABLE", (panel.x + 30, panel.y + 438), self.font_sm, (236, 203, 135))

    def draw_device_page(
        self,
        state: OfficeState,
        scene: TowerScene,
    ) -> None:
        """Render game-native, read-only screens for physical Tower devices."""
        self.system_module_rects = {}
        dim = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        dim.fill((3, 9, 13, 224))
        self.screen.blit(dim, (0, 0))

        panel_width = min(self.width - 48, 760)
        panel_height = 326 if state.active_page == "phone" else 416
        panel = pygame.Rect(0, 0, panel_width, panel_height)
        panel.center = (self.width // 2, self.height // 2 + 18)
        self.panel(panel, Palette.MATRIX_BG, Palette.MATRIX_GREEN, radius=8, width=2)
        pygame.draw.rect(
            self.screen,
            Palette.MATRIX_AMBER,
            pygame.Rect(panel.x + 2, panel.y + 2, panel.width - 4, 4),
        )
        self.overlay_close_rect = pygame.Rect(panel.right - 94, panel.y + 18, 68, 30)
        self.panel(
            self.overlay_close_rect,
            Palette.MATRIX_PANEL_2,
            Palette.MATRIX_DIM,
            radius=4,
            width=1,
        )
        self.text(
            "CLOSE",
            (self.overlay_close_rect.x + 13, self.overlay_close_rect.y + 8),
            self.font_sm,
            Palette.MATRIX_BRIGHT,
        )

        if state.active_page == "phone":
            self.text(
                "PAY PHONE",
                (panel.x + 30, panel.y + 28),
                self.font_xl,
                Palette.MATRIX_BRIGHT,
            )
            self.text(
                "TOWER LINE  /  TWO APPROVED SERVICES",
                (panel.x + 32, panel.y + 70),
                self.font_mono,
                Palette.MATRIX_AMBER,
            )
            gap = 16
            tile_width = (panel.width - 64 - gap) // 2
            tile_y = panel.y + 128
            for index, (heading, detail) in enumerate(
                (
                    ("CALLL HOME", "VOICE SYSTEM"),
                    ("COMMS", "TEAM MESSAGES"),
                )
            ):
                rect = pygame.Rect(
                    panel.x + 32 + index * (tile_width + gap),
                    tile_y,
                    tile_width,
                    96,
                )
                self.panel(
                    rect,
                    Palette.MATRIX_PANEL,
                    Palette.MATRIX_DIM,
                    radius=6,
                    width=1,
                )
                self.text(
                    f"0{index + 1}",
                    (rect.x + 15, rect.y + 13),
                    self.font_sm,
                    Palette.MATRIX_AMBER,
                )
                self.text(
                    heading,
                    (rect.x + 15, rect.y + 37),
                    self.font_lg,
                    Palette.MATRIX_BRIGHT,
                )
                self.text(
                    detail,
                    (rect.x + 15, rect.y + 68),
                    self.font_sm,
                    Palette.MATRIX_GREEN,
                )
            self.text(
                "READ-ONLY CONNECTION PASS  /  ESC TO RETURN",
                (panel.x + 32, panel.bottom - 35),
                self.font_sm,
                Palette.MATRIX_DIM,
            )
            return

        self.text(
            "SALARYMAN OS",
            (panel.x + 30, panel.y + 28),
            self.font_xl,
            Palette.MATRIX_BRIGHT,
        )
        self.text(
            "SYSTEMS TERMINAL  /  NATIVE GAME INTERFACE",
            (panel.x + 32, panel.y + 70),
            self.font_mono,
            Palette.MATRIX_AMBER,
        )
        metric_y = panel.y + 108
        metrics = (
            ("LOCATION", f"FLOOR {scene.current_floor:02d} / {scene.room.label.upper()}"),
            ("TEAM", f"{len(state.roster.workers)} OFFICE STAFF"),
            ("GAME FIAT", f"ƒ{state.funds:,.2f}"),
        )
        metric_gap = 10
        metric_width = (panel.width - 64 - metric_gap * 2) // 3
        for index, (label, value) in enumerate(metrics):
            metric_rect = pygame.Rect(
                panel.x + 32 + index * (metric_width + metric_gap),
                metric_y,
                metric_width,
                52,
            )
            self.panel(
                metric_rect,
                Palette.MATRIX_PANEL,
                Palette.MATRIX_GRID,
                radius=4,
                width=1,
            )
            self.text(
                label,
                (metric_rect.x + 10, metric_rect.y + 7),
                self.font_sm,
                Palette.MATRIX_DIM,
            )
            self.text(
                value[:25],
                (metric_rect.x + 10, metric_rect.y + 28),
                self.font_sm,
                Palette.MATRIX_BRIGHT,
            )

        self.text(
            "CONNECTED GAME MODULES",
            (panel.x + 32, panel.y + 174),
            self.font_md,
            Palette.MATRIX_GREEN,
        )
        gap_x, gap_y = 10, 9
        tile_width = (panel.width - 64 - gap_x * 2) // 3
        tile_height = 72
        for index, profile in enumerate(AUTOMATION_CHARACTERS):
            column = index % 3
            row = index // 3
            rect = pygame.Rect(
                panel.x + 32 + column * (tile_width + gap_x),
                panel.y + 200 + row * (tile_height + gap_y),
                tile_width,
                tile_height,
            )
            self.system_module_rects[profile.domain] = rect
            status = scene.automation_domain_status(profile)
            status_text = (
                "ACTIVE"
                if status is not None and status.enabled
                else "PAUSED"
                if status is not None
                else "STATUS NOT SYNCED"
            )
            self.panel(
                rect,
                Palette.MATRIX_PANEL,
                profile.accent if status and status.enabled else Palette.MATRIX_GRID,
                radius=4,
                width=1,
            )
            self.text(
                profile.app_label,
                (rect.x + 12, rect.y + 12),
                self.font_md,
                Palette.MATRIX_BRIGHT,
            )
            self.text(
                status_text,
                (rect.x + 12, rect.y + 43),
                self.font_sm,
                profile.accent if status and status.enabled else Palette.MATRIX_DIM,
            )

    def draw_player_service_page(self, state: OfficeState, scene: TowerScene) -> None:
        """Draw account/game controls on a neutral surface, separate from terminals."""
        self.game_page_actions = {}
        dim = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        dim.fill((4, 12, 14, 150))
        self.screen.blit(dim, (0, 0))

        panel_width = min(self.width - 48, 760)
        panel_height = min(self.height - 48, 520)
        panel = pygame.Rect(0, 0, panel_width, panel_height)
        panel.center = (self.width // 2, self.height // 2)
        pygame.draw.rect(self.screen, (239, 241, 234), panel, border_radius=10)
        pygame.draw.rect(self.screen, (73, 109, 94), panel, 2, border_radius=10)
        pygame.draw.rect(self.screen, (83, 143, 113), pygame.Rect(panel.x + 2, panel.y + 2, panel.width - 4, 5))

        titles = {
            "player": ("PLAYER MENU", "Character actions, inventory, and local game settings"),
            "settings": ("GAME SETTINGS", "Saved on this device"),
            "inventory": ("CHARACTER INVENTORY", "Primary character / live account inventory"),
            "vending": ("TOWER VENDING", "Server-priced stock / purchases debit shared FIAT"),
            "bank": ("BANCO OMBRA", "Shared FIAT wallet / read only"),
            "phone": ("PAY PHONE", "CALLL HOME and COMMS entry points"),
            "reception": ("MILA / RECEPTION", "Jobs, contracts, and real-estate services"),
            "business_stock": ("BUSINESS STOCK / CONTACT", "Read-only stock information / visit the listed business to ask"),
        }
        title, subtitle = titles[state.active_page]
        self.text(title, (panel.x + 26, panel.y + 20), self.font_xl, (27, 47, 41))
        self.text(subtitle, (panel.x + 28, panel.y + 57), self.font_sm, (85, 103, 94))
        self.overlay_close_rect = pygame.Rect(panel.right - 88, panel.y + 18, 62, 30)
        pygame.draw.rect(self.screen, (222, 229, 218), self.overlay_close_rect, border_radius=5)
        self.text("CLOSE", (self.overlay_close_rect.x + 10, self.overlay_close_rect.y + 8), self.font_sm, (40, 69, 56))

        def button(key: str, label: str, rect: pygame.Rect, *, active: bool = False) -> None:
            self.game_page_actions[key] = rect
            fill = (210, 229, 214) if active else (229, 234, 224)
            pygame.draw.rect(self.screen, fill, rect, border_radius=6)
            pygame.draw.rect(self.screen, (170, 190, 175), rect, 1, border_radius=6)
            self.text(label, (rect.x + 13, rect.y + (rect.height - self.font_md.get_height()) // 2), self.font_md, (34, 62, 49))

        content_y = panel.y + 102
        if state.active_page == "player":
            nav = (
                ("nav:inventory", "INVENTORY"),
                ("nav:settings", "SETTINGS"),
                ("nav:bank", "BANK BALANCE"),
                ("nav:phone", "PHONE / COMMS"),
            )
            button_width = (panel.width - 68) // 2
            for index, (key, label) in enumerate(nav):
                rect = pygame.Rect(
                    panel.x + 26 + (index % 2) * (button_width + 16),
                    content_y + (index // 2) * 54,
                    button_width,
                    42,
                )
                button(key, label, rect)
            self.text("CHARACTER ACTIONS", (panel.x + 28, content_y + 124), self.font_md, (70, 100, 82))
            action_specs = (("jump", "JUMP"), ("sit", "SIT"), ("fight", "FIGHT"), ("sweep", "SWEEP"))
            action_width = (panel.width - 68) // 4
            for index, (action, label) in enumerate(action_specs):
                button(
                    f"action:{action}",
                    label,
                    pygame.Rect(panel.x + 26 + index * (action_width + 4), content_y + 151, action_width, 38),
                )
            if state.show_control_hints:
                sprint_hint = "SHIFT TOGGLE SPRINT" if state.sprint_toggle_mode else "SHIFT HOLD SPRINT"
                self.text(
                    f"WASD MOVE  ·  {sprint_hint}  ·  E INTERACT  ·  SPACE JUMP",
                    (panel.x + 28, panel.bottom - 52),
                    self.font_sm,
                    (85, 103, 94),
                )
                self.text(
                    "F FIGHT  ·  G SWEEP  ·  H CLEAN  ·  J REPAIR",
                    (panel.x + 28, panel.bottom - 32),
                    self.font_sm,
                    (85, 103, 94),
                )
        elif state.active_page == "settings":
            speed_names = ("RELAXED", "STANDARD", "QUICK")
            rows = (
                ("setting:sprint", f"SPRINT / {'TOGGLE' if state.sprint_toggle_mode else 'HOLD'}"),
                ("setting:speed", f"MOVEMENT / {speed_names[state.movement_speed_preset]}"),
                ("setting:hints", f"CONTROL HINTS / {'ON' if state.show_control_hints else 'OFF'}"),
                ("setting:music", f"MUSIC / {'ON' if state.music_enabled else 'OFF'}"),
            )
            for index, (key, label) in enumerate(rows):
                button(key, label, pygame.Rect(panel.x + 26, content_y + index * 62, panel.width - 52, 46))
            self.text("MUSIC is opt-in; nearby pests trigger a quiet cue when enabled.", (panel.x + 28, panel.bottom - 47), self.font_sm, (85, 103, 94))
        elif state.active_page == "inventory":
            entries = state.game_inventory
            if entries is None:
                message = "LOADING INVENTORY…" if "inventory" in state.game_service_loading else "CONNECT A LINKED GAME ACCOUNT TO LOAD INVENTORY"
                self.text(message, (panel.x + 28, content_y + 15), self.font_md, (75, 96, 84))
            elif not entries:
                self.text("NO ITEMS IN THIS CHARACTER SLOT", (panel.x + 28, content_y + 15), self.font_md, (75, 96, 84))
            else:
                for index, entry in enumerate(entries[:8]):
                    raw_item_id = str(entry.get("itemId", "unknown"))
                    item_id = raw_item_id.replace("_", " ").upper()
                    quantity = max(1, int(entry.get("quantity", 1) or 1))
                    row = pygame.Rect(panel.x + 26, content_y + index * 39, panel.width - 52, 32)
                    pygame.draw.rect(self.screen, (229, 234, 224), row, border_radius=4)
                    if raw_item_id in STAMINA_SUPPLY_ITEMS:
                        self.text(item_id[:32], (row.x + 12, row.y + 9), self.font_sm, (39, 64, 51))
                        self.text(f"×{quantity}", (row.right - 128, row.y + 9), self.font_sm, (61, 100, 74))
                        button(
                            f"supply:{raw_item_id}",
                            "USE",
                            pygame.Rect(row.right - 82, row.y + 3, 70, 26),
                        )
                    else:
                        self.text(item_id[:54], (row.x + 12, row.y + 9), self.font_sm, (39, 64, 51))
                        self.text(f"×{quantity}", (row.right - 42, row.y + 9), self.font_sm, (61, 100, 74))
        elif state.active_page == "vending":
            entries = state.vending_catalog
            if entries is None:
                message = "LOADING LIVE VENDING STOCK…" if "vending_catalog" in state.game_service_loading else "LINK A GAME ACCOUNT TO LOAD STOCK"
                self.text(message, (panel.x + 28, content_y + 15), self.font_md, (75, 96, 84))
            elif not entries:
                self.text("NO VENDING STOCK AVAILABLE", (panel.x + 28, content_y + 15), self.font_md, (75, 96, 84))
            else:
                for index, entry in enumerate(entries[:5]):
                    y = content_y + index * 51
                    row = pygame.Rect(panel.x + 24, y, panel.width - 48, 44)
                    pygame.draw.rect(self.screen, (229, 234, 224), row, border_radius=5)
                    name = str(entry.get("name", entry.get("id", "Item")))
                    description = str(entry.get("blurb", ""))
                    price = int(entry.get("priceFiat", 0) or 0)
                    self.text(name[:31], (row.x + 10, row.y + 5), self.font_md, (39, 64, 51))
                    self.text(description[:58], (row.x + 10, row.y + 25), self.font_sm, (91, 107, 97))
                    buy_rect = pygame.Rect(row.right - 126, row.y + 6, 116, 32)
                    button(f"buy:{entry.get('id', '')}", f"BUY ƒ{price:,}", buy_rect)
            button(
                "vending:business-stock",
                "B  BUSINESS STOCK + GHOST CONTACT",
                pygame.Rect(panel.x + 26, panel.bottom - 70, panel.width - 52, 38),
            )
        elif state.active_page == "business_stock":
            listings = state.business_stock_lines
            if listings is None:
                message = "LOADING BUSINESS STOCK…" if "vending_catalog" in state.game_service_loading else "OPEN THIS SCREEN AT A TOWER VENDING MACHINE"
                self.text(message, (panel.x + 28, content_y + 15), self.font_md, (75, 96, 84))
            elif not listings:
                self.text("NO BUSINESS STOCK INFORMATION AVAILABLE", (panel.x + 28, content_y + 15), self.font_md, (75, 96, 84))
            else:
                for index, listing in enumerate(listings[:10]):
                    y = content_y + index * 32
                    seller = str(listing.get("sellerName") or listing.get("specialty", "SPECIALTY").replace("-", " ")).upper()
                    location = str(listing.get("sellerLocationLabel") or "LOCATION NOT ASSIGNED").upper()
                    items = listing.get("items", [])
                    if isinstance(items, list) and items:
                        details = ", ".join(
                            f"{item.get('name', item.get('id', 'Item'))} ƒ{int(item.get('priceFiat', 0) or 0):,}"
                            for item in items[:2]
                            if isinstance(item, dict)
                        )
                    else:
                        categories = listing.get("quoteCategories", [])
                        details = ", ".join(str(value) for value in categories) if isinstance(categories, list) and categories else "QUOTE REQUIRED"
                    row = pygame.Rect(panel.x + 26, y, panel.width - 52, 28)
                    pygame.draw.rect(self.screen, (229, 234, 224), row, border_radius=4)
                    self.text(f"{seller} · {location} / {details}"[:96], (row.x + 10, row.y + 7), self.font_sm, (39, 64, 51))
            ghost = state.ghost_listing or {}
            self.text(
                str(ghost.get("notice", "THE GHOST / DIRECT INTERACTION ONLY")).upper()[:90],
                (panel.x + 28, panel.bottom - 54),
                self.font_sm,
                (85, 103, 94),
            )
            self.text(
                "GHOST CONTACT AND TRADE REQUIRE DIRECT, PROXIMITY-VERIFIED INTERACTION",
                (panel.x + 28, panel.bottom - 34),
                self.font_sm,
                (85, 103, 94),
            )
            button(
                "vending:business-stock",
                "B  RETURN TO VENDING",
                pygame.Rect(panel.x + 26, panel.bottom - 91, panel.width - 52, 32),
            )
        elif state.active_page == "bank":
            if state.fiat_balance is None or state.fiat_spendable is None:
                value = "LOADING…" if "bank" in state.game_service_loading else "ACCOUNT LINK REQUIRED"
                self.text(value, (panel.x + 28, content_y + 14), self.font_lg, (43, 75, 54))
            else:
                self.text("TOTAL FIAT", (panel.x + 28, content_y + 14), self.font_sm, (85, 103, 94))
                self.text(f"ƒ{state.fiat_balance:,.0f}", (panel.x + 28, content_y + 43), self.font_xl, (35, 83, 58))
                self.text("SPENDABLE", (panel.x + 28, content_y + 111), self.font_sm, (85, 103, 94))
                self.text(f"ƒ{state.fiat_spendable:,.0f}", (panel.x + 28, content_y + 140), self.font_lg, (35, 83, 58))
            self.text("View only. Transfers and cash-out are not available here.", (panel.x + 28, panel.bottom - 47), self.font_sm, (85, 103, 94))
        elif state.active_page == "phone":
            button("phone:call-home", "CALLL HOME / VOICE", pygame.Rect(panel.x + 26, content_y, panel.width - 52, 56))
            button("phone:comms", "COMMS / TEAM MESSAGES", pygame.Rect(panel.x + 26, content_y + 70, panel.width - 52, 56))
            self.text(
                "Select a service to open its connected SALARYMAN screen.",
                (panel.x + 28, content_y + 152),
                self.font_sm,
                (85, 103, 94),
            )
        elif state.active_page == "reception":
            services = (
                ("reception:1", "1  JOB OPPORTUNITIES"),
                ("reception:2", "2  BUSINESS CONTRACTS"),
                ("reception:3", "3  REAL ESTATE / LEASING"),
            )
            for index, (key, label) in enumerate(services):
                button(
                    key,
                    label,
                    pygame.Rect(panel.x + 26, content_y + index * 57, panel.width - 52, 45),
                )
            self.text(
                "Choose a service to open its existing SALARYMAN screen.",
                (panel.x + 28, panel.bottom - 44),
                self.font_sm,
                (85, 103, 94),
            )

    def draw_game_page(self, state: OfficeState, scene: TowerScene) -> None:
        self.game_page_actions = {}
        veil = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pygame.draw.rect(veil, (2, 8, 10, 255), pygame.Rect(0, 58, self.width, self.height - 58))
        self.screen.blit(veil, (0, 0))
        page = pygame.Rect(42, 76, self.width - 84, 514)
        accent = Palette.MATRIX_AMBER if state.active_page in {
            "economy", "company_relocation"
        } else Palette.MATRIX_GREEN
        self.matrix_panel(page, accent)
        custom_titles = {
            "pest_jobs": "LOCAL PEST WORK ORDERS",
            "pest_uniform": "PEST RESPONSE UNIFORM",
            "melee": "NON-GRAPHIC MELEE",
            "utility_work": "TOWER UTILITY WORK",
            "company_relocation": "COMPANY GROWTH",
            "business": "TOWER BUSINESS OFFICE",
        }
        self.text(
            "ECONOMIC CONTROL" if state.active_page == "economy" else custom_titles.get(
                state.active_page or "", "TOOLS / MAINTENANCE"
            ),
            (page.x + 24, page.y + 18),
            self.font_xl,
            Palette.MATRIX_BRIGHT,
        )
        source = state.page_source or "LIVE OBJECT"
        self.text(f"ACCESS PATH / {source}", (page.x + 26, page.y + 54), self.font_mono, Palette.MATRIX_DIM)
        self.overlay_close_rect = pygame.Rect(page.right - 108, page.y + 18, 82, 28)
        self.panel(self.overlay_close_rect, Palette.MATRIX_PANEL_2, accent, radius=2, width=1)
        self.text("CLOSE  ESC", (self.overlay_close_rect.x + 10, self.overlay_close_rect.y + 8), self.font_mono, accent)
        if state.active_page == "business":
            self._draw_business_page(state, scene, page)
        elif state.active_page in custom_titles:
            self._draw_basement_page(state, scene, page)
        elif state.active_page == "economy":
            self.draw_economy_page(state, page)
        else:
            self.draw_tools_page(state, page)

    def _draw_business_page(
        self,
        state: OfficeState,
        scene: TowerScene,
        page: pygame.Rect,
    ) -> None:
        item = scene.objects.get(state.active_object_id or "")
        if item is None:
            item = scene.nearby_object
        business_name = item.label if item is not None else "BUSINESS OFFICE"
        self.text(
            business_name.upper()[:62],
            (page.x + 26, page.y + 103),
            self.font_lg,
            Palette.MATRIX_BRIGHT,
        )
        self.text(
            f"FLOOR {scene.current_floor:02d} / UNIT {item.unit_number:02d}" if item and item.unit_number else f"FLOOR {scene.current_floor:02d} / PUBLIC LOBBY KIOSK",
            (page.x + 26, page.y + 137),
            self.font_mono,
            Palette.MATRIX_DIM,
        )
        actions = item.service_actions if item is not None else ()
        if not actions:
            self.text(
                "NO CONNECTED SERVICE SCREEN",
                (page.x + 26, page.y + 193),
                self.font_lg,
                Palette.MATRIX_AMBER,
            )
            self.text(
                "This location has no live stock or purchase flow. No sale was recorded.",
                (page.x + 26, page.y + 230),
                self.font_sm,
                Palette.MATRIX_DIM,
            )
            return
        for index, action in enumerate(actions):
            y = page.y + 180 + index * 54
            button = pygame.Rect(page.x + 26, y, min(page.width - 52, 590), 42)
            self.game_page_actions[f"business:{action}"] = button
            self.panel(button, Palette.MATRIX_PANEL_2, Palette.MATRIX_GREEN, radius=3, width=1)
            label = BUSINESS_ACTION_LABELS.get(action, action.replace("_", " ").upper())
            self.text(label, (button.x + 14, button.y + 13), self.font_md, Palette.MATRIX_BRIGHT)
        self.text(
            "Existing SALARYMAN screens only. FIAT, GOLD, and inventory rules are unchanged.",
            (page.x + 26, page.bottom - 36),
            self.font_sm,
            Palette.MATRIX_DIM,
        )

    def _draw_basement_page(
        self,
        state: OfficeState,
        scene: TowerScene,
        page: pygame.Rect,
    ) -> None:
        content = page.y + 92
        if state.active_page == "pest_jobs":
            for index, job in enumerate(PEST_JOBS):
                x = page.x + 24 + index * ((page.width - 60) // 2 + 12)
                card = pygame.Rect(x, content, (page.width - 60) // 2, 250)
                self.panel(card, Palette.MATRIX_PANEL_2, Palette.MATRIX_GREEN, radius=4, width=1)
                order = state.pest_work_orders[job["id"]]
                self.text(job["label"], (card.x + 16, card.y + 14), self.font_lg, Palette.MATRIX_BRIGHT)
                self.text(job["description"], (card.x + 16, card.y + 51), self.font_sm, Palette.MATRIX_DIM)
                progress = int(order["progress"])
                self.text(
                    f"{job['progressLabel']} / {progress} OF {job['goal']}",
                    (card.x + 16, card.y + 100),
                    self.font_mono,
                    Palette.MATRIX_GREEN,
                )
                bar = pygame.Rect(card.x + 16, card.y + 133, card.width - 32, 12)
                pygame.draw.rect(self.screen, (20, 34, 30), bar)
                filled = int(bar.width * progress / max(1, int(job["goal"])))
                pygame.draw.rect(self.screen, Palette.MATRIX_GREEN, (bar.x, bar.y, filled, bar.height))
                label = "COMPLETE" if order["complete"] else (
                    "CONTINUE ORDER" if state.active_pest_job == job["id"] else "START ORDER"
                )
                button = pygame.Rect(card.x + 16, card.y + 177, card.width - 32, 46)
                self._draw_basement_action(
                    f"pest_job:{job['id']}",
                    label,
                    button,
                    disabled=bool(order["complete"]) or not state.pest_uniform_worn,
                )
            warning = (
                "Equip the uniform at the lobby or B1 station before starting."
                if not state.pest_uniform_worn
                else "Progress is saved on this computer. Orders grant no separate payout."
            )
            self.text(warning, (page.x + 28, page.bottom - 42), self.font_sm, Palette.MATRIX_AMBER)
            return

        if state.active_page == "pest_uniform":
            worn = state.pest_uniform_worn
            self.text(
                "UNIFORM STATUS / " + ("WORN" if worn else "NOT WORN"),
                (page.x + 28, content + 12),
                self.font_lg,
                Palette.MATRIX_GREEN if worn else Palette.MATRIX_AMBER,
            )
            self.text(
                "The uniform is required for Tower utility shifts. Its saved state is account-wide.",
                (page.x + 28, content + 58),
                self.font_md,
                Palette.MATRIX_DIM,
            )
            self._draw_basement_action(
                "pest_uniform:toggle",
                "REMOVE UNIFORM" if worn else "EQUIP UNIFORM",
                pygame.Rect(page.x + 28, content + 112, page.width - 56, 54),
            )
            return

        if state.active_page == "melee":
            snapshot = scene.basement_snapshot or {}
            pests = snapshot.get("pests", [])
            active_count = sum(
                1 for pest in pests
                if isinstance(pest, dict) and pest.get("status") == "active"
            ) if isinstance(pests, list) else 0
            stamina = int(snapshot.get("player", {}).get("stamina", state.pest_stamina)) \
                if isinstance(snapshot.get("player"), dict) else state.pest_stamina
            self.text(
                f"SERVER STAMINA / {stamina}%    ACTIVE PESTS / {active_count}",
                (page.x + 28, content + 2),
                self.font_mono,
                Palette.MATRIX_GREEN,
            )
            self.text(
                "Humanoid targets are not spawned. Any future humanoid moves stay nonlethal; stabbing is pest-only.",
                (page.x + 28, content + 27),
                self.font_sm,
                Palette.MATRIX_DIM,
            )
            cols = 3
            gap = 12
            button_w = (page.width - 56 - gap * (cols - 1)) // cols
            for index, move in enumerate(MELEE_MOVES):
                row, col = divmod(index, cols)
                rect = pygame.Rect(
                    page.x + 28 + col * (button_w + gap),
                    content + 66 + row * 72,
                    button_w,
                    58,
                )
                suffix = " / TOOL" if move.get("toolRequired") else ""
                label = f"{index + 1}. {move['label']} / {move['stamina']} STA{suffix}"
                self._draw_basement_action(
                    f"pest_move:{move['id']}",
                    label,
                    rect,
                    disabled=active_count == 0 or stamina < move["stamina"],
                )
            return

        if state.active_page == "utility_work":
            elapsed = max(0.0, __import__("time").monotonic() - state.utility_work_started_at)
            progress = min(1.0, elapsed / 8.0)
            label = (state.utility_work_target or "TOWER").replace("_", " ").upper()
            self.text(
                f"{label} / SHARED TOWER MAINTENANCE",
                (page.x + 28, content + 10),
                self.font_lg,
                Palette.MATRIX_BRIGHT,
            )
            self.text(
                "The server settles the repair. Use this wall-cavity chart to trace the affected system.",
                (page.x + 28, content + 54),
                self.font_sm,
                Palette.MATRIX_DIM,
            )
            bar = pygame.Rect(page.x + 28, content + 106, page.width - 56, 22)
            pygame.draw.rect(self.screen, Palette.MATRIX_PANEL_2, bar)
            pygame.draw.rect(
                self.screen,
                Palette.MATRIX_GREEN,
                (bar.x, bar.y, int(bar.width * progress), bar.height),
            )
            self.text(
                "WAITING FOR SERVER CONFIRMATION" if state.utility_work_active else "WORK COMPLETE",
                (page.x + 28, content + 146),
                self.font_mono,
                Palette.MATRIX_AMBER if state.utility_work_active else Palette.MATRIX_GREEN,
            )
            infra = FLOOR_PLAN.get("infrastructureMap", {})
            standard = infra.get("standardFloor", {}) if isinstance(infra, dict) else {}
            wall_routes = standard.get("wallRoutes", []) if isinstance(standard, dict) else []
            systems = infra.get("systems", []) if isinstance(infra, dict) else []
            diagram_top = content + 184
            diagram = pygame.Rect(
                page.x + 28,
                diagram_top,
                page.width - 56,
                max(118, page.bottom - diagram_top - 18),
            )
            self.panel(diagram, Palette.MATRIX_PANEL_2, Palette.MATRIX_GRID, radius=3, width=1)
            self.text(
                "TOWER UTILITY ROUTE / SEPARATE LANES IN THE SHARED WALL CAVITY",
                (diagram.x + 10, diagram.y + 8),
                self.font_sm,
                Palette.MATRIX_BRIGHT,
            )

            colors = {
                "electrical": Palette.MATRIX_AMBER,
                "water": (89, 174, 231),
                "fire_alarm": (241, 106, 93),
                "fire_suppression": (247, 145, 89),
            }
            map_height = max(76, diagram.height - 48)
            floor_map = pygame.Rect(diagram.x + 12, diagram.y + 34, 180, map_height)
            pygame.draw.rect(self.screen, Palette.MATRIX_PANEL, floor_map, border_radius=2)
            envelope = standard.get("clearEnvelopeUnits", [22_000, 25_000])
            envelope_w = max(1, int(envelope[0]))
            envelope_h = max(1, int(envelope[1]))
            scale = min((floor_map.width - 12) / envelope_w, (floor_map.height - 12) / envelope_h)
            route_w = max(1, int(envelope_w * scale))
            route_h = max(1, int(envelope_h * scale))
            route_x = floor_map.x + (floor_map.width - route_w) // 2
            route_y = floor_map.y + (floor_map.height - route_h) // 2
            floor_rect = pygame.Rect(route_x, route_y, route_w, route_h)
            pygame.draw.rect(self.screen, Palette.MATRIX_GRID, floor_rect, width=1)

            if isinstance(systems, list) and isinstance(wall_routes, list):
                for system_index, system in enumerate(systems):
                    if not isinstance(system, dict):
                        continue
                    color = colors.get(str(system.get("id")), Palette.MATRIX_GREEN)
                    route_ids = set(system.get("wallRouteIds", []))
                    lane_offset = system_index - (len(systems) - 1) / 2
                    for route in wall_routes:
                        if not isinstance(route, dict) or route.get("id") not in route_ids:
                            continue
                        raw_points = route.get("points", [])
                        if not isinstance(raw_points, list) or len(raw_points) < 2:
                            continue
                        points = [
                            (
                                route_x + int(float(point[0]) / envelope_w * route_w),
                                route_y + int(float(point[1]) / envelope_h * route_h + lane_offset),
                            )
                            for point in raw_points
                            if isinstance(point, list) and len(point) == 2
                        ]
                        if len(points) >= 2:
                            pygame.draw.lines(self.screen, color, False, points, 2)

            offices = FLOOR_PLAN.get("baseLayout", {}).get("offices", [])
            if isinstance(offices, list):
                for office in offices:
                    entrance = office.get("entrance") if isinstance(office, dict) else None
                    if not isinstance(entrance, list) or len(entrance) != 2:
                        continue
                    marker = (
                        route_x + int(float(entrance[0]) / envelope_w * route_w),
                        route_y + int(float(entrance[1]) / envelope_h * route_h),
                    )
                    pygame.draw.circle(self.screen, Palette.MATRIX_BRIGHT, marker, 3)

            riser_x = floor_map.right + 26
            riser_top = diagram.y + 47
            riser_bottom = diagram.bottom - 26
            for system_index, (system_id, color) in enumerate(colors.items()):
                x = riser_x + system_index * 4
                pygame.draw.line(self.screen, color, (x, riser_top), (x, riser_bottom), 2)
            levels = [
                ("67", 0.0),
                ("07", 0.20),
                ("06", 0.29),
                ("01", 0.40),
                ("B1", 0.52),
                ("B3", 0.67),
                ("B5", 0.82),
                ("B6", 0.95),
            ]
            for level, ratio in levels:
                y = riser_top + int((riser_bottom - riser_top) * ratio)
                pygame.draw.circle(self.screen, Palette.MATRIX_BRIGHT, (riser_x + 6, y), 3)
                self.text(level, (riser_x + 16, y - 6), self.font_sm, Palette.MATRIX_DIM)
            legend_x = riser_x + 58
            legend_y = diagram.y + 43
            labels = (
                ("POWER / B5", colors["electrical"]),
                ("WATER / B6", colors["water"]),
                ("FIRE ALARM / B3", colors["fire_alarm"]),
                ("FIRE PIPE / B6", colors["fire_suppression"]),
            )
            for index, (legend, color) in enumerate(labels):
                y = legend_y + index * 22
                pygame.draw.line(self.screen, color, (legend_x, y + 6), (legend_x + 16, y + 6), 3)
                self.text(legend, (legend_x + 22, y), self.font_sm, Palette.MATRIX_DIM)
            self.text(
                "STANDARD FLOOR 220 × 250 M / LOBBY + B1–B6 USE THEIR OWN FOOTPRINTS",
                (diagram.x + 202, diagram.bottom - 19),
                self.font_sm,
                Palette.MATRIX_DIM,
            )
            return

        if state.active_page == "company_relocation":
            elapsed = state.relocation_cutscene_elapsed
            beats = (
                (1.2, "THE CREW FINISHES ITS TOWER SERVICE ORDERS."),
                (2.6, "A COMPANY RELOCATION IS APPROVED."),
                (4.3, "THE NEW ADDRESS IS SEALED."),
                (6.0, "DESTINATION WITHHELD / NO NEW AREA UNLOCKED."),
            )
            message = next((text for end, text in beats if elapsed < end), beats[-1][1])
            frame = pygame.Rect(page.x + 74, content + 32, page.width - 148, 230)
            self.panel(frame, Palette.MATRIX_PANEL_2, Palette.MATRIX_AMBER, radius=3, width=2)
            self.text(
                "OPERATIONS MOVE / APPROVED",
                (frame.x + 24, frame.y + 34),
                self.font_lg,
                Palette.MATRIX_BRIGHT,
            )
            self.text(
                message,
                (frame.x + 24, frame.y + 96),
                self.font_md,
                Palette.MATRIX_AMBER,
            )
            pygame.draw.rect(
                self.screen,
                Palette.MATRIX_DIM,
                pygame.Rect(frame.x + 24, frame.y + 147, frame.width - 48, 4),
            )
            fill = int((frame.width - 48) * min(1.0, elapsed / 6.0))
            pygame.draw.rect(
                self.screen,
                Palette.MATRIX_AMBER,
                pygame.Rect(frame.x + 24, frame.y + 147, fill, 4),
            )
            if state.relocation_cutscene_pending:
                self.text(
                    "CUTSCENE / DESTINATION NOT SHOWN",
                    (page.x + 28, page.bottom - 40),
                    self.font_mono,
                    Palette.MATRIX_DIM,
                )
            return

    def _draw_basement_action(
        self,
        key: str,
        label: str,
        rect: pygame.Rect,
        *,
        disabled: bool = False,
    ) -> None:
        self.game_page_actions[key] = rect
        color = Palette.MATRIX_DIM if disabled else Palette.MATRIX_GREEN
        self.panel(rect, Palette.MATRIX_PANEL_2, color, radius=3, width=1)
        self.text(
            label,
            (rect.x + 10, rect.y + (rect.height - self.font_mono.get_height()) // 2),
            self.font_mono,
            color,
        )

    def draw_customization_page(self, state: OfficeState, scene: TowerScene) -> None:
        """Present saved, non-interactive wall and decor choices for this room."""
        veil = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pygame.draw.rect(
            veil,
            (2, 8, 10, 210),
            pygame.Rect(0, 58, self.width, self.height - 58),
        )
        self.screen.blit(veil, (0, 0))

        page_width = max(360, self.width - 84)
        page_height = min(514, max(360, self.height - 106))
        page = pygame.Rect(0, 0, page_width, page_height)
        page.center = (self.width // 2, self.height // 2 + 18)
        self.matrix_panel(page, Palette.SEAFOAM)
        self.text(
            "ROOM PERSONALIZATION",
            (page.x + 24, page.y + 18),
            self.font_xl,
            Palette.MATRIX_BRIGHT,
        )
        self.text(
            f"{scene.room.label}  /  VISUAL CHOICES ONLY",
            (page.x + 26, page.y + 54),
            self.font_mono,
            Palette.MATRIX_DIM,
        )

        self.overlay_close_rect = pygame.Rect(page.right - 108, page.y + 18, 82, 28)
        self.panel(
            self.overlay_close_rect,
            Palette.MATRIX_PANEL_2,
            Palette.SEAFOAM,
            radius=2,
            width=1,
        )
        self.text(
            "CLOSE  ESC",
            (self.overlay_close_rect.x + 10, self.overlay_close_rect.y + 8),
            self.font_mono,
            Palette.SEAFOAM,
        )

        customization = state.get_room_customization(scene.current_room)
        self.customize_wall_rects = {}
        self.customize_decor_rects = {}
        left = page.x + 24
        available_width = page.width - 48

        self.text("WALL FINISH", (left, page.y + 96), self.font_md, Palette.MATRIX_BRIGHT)
        wall_gap = 10
        wall_width = (
            available_width - wall_gap * (len(WALL_FINISHES) - 1)
        ) // len(WALL_FINISHES)
        for index, finish in enumerate(WALL_FINISHES):
            rect = pygame.Rect(
                left + index * (wall_width + wall_gap),
                page.y + 122,
                wall_width,
                54,
            )
            selected = customization["wall_style"] == finish.id
            self.customize_wall_rects[finish.id] = rect
            self.panel(
                rect,
                finish.beam,
                finish.edge if selected else finish.detail,
                radius=5,
                width=3 if selected else 1,
            )
            pygame.draw.rect(
                self.screen,
                finish.edge,
                pygame.Rect(rect.x + 10, rect.y + 10, 18, 18),
            )
            self.text(
                finish.label,
                (rect.x + 36, rect.y + 14),
                self.font_sm,
                Palette.GLASS_BRIGHT,
            )
            self.text(
                "SELECTED" if selected else "WALL",
                (rect.x + 10, rect.y + 34),
                self.font_mono,
                finish.edge,
            )

        self.text("DECOR SET", (left, page.y + 202), self.font_md, Palette.MATRIX_BRIGHT)
        decor_gap = 12
        decor_width = (available_width - decor_gap) // 2
        for index, preset in enumerate(DECOR_PRESETS):
            rect = pygame.Rect(
                left + (index % 2) * (decor_width + decor_gap),
                page.y + 228 + (index // 2) * 62,
                decor_width,
                52,
            )
            selected = customization["decor_style"] == preset.id
            self.customize_decor_rects[preset.id] = rect
            self.panel(
                rect,
                Palette.MATRIX_PANEL_2,
                Palette.MATRIX_AMBER if selected else Palette.MATRIX_GRID,
                radius=4,
                width=2 if selected else 1,
            )
            self.text(
                preset.label,
                (rect.x + 14, rect.y + 10),
                self.font_md,
                Palette.MATRIX_BRIGHT,
            )
            detail = "CURRENT ROOM" if selected else "WALL ART  ·  PLANTS  ·  SHELVING"
            self.text(
                detail,
                (rect.x + 14, rect.y + 32),
                self.font_mono,
                Palette.MATRIX_DIM,
            )

        self.text(
            "Saved to this game profile. Furniture stays decorative; live objects and collision are unchanged.",
            (left, page.bottom - 42),
            self.font_sm,
            (186, 204, 187),
        )

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