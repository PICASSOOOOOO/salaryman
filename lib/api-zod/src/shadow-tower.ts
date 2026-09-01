import { z } from "zod";

/** The only purchasable Shadow Tower floor plans. */
export const SHADOW_TOWER_ARCHETYPES = ["founder_team", "company"] as const;
export type ShadowTowerArchetype = (typeof SHADOW_TOWER_ARCHETYPES)[number];
export const SHADOW_TOWER_CITIES = ["minx_city", "huda_city"] as const;
export type ShadowTowerCity = (typeof SHADOW_TOWER_CITIES)[number];
export const SHADOW_TOWER_UPGRADES = ["secure_access", "extra_workstations", "operations_terminal"] as const;
export type ShadowTowerUpgrade = (typeof SHADOW_TOWER_UPGRADES)[number];
export const SHADOW_TOWER_FLOOR_TYPES = ["office", "recreation"] as const;
export type ShadowTowerFloorType = (typeof SHADOW_TOWER_FLOOR_TYPES)[number];

const pointSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict();
const footprintSchema = z.object({
  x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
  cols: z.number().int().positive(), rows: z.number().int().positive(),
}).strict();
export const shadowTowerObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["executive_room", "executive_desk", "workstation", "terminal", "atm", "vending_machine", "elevator", "rec_station", "sponsor", "bar"]),
  footprint: footprintSchema,
  interactive: z.boolean(),
}).strict();

export const shadowTowerPlanSchema = z.object({
  floorType: z.enum(SHADOW_TOWER_FLOOR_TYPES).default("office"),
  city: z.enum(SHADOW_TOWER_CITIES),
  floorNumber: z.number().int().min(1).max(120),
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

function rect(x: number, y: number, cols: number, rows: number) { return { x, y, cols, rows }; }
function workstationObjects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `workstation-${index + 1}`, kind: "workstation" as const,
    footprint: rect(5 + (index % 5) * 3, 5 + Math.floor(index / 5) * 2, 2, 1), interactive: true,
  }));
}

/** Authoritative, serialized floor geometry; clients must not add visual-only objects. */
export function getShadowTowerPlan(city: ShadowTowerCity, floorNumber: number, archetype: ShadowTowerArchetype, upgrades: readonly string[] = []): ShadowTowerPlan {
  const listing = SHADOW_TOWER_LISTINGS[archetype];
  const enabledUpgrades = upgrades.filter(isSupportedShadowTowerUpgrade);
  const workstationCount = listing.capacity + (enabledUpgrades.includes("extra_workstations") ? 4 : 0);
  const plan: ShadowTowerPlan = {
    floorType: "office", city, floorNumber, cols: 22, rows: archetype === "company" ? 16 : 12, spawn: { x: 2, y: 2 },
    objects: [
      { id: "elevator", kind: "elevator", footprint: rect(0, 0, 2, 2), interactive: true },
      // The room's south wall is collidable; its desk remains approachable from the open interior.
      { id: "executive-room", kind: "executive_room", footprint: rect(16, 1, 5, 1), interactive: false },
      { id: "executive-desk", kind: "executive_desk", footprint: rect(18, 2, 2, 1), interactive: true },
      ...workstationObjects(workstationCount),
      { id: "terminal", kind: "terminal", footprint: rect(2, 8, 1, 1), interactive: true },
      ...(enabledUpgrades.includes("operations_terminal") ? [{ id: "operations-terminal", kind: "terminal" as const, footprint: rect(2, 6, 1, 1), interactive: true }] : []),
      { id: "atm", kind: "atm", footprint: rect(2, 10, 1, 1), interactive: true },
      { id: "vending", kind: "vending_machine", footprint: rect(20, 8, 1, 1), interactive: true },
    ],
    upgrades: enabledUpgrades, collisionFootprints: [],
  };
  plan.collisionFootprints = plan.objects.map((object) => object.footprint);
  return plan;
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
  ];
  const plan: ShadowTowerPlan = {
    floorType: "recreation", city, floorNumber: 1, cols: 30, rows: 18, spawn: { x: 2, y: 3 },
    upgrades: [], objects, collisionFootprints: objects.map((object) => object.footprint),
  };
  return plan;
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
    if (!signatures.has(`${fp.x}:${fp.y}:${fp.cols}:${fp.rows}`)) errors.push(`${object.id} has no collision footprint`);
  }
  if (plan.floorType === "recreation") {
    const requiredRec = ["elevator", "vending_machine", "bar"];
    for (const kind of requiredRec) if (plan.objects.filter((o) => o.kind === kind).length !== 1) errors.push(`requires exactly one ${kind}`);
    if (plan.objects.filter((o) => o.kind === "rec_station").length !== 7) errors.push("requires exactly seven recreation stations");
  } else {
    const required = ["executive_room", "executive_desk", "atm", "vending_machine", "elevator"];
    for (const kind of required) if (plan.objects.filter((o) => o.kind === kind).length !== 1) errors.push(`requires exactly one ${kind}`);
    if (plan.objects.filter((o) => o.kind === "terminal").length < 1) errors.push("requires one usable terminal");
    if (plan.objects.filter((o) => o.kind === "workstation").length < 1) errors.push("requires workstations");
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