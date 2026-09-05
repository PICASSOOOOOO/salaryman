import type { StationGlyph } from '@/components/office/OfficeStationSprite';

/**
 * Shared office contract types.
 *
 * These describe the LOGICAL office floor (interaction stations, enclosed
 * executive rooms, and bot occupants) independent of how it's rendered. The
 * live `/office` renderer (IsoOffice) consumes them; the legacy flat cutscene
 * diorama (PixelOffice) no longer does. They live here — not inside a specific
 * renderer — so there's one source of truth for the office data shape.
 */

/**
 * A walk-up interaction point on the office floor. The player walks within
 * `radius` native px of the station's tile centre and a prompt appears; pressing
 * E / Enter (or tapping the prompt) fires `onInteract`. Stations are PORTALS to
 * EXISTING app features (classroom, comms, vending, sound lab, arcade) — the
 * office page owns the handler and any overlay; the renderer only draws the
 * sprite + drives proximity. Each station is drawn either from a reused
 * furniture PNG (`art`) or an inline-SVG pixel sprite (`glyph`).
 */
export interface OfficeStation {
  id: string;
  /** Tile coords of the sprite's top-left on the floor grid. */
  col: number;
  row: number;
  /** Prompt + floating label, e.g. "CONFERENCE". */
  label: string;
  onInteract: () => void;
  /** Interaction radius from the sprite centre, native px. Default 24. */
  radius?: number;
  /** Visible/collision footprint on the floor plane, in tiles. */
  footprint?: { w: number; d: number };
  /** Reuse an existing furniture PNG (size in TILEs). */
  art?: { src: string; wTiles: number; hTiles: number };
  /** OR draw an inline-SVG pixel sprite. */
  glyph?: StationGlyph;
}

export interface OfficeFloorRect {
  id: string;
  col: number;
  row: number;
  w: number;
  d: number;
}

export interface OfficeDesk extends OfficeFloorRect {
  kind: 'player' | 'team';
}

export interface OfficeCapsule extends OfficeFloorRect {
  kind: 'capsule';
}

/**
 * An enclosed interior room (executive office) overlaid on the floor. Rendered
 * with a back wall + side walls + a low glass front partition that has a
 * walkable door gap, a nameplate, and (when occupied) a desk + a standing
 * occupant sprite. All four walls block movement via tile collision; only the
 * door gap is walkable. Coordinates are tile indices on the floor grid.
 */
export interface OfficeRoom {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Side the walkable door gap sits on. Default 'bottom' (camera-facing front). */
  doorSide?: 'top' | 'bottom' | 'left' | 'right';
  /** Tile index along the door side where the gap starts. Default centred. */
  doorAt?: number;
  /** Door gap width in tiles. Default 2. */
  doorSpan?: number;
  /** Nameplate text (e.g. a role / job title). */
  label?: string;
  /** Smaller sub-label under the nameplate (e.g. a department). */
  sub?: string;
  /** Accent colour for the nameplate + glass tint. */
  accent?: string;
  /** Whether the room's entrance is visibly secured. */
  locked?: boolean;
  /** Server-backed access intent for this entrance. */
  access?: 'password' | 'organization';
  /** Hue seed for the occupant sprite. Omit for an empty (vacant) office. */
  occupantSeed?: number;
}

/** A bot occupant placed on the office floor (desk or storage capsule). */
export interface OfficeBot {
  /** Bot id, used as the sprite tint seed. */
  id: number;
  /** Display name — placed under the desk as a small floor label. */
  name: string;
  /** Only 'active' bots are drawn at desks; others leave the desk empty. */
  status: string;
  /**
   * Hex accent of the bot's TEAM. When set, the desk/capsule name-plate and
   * the capsule trim are tinted with it so same-team bots (placed next to each
   * other by the caller) read as a visual group on the floor.
   */
  teamColor?: string;
  /** Human team label (e.g. "Trading Desk") — used for the pod tooltip. */
  teamLabel?: string;
}

/** @deprecated Legacy alias kept for callers still importing the old name. */
export type PixelOfficeBot = OfficeBot;
