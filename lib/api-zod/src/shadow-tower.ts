import { z } from "zod";
import {
  getTowerBusinessConversation,
  getTowerBusinessPlacement,
  TOWER_INFRASTRUCTURE_BUSINESSES,
  type TowerBusinessConversation,
  type TowerInfrastructureBusiness,
} from "./tower-commerce";
import { minimumPropertyStartingFiat } from "./property-market";

/** The only purchasable Shadow Tower floor plans. */
export const SHADOW_TOWER_ARCHETYPES = ["founder_team", "company"] as const;
export type ShadowTowerArchetype = (typeof SHADOW_TOWER_ARCHETYPES)[number];
export const SHADOW_TOWER_CITIES = ["minx_city", "huda_city"] as const;
export type ShadowTowerCity = (typeof SHADOW_TOWER_CITIES)[number];
export const SHADOW_TOWER_UPGRADES = [
  "secure_access",
  "extra_desk", "extra_desk_2", "extra_desk_3", "extra_desk_4",
  "extra_terminal", "extra_terminal_2", "extra_terminal_3", "extra_terminal_4",
  // Legacy aliases retained so already-settled floors keep their fit-outs.
  "extra_workstations", "operations_terminal",
] as const;
export type ShadowTowerUpgrade = (typeof SHADOW_TOWER_UPGRADES)[number];
export const SHADOW_TOWER_FLOOR_TYPES = ["office", "lobby", "recreation", "mezzanine", "rest", "security"] as const;
export type ShadowTowerFloorType = (typeof SHADOW_TOWER_FLOOR_TYPES)[number];

const pointSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict();
const footprintSchema = z.object({
  x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
  cols: z.number().int().positive(), rows: z.number().int().positive(),
}).strict();
const shadowTowerDoorSchema = z.object({
  side: z.enum(["top", "bottom", "left", "right"]),
  at: z.number().int().nonnegative(),
  span: z.number().int().positive(),
  access: z.enum(["password", "organization"]),
}).strict();
export const shadowTowerObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["elevator_hall", "stairs", "executive_room", "office_unit", "executive_desk", "workstation", "terminal", "tenant_station", "atm", "vending_machine", "elevator", "radio", "payphone", "rec_station", "sponsor", "bar", "bed", "nurse_station", "doctor_station", "work_board", "guard_station", "holding_cell", "evidence_lockup", "black_market", "secret_door"]),
  businessKey: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  footprint: footprintSchema,
  door: shadowTowerDoorSchema.optional(),
  interactive: z.boolean(),
}).strict();

export const shadowTowerPlanSchema = z.object({
  floorType: z.enum(SHADOW_TOWER_FLOOR_TYPES).default("office"),
  city: z.enum(SHADOW_TOWER_CITIES),
  floorNumber: z.number().int().min(1).max(120),
  archetype: z.enum(SHADOW_TOWER_ARCHETYPES).optional(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  spawn: pointSchema,
  upgrades: z.array(z.enum(SHADOW_TOWER_UPGRADES)).default([]),
  objects: z.array(shadowTowerObjectSchema).min(1),
  collisionFootprints: z.array(footprintSchema).min(1),
}).strict();
export type ShadowTowerPlan = z.infer<typeof shadowTowerPlanSchema>;

export const shadowTowerListingSchema = z.object({
  archetype: z.enum(SHADOW_TOWER_ARCHETYPES),
  title: z.string().min(1), subtitle: z.string().min(1), capacity: z.number().int().positive(),
  purchaseFiat: z.number().int().positive(), leaseFiat: z.number().int().positive(),
  previewKey: z.string().min(1),
}).strict();
export type ShadowTowerListing = z.infer<typeof shadowTowerListingSchema>;

export const SHADOW_TOWER_LISTINGS: Record<ShadowTowerArchetype, ShadowTowerListing> = {
  founder_team: { archetype: "founder_team", title: "Founder + Team Floor", subtitle: "A focused launch floor for a founding team.", capacity: 6, purchaseFiat: 240_000, leaseFiat: 12_000, previewKey: "shadow-tower-founder-team" },
  company: { archetype: "company", title: "Company Floor", subtitle: "A full operational floor for an active company.", capacity: 20, purchaseFiat: 720_000, leaseFiat: 36_000, previewKey: "shadow-tower-company" },
};

/** The real-estate shell is deliberately independent of the playable tile map. */
export const SHADOW_TOWER_FLOOR_ENVELOPE = { widthPixels: 100_000, heightPixels: 100_000, squareMeters: 10_000 } as const;
export const SHADOW_TOWER_MIN_OFFICE_UNITS = 1;
export const SHADOW_TOWER_MAX_OFFICE_UNITS = 4;
export const SHADOW_TOWER_RESERVED_FLOORS = [1, 2, 3, 4, 40, 52, 65, 66, 67] as const;

export const SHADOW_TOWER_FIAT_PER_SQUARE_METER: Record<ShadowTowerArchetype, Record<"own" | "lease", number>> = {
  founder_team: { own: 24, lease: 1.2 },
  company: { own: 72, lease: 3.6 },
};
export const SHADOW_TOWER_FIAT_PER_SQUARE_PIXEL: Record<ShadowTowerArchetype, Record<"own" | "lease", number>> = Object.fromEntries(
  SHADOW_TOWER_ARCHETYPES.map((archetype) => [archetype, {
    own: SHADOW_TOWER_FIAT_PER_SQUARE_METER[archetype].own / (SHADOW_TOWER_FLOOR_ENVELOPE.widthPixels * SHADOW_TOWER_FLOOR_ENVELOPE.heightPixels / SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters),
    lease: SHADOW_TOWER_FIAT_PER_SQUARE_METER[archetype].lease / (SHADOW_TOWER_FLOOR_ENVELOPE.widthPixels * SHADOW_TOWER_FLOOR_ENVELOPE.heightPixels / SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters),
  }]),
) as Record<ShadowTowerArchetype, Record<"own" | "lease", number>>;

export const shadowTowerHallwaySchema = z.object({
  style: z.enum(["central", "gallery", "executive"]),
  lighting: z.enum(["normal", "warm", "cool"]),
  signage: z.string().max(28).optional(),
}).strict();
export type ShadowTowerHallway = z.infer<typeof shadowTowerHallwaySchema>;

export function isCommercialShadowTowerFloor(floorNumber: number) {
  return Number.isInteger(floorNumber) && floorNumber >= 5 && floorNumber <= 64
    && !(SHADOW_TOWER_RESERVED_FLOORS as readonly number[]).includes(floorNumber);
}

export type ShadowTowerAreaQuote = { totalFiat: number; squareMeters: number; squarePixels: number; fiatPerSquareMeter: number; fiatPerSquarePixel: number; verticalMultiplier: number };
export function getShadowTowerVerticalMultiplier(floorNumber: number) { return 1 + (floorNumber - 1) * 0.01; }
export function quoteShadowTowerArea(archetype: ShadowTowerArchetype, floorNumber: number, tenure: "own" | "lease", squareMeters: number): ShadowTowerAreaQuote {
  const fiatPerSquareMeter = SHADOW_TOWER_FIAT_PER_SQUARE_METER[archetype][tenure];
  const fiatPerSquarePixel = SHADOW_TOWER_FIAT_PER_SQUARE_PIXEL[archetype][tenure];
  const verticalMultiplier = getShadowTowerVerticalMultiplier(floorNumber);
  const squarePixels = squareMeters * SHADOW_TOWER_FLOOR_ENVELOPE.widthPixels * SHADOW_TOWER_FLOOR_ENVELOPE.heightPixels / SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters;
  const calculatedFiat = Math.round(squareMeters * fiatPerSquareMeter * verticalMultiplier);
  const wageFloorFiat = Math.round(minimumPropertyStartingFiat() * squareMeters / SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters);
  return { totalFiat: Math.max(calculatedFiat, wageFloorFiat), squareMeters, squarePixels, fiatPerSquareMeter, fiatPerSquarePixel, verticalMultiplier };
}
/** Whole-floor total derived from canonical physical area, not a listing lump sum. */
export function quoteShadowTowerFloor(archetype: ShadowTowerArchetype, floorNumber: number, tenure: "own" | "lease") {
  return quoteShadowTowerArea(archetype, floorNumber, tenure, SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters).totalFiat;
}

export type ShadowTowerOfficeGeometry = {
  unitNumber: number; xPixels: number; yPixels: number; widthPixels: number; heightPixels: number; squareMeters: number;
};
/** Equal vertical strips cover the entire canonical envelope without gaps or overflow. */
export function getShadowTowerOfficeUnitGeometry(officeCount: number): ShadowTowerOfficeGeometry[] {
  if (!Number.isInteger(officeCount) || officeCount < SHADOW_TOWER_MIN_OFFICE_UNITS || officeCount > SHADOW_TOWER_MAX_OFFICE_UNITS) {
    throw new Error("officeCount must be between 1 and 4");
  }
  const width = SHADOW_TOWER_FLOOR_ENVELOPE.widthPixels / officeCount;
  return Array.from({ length: officeCount }, (_, index) => ({
    unitNumber: index + 1, xPixels: index * width, yPixels: 0, widthPixels: width,
    heightPixels: SHADOW_TOWER_FLOOR_ENVELOPE.heightPixels,
    squareMeters: SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters / officeCount,
  }));
}

/** Unit listings are always server-derived from the corresponding whole-floor quote. */
export function quoteShadowTowerOfficeUnitDetail(archetype: ShadowTowerArchetype, floorNumber: number, unitNumber: number, officeCount: number, tenure: "own" | "lease") {
  if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > SHADOW_TOWER_MAX_OFFICE_UNITS) throw new Error("unitNumber must be between 1 and 4");
  const geometry = getShadowTowerOfficeUnitGeometry(officeCount).find((unit) => unit.unitNumber === unitNumber);
  if (!geometry) throw new Error("unitNumber is not part of this subdivision");
  return quoteShadowTowerArea(archetype, floorNumber, tenure, geometry.squareMeters);
}
export function quoteShadowTowerOfficeUnit(archetype: ShadowTowerArchetype, floorNumber: number, unitNumber: number, officeCount: number, tenure: "own" | "lease") {
  return quoteShadowTowerOfficeUnitDetail(archetype, floorNumber, unitNumber, officeCount, tenure).totalFiat;
}

function rect(x: number, y: number, cols: number, rows: number) { return { x, y, cols, rows }; }
function workstationObjects(count: number, startX = 5, startY = 5) {
  return Array.from({ length: count }, (_, index) => ({
    id: `workstation-${index + 1}`, kind: "workstation" as const,
    footprint: rect(startX + (index % 5) * 4, startY + Math.floor(index / 5) * 2, 2, 1), interactive: true,
  }));
}

function terminalObjects(upgrades: readonly string[]) {
  const extraTerminalUpgrades = upgrades.filter((upgrade) => /^extra_terminal(?:_[2-4])?$/.test(upgrade));
  const legacyTerminal = upgrades.includes("operations_terminal");
  return [
    ...extraTerminalUpgrades.map((_, index) => ({
      id: `terminal-${index + 2}`,
      kind: "terminal" as const,
      footprint: rect(5 + index * 2, 14, 1, 1),
      interactive: true,
    })),
    ...(legacyTerminal ? [{ id: "operations-terminal", kind: "terminal" as const, footprint: rect(13, 14, 1, 1), interactive: true }] : []),
  ];
}

function officeUnitObjects(count: number, floorNumber: number) {
  // The elevator hall occupies the west-side circulation core. Suites run
  // continuously along the north perimeter instead of floating in the room.
  const suiteStart = 4;
  const suiteWidth = Math.floor(26 / count);
  return Array.from({ length: count }, (_, index) => ({
    id: `office-address-${floorNumber}-${String(index + 1).padStart(2, "0")}`,
    kind: "office_unit" as const,
    footprint: rect(suiteStart + index * suiteWidth, 0, suiteWidth, 7),
    door: {
      side: "bottom" as const,
      at: suiteStart + index * suiteWidth + Math.max(0, Math.floor((suiteWidth - 2) / 2)),
      span: 2,
      access: "password" as const,
    },
    interactive: true,
  }));
}

/** Authoritative, serialized floor geometry; clients must not add visual-only objects. */
export function getShadowTowerPlan(city: ShadowTowerCity, floorNumber: number, archetype: ShadowTowerArchetype, upgrades: readonly string[] = [], officeCount = 1): ShadowTowerPlan {
  const enabledUpgrades = upgrades.filter(isSupportedShadowTowerUpgrade);
  const suiteCount = Math.min(SHADOW_TOWER_MAX_OFFICE_UNITS, Math.max(SHADOW_TOWER_MIN_OFFICE_UNITS, Math.trunc(officeCount)));
  const suites = officeUnitObjects(suiteCount, floorNumber);
  const executiveSuite = suites[0];
  const plan: ShadowTowerPlan = {
    floorType: "office", city, floorNumber, archetype, cols: 30, rows: archetype === "company" ? 18 : 16, spawn: { x: 3, y: 10 },
    objects: [
      { id: "elevator", kind: "elevator", footprint: rect(0, 1, 2, 2), interactive: true },
      { id: "elevator-hall", kind: "elevator_hall", footprint: rect(0, 0, 4, 8), interactive: false },
      ...suites,
      // Suite 1 is the furnished executive office assigned to the founder.
      { id: "executive-desk", kind: "executive_desk" as const, footprint: rect(executiveSuite.footprint.x + 2, 5, 2, 1), interactive: false },
      { id: "executive-terminal", kind: "terminal" as const, footprint: rect(executiveSuite.footprint.x + 5, 5, 1, 1), interactive: true },
      // Additional desks and terminals are separate vending-machine fit-outs.
      ...(enabledUpgrades.includes("extra_workstations")
        ? workstationObjects(4, 6, 9)
        : workstationObjects(enabledUpgrades.filter((upgrade) => /^extra_desk(?:_[2-4])?$/.test(upgrade)).length, 6, 9)),
      ...terminalObjects(enabledUpgrades),
      { id: "atm", kind: "atm", footprint: rect(2, 13, 1, 1), interactive: true },
      { id: "vending", kind: "vending_machine", footprint: rect(27, 11, 1, 1), interactive: true },
      { id: "stairs", kind: "stairs", footprint: rect(27, 13, 2, 2), interactive: true },
    ],
    upgrades: enabledUpgrades, collisionFootprints: [],
  };
  // The hall and office bays are structural rooms. Their walls and door gaps
  // are projected by the renderer; the room interiors are not solid furniture.
  plan.collisionFootprints = plan.objects
    .filter((object) => object.kind !== "elevator_hall" && object.kind !== "office_unit")
    .map((object) => object.footprint);
  return plan;
}

/** Physical arrival hall. This is deliberately not the public computer
 * mezzanine: reception, waiting, directory, and building operations live here
 * without any workstation objects. */
export function getLobbyPlan(city: ShadowTowerCity): ShadowTowerPlan {
  const objects: ShadowTowerPlan["objects"] = [
    { id: "lobby-elevator", kind: "elevator", footprint: rect(1, 1, 2, 2), interactive: true },
    { id: "lobby-reception-wall", kind: "executive_room", footprint: rect(6, 1, 8, 2), interactive: false },
    { id: "lobby-reception-desk", kind: "tenant_station", footprint: rect(8, 2, 3, 1), interactive: true },
    { id: "lobby-waiting-wall", kind: "executive_room", footprint: rect(16, 1, 9, 2), interactive: false },
    { id: "lobby-lounge", kind: "tenant_station", footprint: rect(17, 4, 5, 2), interactive: true },
    { id: "lobby-mail-services", kind: "tenant_station", footprint: rect(3, 4, 2, 1), interactive: true },
    { id: "lobby-directory", kind: "work_board", footprint: rect(5, 4, 4, 1), interactive: true },
    { id: "lobby-radio", kind: "radio", footprint: rect(11, 4, 1, 1), interactive: true },
    { id: "lobby-notice-board", kind: "tenant_station", footprint: rect(13, 4, 3, 1), interactive: true },
    { id: "lobby-stairs", kind: "stairs", footprint: rect(26, 13, 2, 2), interactive: true },
  ];
  return {
    floorType: "lobby",
    city,
    floorNumber: 1,
    cols: 30,
    rows: 18,
    spawn: { x: 4, y: 10 },
    upgrades: [],
    objects,
    collisionFootprints: objects.map((object) => object.footprint),
  };
}

const REC_STATIONS = [
  ["arcade", 4, 4, 2, 2], ["pool", 9, 4, 3, 2], ["air-hockey", 15, 4, 3, 2],
  ["foosball", 4, 9, 3, 2], ["shuffleboard", 10, 9, 3, 2],
  ["bowling", 16, 9, 3, 2], ["darts", 22, 4, 2, 2],
] as const;

/** Public, system-owned RECREATION floor. It has no lease, org, or purchase path. */
export function getRecreationPlan(city: ShadowTowerCity): ShadowTowerPlan {
  const objects = [
    { id: "rec-elevator", kind: "elevator" as const, footprint: rect(0, 0, 2, 2), interactive: true },
    { id: "rec-executive-room", kind: "executive_room" as const, footprint: rect(25, 1, 3, 1), interactive: false },
    { id: "rec-executive-desk", kind: "executive_desk" as const, footprint: rect(26, 2, 2, 1), interactive: false },
    { id: "rec-host", kind: "workstation" as const, footprint: rect(2, 14, 2, 1), interactive: false },
    ...REC_STATIONS.map(([id, x, y, cols, rows]) => ({
      id: `rec-${id}`, kind: "rec_station" as const, footprint: rect(x, y, cols, rows), interactive: true,
    })),
    { id: "rec-sponsor-wall", kind: "sponsor" as const, footprint: rect(4, 1, 8, 1), interactive: false },
    { id: "rec-bar", kind: "bar" as const, footprint: rect(14, 1, 5, 1), interactive: true },
    { id: "rec-vending", kind: "vending_machine" as const, footprint: rect(20, 1, 2, 1), interactive: true },
    { id: "rec-payphone", kind: "payphone" as const, footprint: rect(23, 1, 1, 1), interactive: true },
    { id: "rec-stairs", kind: "stairs" as const, footprint: rect(27, 14, 2, 2), interactive: true },
  ];
  const plan: ShadowTowerPlan = {
    floorType: "recreation", city, floorNumber: 1, cols: 30, rows: 18, spawn: { x: 2, y: 3 },
    upgrades: [], objects, collisionFootprints: objects.map((object) => object.footprint),
  };
  return plan;
}

/** Public floor 2: free computer access, a free work board, and office-wing doors. */
export function getMezzaninePlan(city: ShadowTowerCity): ShadowTowerPlan {
  const computers = workstationObjects(8).map((object, index) => ({
    ...object,
    id: `cafe-computer-${index + 1}`,
    footprint: rect(5 + (index % 4) * 4, 5 + Math.floor(index / 4) * 5, 2, 1),
  }));
  const objects: ShadowTowerPlan["objects"] = [
    { id: "mezzanine-elevator", kind: "elevator", footprint: rect(0, 0, 2, 2), interactive: true },
    { id: "cafe-counter-wall", kind: "executive_room", footprint: rect(19, 1, 6, 1), interactive: false },
    { id: "cafe-host", kind: "executive_desk", footprint: rect(21, 2, 2, 1), interactive: true },
    ...computers,
    { id: "world-work-board", kind: "work_board", footprint: rect(3, 1, 5, 1), interactive: true },
    { id: "public-atm", kind: "atm", footprint: rect(10, 1, 1, 1), interactive: true },
    { id: "cafe-vending", kind: "vending_machine", footprint: rect(15, 1, 2, 1), interactive: true },
    { id: "cafe-payphone", kind: "payphone", footprint: rect(12, 1, 1, 1), interactive: true },
    { id: "office-wing-door-west", kind: "secret_door", footprint: rect(0, 7, 1, 2), interactive: true },
    { id: "office-wing-door-east", kind: "secret_door", footprint: rect(25, 7, 1, 2), interactive: true },
    { id: "mezzanine-stairs", kind: "stairs", footprint: rect(23, 13, 2, 2), interactive: true },
  ];
  return {
    floorType: "mezzanine", city, floorNumber: 2, cols: 26, rows: 16,
    spawn: { x: 2, y: 3 }, upgrades: [], objects,
    collisionFootprints: objects.map((object) => object.footprint),
  };
}

/** Public floor 3: free supervised rest ward for stamina recovery. */
export function getRestFloorPlan(city: ShadowTowerCity): ShadowTowerPlan {
  const beds = Array.from({ length: 8 }, (_, index) => ({
    id: `rest-bed-${index + 1}`, kind: "bed" as const,
    footprint: rect(5 + (index % 4) * 4, 5 + Math.floor(index / 4) * 5, 2, 1), interactive: true,
  }));
  const objects: ShadowTowerPlan["objects"] = [
    { id: "rest-elevator", kind: "elevator", footprint: rect(0, 0, 2, 2), interactive: true },
    { id: "clinic-wall", kind: "executive_room", footprint: rect(18, 1, 7, 1), interactive: false },
    { id: "doctor", kind: "executive_desk", footprint: rect(22, 2, 2, 1), interactive: true },
    { id: "nurse-desk", kind: "workstation", footprint: rect(18, 3, 2, 1), interactive: true },
    { id: "nurse-station", kind: "nurse_station", footprint: rect(3, 1, 4, 1), interactive: true },
    { id: "doctor-station", kind: "doctor_station", footprint: rect(9, 1, 4, 1), interactive: true },
    { id: "rest-payphone", kind: "payphone", footprint: rect(14, 1, 1, 1), interactive: true },
    { id: "rest-stairs", kind: "stairs", footprint: rect(23, 13, 2, 2), interactive: true },
    ...beds,
  ];
  return {
    floorType: "rest", city, floorNumber: 3, cols: 26, rows: 16,
    spawn: { x: 2, y: 3 }, upgrades: [], objects,
    collisionFootprints: objects.map((object) => object.footprint),
  };
}

/** Public, system-owned floor 4: guards, custody, evidence, and a concealed route. */
export function getSecurityPlan(city: ShadowTowerCity): ShadowTowerPlan {
  const objects: ShadowTowerPlan["objects"] = [
    { id: "security-elevator", kind: "elevator", footprint: rect(0, 0, 2, 2), interactive: true },
    { id: "security-command", kind: "executive_room", footprint: rect(18, 1, 7, 1), interactive: false },
    { id: "security-chief", kind: "executive_desk", footprint: rect(21, 2, 2, 1), interactive: true },
    { id: "guard-desk", kind: "guard_station", footprint: rect(3, 1, 4, 1), interactive: true },
    { id: "debt-collector-desk", kind: "guard_station", footprint: rect(9, 1, 5, 1), interactive: true },
    { id: "holding-cell-a", kind: "holding_cell", footprint: rect(4, 6, 3, 3), interactive: true },
    { id: "holding-cell-b", kind: "holding_cell", footprint: rect(10, 6, 3, 3), interactive: true },
    { id: "evidence-lockup", kind: "evidence_lockup", footprint: rect(17, 6, 3, 2), interactive: true },
    { id: "black-market-window", kind: "black_market", footprint: rect(21, 10, 3, 2), interactive: true },
    { id: "secret-service-door", kind: "secret_door", footprint: rect(2, 13, 2, 1), interactive: true },
    { id: "security-payphone", kind: "payphone", footprint: rect(15, 1, 1, 1), interactive: true },
    { id: "security-workstation", kind: "workstation", footprint: rect(15, 12, 3, 1), interactive: false },
    { id: "security-stairs", kind: "stairs", footprint: rect(23, 13, 2, 2), interactive: true },
  ];
  return {
    floorType: "security", city, floorNumber: 4, cols: 26, rows: 16,
    spawn: { x: 2, y: 3 }, upgrades: [], objects,
    collisionFootprints: objects.map((object) => object.footprint),
  };
}

function occupiedCells(footprint: z.infer<typeof footprintSchema>) {
  const cells: string[] = [];
  for (let x = footprint.x; x < footprint.x + footprint.cols; x++) for (let y = footprint.y; y < footprint.y + footprint.rows; y++) cells.push(`${x},${y}`);
  return cells;
}

/** Rejects visual-only geometry, footprint drift, bad numbered identity, and unreachable interactions. */
export function validateShadowTowerPlan(value: unknown): { ok: true; plan: ShadowTowerPlan } | { ok: false; errors: string[] } {
  const parsed = shadowTowerPlanSchema.safeParse(value);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  const plan = parsed.data;
  const errors: string[] = [];
  const collisions = new Set(plan.collisionFootprints.flatMap(occupiedCells));
  const signatures = new Set(plan.collisionFootprints.map((f) => `${f.x}:${f.y}:${f.cols}:${f.rows}`));
  for (const object of plan.objects) {
    const fp = object.footprint;
    if (fp.x + fp.cols > plan.cols || fp.y + fp.rows > plan.rows) errors.push(`${object.id} footprint is outside floor`);
    if (!["elevator_hall", "office_unit"].includes(object.kind) && !signatures.has(`${fp.x}:${fp.y}:${fp.cols}:${fp.rows}`)) {
      errors.push(`${object.id} has no collision footprint`);
    }
  }
  if (plan.floorType === "lobby") {
    for (const kind of ["elevator", "stairs", "work_board"]) {
      if (plan.objects.filter((o) => o.kind === kind).length !== 1) errors.push(`lobby requires one ${kind}`);
    }
    if (plan.objects.some((o) => o.kind === "workstation" || o.kind === "terminal")) {
      errors.push("lobby must not contain computers");
    }
  } else if (plan.floorType === "recreation") {
    const requiredRec = ["elevator", "stairs", "vending_machine", "bar"];
    for (const kind of requiredRec) if (plan.objects.filter((o) => o.kind === kind).length !== 1) errors.push(`requires exactly one ${kind}`);
    if (plan.objects.filter((o) => o.kind === "rec_station").length !== 7) errors.push("requires exactly seven recreation stations");
  } else if (plan.floorType === "mezzanine") {
    if (plan.objects.filter((o) => o.kind === "workstation").length < 4) errors.push("mezzanine requires public computers");
    if (plan.objects.filter((o) => o.kind === "work_board").length !== 1) errors.push("mezzanine requires one work board");
    if (plan.objects.filter((o) => o.kind === "elevator").length !== 1) errors.push("mezzanine requires one elevator");
    if (plan.objects.filter((o) => o.kind === "stairs").length !== 1) errors.push("mezzanine requires one staircase");
  } else if (plan.floorType === "rest") {
    if (plan.objects.filter((o) => o.kind === "bed").length < 4) errors.push("rest floor requires beds");
    for (const kind of ["nurse_station", "doctor_station", "elevator", "stairs"]) if (plan.objects.filter((o) => o.kind === kind).length !== 1) errors.push(`rest floor requires one ${kind}`);
  } else if (plan.floorType === "security") {
    for (const kind of ["guard_station", "holding_cell", "evidence_lockup", "black_market", "secret_door", "elevator", "stairs"]) {
      if (plan.objects.filter((o) => o.kind === kind).length < 1) errors.push(`security floor requires ${kind}`);
    }
  } else {
    const required = ["elevator_hall", "atm", "vending_machine", "elevator", "stairs"];
    for (const kind of required) if (plan.objects.filter((o) => o.kind === kind).length !== 1) errors.push(`requires exactly one ${kind}`);
     const officeUnits = plan.objects.filter((o) => o.kind === "office_unit").length;
     if (officeUnits < 1 || officeUnits > 4) errors.push("office floor requires one to four physical office addresses");
     if (plan.objects.filter((o) => o.kind === "executive_desk").length !== 1) errors.push("office floor requires one executive desk");
     if (plan.objects.filter((o) => o.kind === "terminal").length < 1) errors.push("office floor requires one executive terminal");
  }
  // Flood-fill all free tiles from spawn; an interaction must have a free cardinal neighbour.
  const start = `${plan.spawn.x},${plan.spawn.y}`;
  if (collisions.has(start)) errors.push("spawn is blocked");
  const reachable = new Set<string>(collisions.has(start) ? [] : [start]);
  const queue = collisions.has(start) ? [] : [[plan.spawn.x, plan.spawn.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nx},${ny}`;
      if (nx >= 0 && ny >= 0 && nx < plan.cols && ny < plan.rows && !collisions.has(key) && !reachable.has(key)) { reachable.add(key); queue.push([nx, ny]); }
    }
  }
  for (const object of plan.objects.filter((o) => o.interactive)) {
    const fp = object.footprint;
    const neighbours = occupiedCells(fp).flatMap((cell) => { const [x, y] = cell.split(",").map(Number); return [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]; });
    if (!neighbours.some((cell) => reachable.has(cell))) errors.push(`${object.id} is not reachable`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, plan };
}

export function isSupportedShadowTowerUpgrade(value: unknown): value is ShadowTowerUpgrade {
  return typeof value === "string" && (SHADOW_TOWER_UPGRADES as readonly string[]).includes(value);
}

/** Server selection deliberately uses active eligible occupants, never a client tier claim. */
export function selectShadowTowerArchetype(activeHumans: number, activeBots: number): ShadowTowerArchetype {
  const occupants = Math.max(0, activeHumans) + Math.max(0, activeBots);
  return occupants > SHADOW_TOWER_LISTINGS.founder_team.capacity ? "company" : "founder_team";
}

export type ShadowTowerBotLike = { id: number; department?: string | null; collaborationRole?: string | null; permissions: readonly string[] };
export type ShadowTowerBotGroup = { purpose: string; permissionSignature: string; canonicalBotId: number; botIds: number[] };

/** Stable display grouping: canonical ID is always the lowest database bot ID. */
export function consolidateShadowTowerBots(bots: readonly ShadowTowerBotLike[]): ShadowTowerBotGroup[] {
  const groups = new Map<string, ShadowTowerBotGroup>();
  for (const bot of [...bots].sort((a, b) => a.id - b.id)) {
    const purpose = bot.department?.trim() || bot.collaborationRole?.trim() || "general";
    const permissionSignature = [...new Set(bot.permissions)].sort().join(",");
    const key = `${purpose}\u0000${permissionSignature}`;
    const group = groups.get(key);
    if (group) group.botIds.push(bot.id);
    else groups.set(key, { purpose, permissionSignature, canonicalBotId: bot.id, botIds: [bot.id] });
  }
  return [...groups.values()].sort((a, b) => a.canonicalBotId - b.canonicalBotId);
}

// ── Business fit-out stock bones ─────────────────────────────────────────────
// These are interior programs, not alternate floor geometry. Every fit-out keeps
// the authoritative Shadow Tower shell, spawn, elevator and collision contract;
// it assigns consistent zones/fixtures inside that shell.
export const BUSINESS_FLOOR_KINDS = ["office", "restaurant", "cafe", "mechanic", "retail", "clinic", "studio", "warehouse"] as const;
export type BusinessFloorKind = (typeof BUSINESS_FLOOR_KINDS)[number];
export type BusinessFloorLaborMode = "self" | "hire";
export type BusinessFloorZone = { id: string; label: string; purpose: string; minTiles: number };
export type BusinessFloorTemplate = {
  kind: BusinessFloorKind;
  label: string;
  description: string;
  baseMaterialsFiat: number;
  hiredLaborFiat: number;
  laborUnits: number;
  zones: readonly BusinessFloorZone[];
  requiredFixtures: readonly string[];
};

export const BUSINESS_FLOOR_TEMPLATES: Record<BusinessFloorKind, BusinessFloorTemplate> = {
  office: { kind: "office", label: "Professional Office", description: "Reception, team floor, meeting room and executive workspace.", baseMaterialsFiat: 18_000, hiredLaborFiat: 24_000, laborUnits: 12, zones: [{ id: "reception", label: "Reception", purpose: "arrival", minTiles: 12 }, { id: "team", label: "Team Floor", purpose: "work", minTiles: 36 }, { id: "meeting", label: "Meeting Room", purpose: "meetings", minTiles: 16 }, { id: "executive", label: "Executive Office", purpose: "management", minTiles: 14 }], requiredFixtures: ["reception_desk", "workstations", "meeting_table", "storage"] },
  restaurant: { kind: "restaurant", label: "Restaurant", description: "Guest dining, commercial kitchen, service pass, storage and wash station.", baseMaterialsFiat: 32_000, hiredLaborFiat: 48_000, laborUnits: 24, zones: [{ id: "entry", label: "Host + Entry", purpose: "arrival", minTiles: 10 }, { id: "dining", label: "Dining Room", purpose: "service", minTiles: 42 }, { id: "kitchen", label: "Commercial Kitchen", purpose: "production", minTiles: 28 }, { id: "storage", label: "Cold + Dry Storage", purpose: "inventory", minTiles: 12 }, { id: "wash", label: "Wash Station", purpose: "sanitation", minTiles: 10 }], requiredFixtures: ["host_stand", "dining_sets", "cookline", "service_pass", "cold_storage", "wash_sink"] },
  cafe: { kind: "cafe", label: "Cafe", description: "Counter service, compact prep, public seating and pickup flow.", baseMaterialsFiat: 22_000, hiredLaborFiat: 30_000, laborUnits: 16, zones: [{ id: "counter", label: "Order Counter", purpose: "service", minTiles: 16 }, { id: "prep", label: "Prep Bar", purpose: "production", minTiles: 16 }, { id: "seating", label: "Cafe Seating", purpose: "guest", minTiles: 30 }, { id: "pickup", label: "Pickup", purpose: "circulation", minTiles: 8 }], requiredFixtures: ["counter", "espresso_bar", "display_case", "tables", "dish_sink"] },
  mechanic: { kind: "mechanic", label: "Mechanic Shop", description: "Vehicle bays, lift clearance, parts cage, tool wall and customer desk.", baseMaterialsFiat: 38_000, hiredLaborFiat: 52_000, laborUnits: 28, zones: [{ id: "reception", label: "Service Desk", purpose: "arrival", minTiles: 12 }, { id: "bays", label: "Repair Bays", purpose: "service", minTiles: 52 }, { id: "parts", label: "Parts Cage", purpose: "inventory", minTiles: 16 }, { id: "tools", label: "Tool + Fabrication", purpose: "production", minTiles: 20 }], requiredFixtures: ["service_desk", "vehicle_lifts", "tool_wall", "parts_racks", "compressor", "wash_bay"] },
  retail: { kind: "retail", label: "Retail Shop", description: "Customer floor, secure checkout, stock room and receiving.", baseMaterialsFiat: 20_000, hiredLaborFiat: 28_000, laborUnits: 14, zones: [{ id: "sales", label: "Sales Floor", purpose: "service", minTiles: 44 }, { id: "checkout", label: "Checkout", purpose: "payment", minTiles: 10 }, { id: "stock", label: "Stock Room", purpose: "inventory", minTiles: 18 }, { id: "receiving", label: "Receiving", purpose: "logistics", minTiles: 10 }], requiredFixtures: ["display_units", "checkout", "security_gate", "stock_racks"] },
  clinic: { kind: "clinic", label: "Clinic", description: "Reception, exam rooms, treatment bay, pharmacy and clean storage.", baseMaterialsFiat: 42_000, hiredLaborFiat: 58_000, laborUnits: 30, zones: [{ id: "reception", label: "Reception", purpose: "arrival", minTiles: 14 }, { id: "exam", label: "Exam Rooms", purpose: "care", minTiles: 32 }, { id: "treatment", label: "Treatment Bay", purpose: "care", minTiles: 24 }, { id: "pharmacy", label: "Pharmacy", purpose: "inventory", minTiles: 12 }, { id: "clean", label: "Clean Storage", purpose: "sanitation", minTiles: 10 }], requiredFixtures: ["reception_desk", "exam_beds", "medical_storage", "wash_station", "pharmacy_cabinet"] },
  studio: { kind: "studio", label: "Creative Studio", description: "Production stage, editing suite, workshop and client review area.", baseMaterialsFiat: 26_000, hiredLaborFiat: 36_000, laborUnits: 20, zones: [{ id: "production", label: "Production Floor", purpose: "creation", minTiles: 42 }, { id: "edit", label: "Edit Suite", purpose: "post", minTiles: 16 }, { id: "workshop", label: "Workshop", purpose: "fabrication", minTiles: 18 }, { id: "review", label: "Client Review", purpose: "service", minTiles: 14 }], requiredFixtures: ["production_rig", "edit_desks", "equipment_storage", "review_screen"] },
  warehouse: { kind: "warehouse", label: "Warehouse + Logistics", description: "Receiving, pallet storage, packing, dispatch and maintenance lanes.", baseMaterialsFiat: 30_000, hiredLaborFiat: 44_000, laborUnits: 24, zones: [{ id: "receiving", label: "Receiving", purpose: "logistics", minTiles: 24 }, { id: "storage", label: "Pallet Storage", purpose: "inventory", minTiles: 54 }, { id: "packing", label: "Packing", purpose: "production", minTiles: 22 }, { id: "dispatch", label: "Dispatch", purpose: "logistics", minTiles: 20 }], requiredFixtures: ["loading_dock", "pallet_racks", "packing_benches", "dispatch_board", "maintenance_cage"] },
};

export function resolveBusinessFloorKind(industry: unknown): BusinessFloorKind {
  const value = String(industry ?? "").toLowerCase();
  if (/restaurant|food|hospitality|dining/.test(value)) return "restaurant";
  if (/cafe|coffee|bakery/.test(value)) return "cafe";
  if (/mechanic|automotive|transportation|repair/.test(value)) return "mechanic";
  if (/medical|health|clinic|pharma/.test(value)) return "clinic";
  if (/creative|media|design|photo|film|music/.test(value)) return "studio";
  if (/warehouse|logistics|supply|manufactur/.test(value)) return "warehouse";
  if (/retail|store|shop|sales/.test(value)) return "retail";
  return "office";
}

export function quoteBusinessFitout(kind: BusinessFloorKind, laborMode: BusinessFloorLaborMode, optionCount: number) {
  const template = BUSINESS_FLOOR_TEMPLATES[kind];
  const customizationFiat = Math.max(0, Math.min(6, Math.trunc(optionCount))) * 2_500;
  const laborFiat = laborMode === "hire" ? template.hiredLaborFiat : 0;
  return { materialsFiat: template.baseMaterialsFiat + customizationFiat, laborFiat, totalFiat: template.baseMaterialsFiat + customizationFiat + laborFiat, laborUnits: laborMode === "self" ? template.laborUnits : 0 };
}

export type ShadowTowerTenantResident = {
  id: number;
  name: string;
  role: string;
  color: string;
  logo: string;
  col: number;
  row: number;
  path: readonly { col: number; row: number }[];
  speed: number;
};

export type ShadowTowerCommercialTenant = {
  business: TowerInfrastructureBusiness;
  businessKey: string;
  floorNumber: number;
  unitNumber: number;
  fitoutKind: BusinessFloorKind;
  fitout: BusinessFloorTemplate;
  resident: ShadowTowerTenantResident;
  service: {
    label: string;
    description: string;
    settlementPath: "/business/services";
  };
  conversation: TowerBusinessConversation;
};

function businessFloorNumber(business: TowerInfrastructureBusiness) {
  const match = business.floor.match(/\bFLOOR\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * The infrastructure catalog is the source for the Tower's permanent
 * commercial tenants. Lobby, public-floor, every-floor, and withheld
 * businesses are services, not a fabricated commercial address.
 */
export function getShadowTowerCommercialTenants(floorNumber: number): ShadowTowerCommercialTenant[] {
  if (!isCommercialShadowTowerFloor(floorNumber)) return [];
  const businesses = TOWER_INFRASTRUCTURE_BUSINESSES.filter((business) =>
    business.coverage === "single_suite" && businessFloorNumber(business) === floorNumber,
  );
  return businesses.map((business, index) => {
    const unitNumber = index + 1;
    const unitCol = 5 + (unitNumber - 1) * 12;
    const residentId = 1400 + TOWER_INFRASTRUCTURE_BUSINESSES.indexOf(business);
    const residentName = `${business.name} OPERATOR`;
    return {
      business,
      businessKey: business.key,
      floorNumber,
      unitNumber,
      fitoutKind: resolveBusinessFloorKind(business.category),
      fitout: BUSINESS_FLOOR_TEMPLATES[resolveBusinessFloorKind(business.category)],
      resident: {
        id: residentId,
        name: residentName,
        role: `${business.category.toUpperCase()} · ${business.operatorCode}`,
        color: business.color,
        logo: business.logo,
        col: unitCol,
        row: 8,
        path: [
          { col: unitCol, row: 8 },
          { col: Math.min(unitCol + 3, 26), row: 8 },
          { col: Math.min(unitCol + 3, 26), row: 12 },
          { col: unitCol, row: 12 },
        ],
        speed: 0.12 + (residentId % 7) * 0.025,
      },
      service: {
        label: business.service,
        description: business.ad,
        settlementPath: "/business/services",
      },
      conversation: getTowerBusinessConversation(business)!,
    };
  });
}

/**
 * Resolve only businesses with a real, fixed commercial suite into a service
 * scope. Lobby/every-floor catalog entries have no tenant station and must not
 * manufacture a service board view.
 */
export function getShadowTowerServiceTenant(businessKey: string): ShadowTowerCommercialTenant | null {
  const business = TOWER_INFRASTRUCTURE_BUSINESSES.find((candidate) => candidate.key === businessKey);
  if (!business || business.coverage !== "single_suite") return null;
  const placement = getTowerBusinessPlacement(business);
  if (placement?.floorNumber == null || placement.unitNumber == null) return null;
  return getShadowTowerCommercialTenants(placement.floorNumber)
    .find((tenant) => tenant.businessKey === business.key) ?? null;
}

export type ShadowTowerCommercialFloor = {
  floorNumber: number;
  tenants: ShadowTowerCommercialTenant[];
  status: "occupied" | "vacant";
};

export function getShadowTowerCommercialFloor(floorNumber: number): ShadowTowerCommercialFloor {
  const tenants = getShadowTowerCommercialTenants(floorNumber);
  return { floorNumber, tenants, status: tenants.length ? "occupied" : "vacant" };
}

/**
 * Project a tenant's fit-out into the same serialized plan as the shell.
 * The client and server can opt into the same business keys; no renderer may
 * add a station without a matching collision footprint.
 */
export function withShadowTowerTenantFitout(
  plan: ShadowTowerPlan,
  businessKeys: readonly string[],
): ShadowTowerPlan {
  const tenants = businessKeys.flatMap((businessKey) =>
    getShadowTowerCommercialTenants(plan.floorNumber).filter((tenant) => tenant.businessKey === businessKey),
  );
  if (!tenants.length || plan.floorType !== "office") return plan;
  const officeUnits = plan.objects.filter((object) => object.kind === "office_unit").sort((a, b) => a.id.localeCompare(b.id));
  const tenantObjects = tenants.map((tenant) => {
    const suite = officeUnits[tenant.unitNumber - 1] ?? officeUnits[0];
    const x = Math.max(4, Math.min(plan.cols - 3, (suite?.footprint.x ?? 5) + 2));
    const y = Math.max(9, Math.min(plan.rows - 3, plan.rows - 5));
    return {
      id: `tenant-service-${tenant.businessKey}`,
      kind: "tenant_station" as const,
      businessKey: tenant.businessKey,
      zoneId: tenant.fitout.zones[0]?.id ?? "service",
      label: tenant.business.name,
      footprint: rect(x, y, 2, 1),
      interactive: true,
    };
  });
  return {
    ...plan,
    objects: [...plan.objects, ...tenantObjects],
    collisionFootprints: [...plan.collisionFootprints, ...tenantObjects.map((object) => object.footprint)],
  };
}