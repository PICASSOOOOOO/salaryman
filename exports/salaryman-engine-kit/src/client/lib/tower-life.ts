import {
  getShadowTowerCommercialTenants,
  getTowerBusinessPlacement,
  TOWER_INFRASTRUCTURE_BUSINESSES,
  type ShadowTowerCommercialTenant,
} from "@workspace/api-zod";

export type TowerNpc = {
  code: string;
  name: string;
  role: string;
  color: string;
  logo: string;
  route: string;
  caresFor: string;
  errands: string[];
};

export type TowerBusiness = {
  key: string;
  code: string;
  ticker: string;
  name: string;
  category: string;
  color: string;
  logo: string;
  floor: string;
  coverage: "single_suite" | "lobby" | "every_floor";
  floorNumber: number | null;
  unitNumber: number | null;
  exitPriority: number | null;
  operatorCode: string;
  ad: string;
  appointment: string;
  playerService: string;
  playerJob: string;
  rewardFiat: number;
  storyHook: string;
  artDirection: string;
};

type TowerBusinessOperation = Pick<TowerBusiness, "playerService" | "playerJob" | "rewardFiat" | "storyHook" | "artDirection">;

const operation = (
  playerService: string,
  playerJob: string,
  rewardFiat: number,
  storyHook: string,
  artDirection: string,
): TowerBusinessOperation => ({ playerService, playerJob, rewardFiat, storyHook, artDirection });

/** The catalog's business listings are also playable contracts, not just lore. */
const TOWER_BUSINESS_OPERATIONS: Record<string, TowerBusinessOperation> = {
  shadow_cafeteria: operation("Order a shift tray or deliver a late meal.", "Tray runner · load and deliver staff meals", 18, "A missing tray exposes who is quietly working unpaid night shifts.", "Warm stainless counter, amber heat lamps, stacked numbered trays."),
  lobby_gift_shop: operation("Buy a visitor gift, card, or apology delivery.", "Gift courier · assemble a floor-specific order", 14, "A gift arrives with a message that changes a tenant introduction.", "Black-glass vitrine, pressed flowers, receipt printer, soft rose light."),
  tower_vending: operation("Buy food, water, batteries, and low-cost work supplies.", "Route restocker · service vending bays between floors", 22, "A vending route reveals which floor is running out of power.", "Service nook with lit coils, access panel, and a rolling stock cart."),
  tower_atm: operation("Access FIAT and account services at the lift bank.", "Cash-route auditor · reconcile a machine exception", 28, "A balance mismatch points to a tenant being charged twice.", "Green-lit brass ATM wall with paper audit slips and a camera eye."),
  tower_restaurant: operation("Book a private table or corporate dinner.", "Reservation fixer · recover a canceled executive table", 36, "A dinner reservation becomes a quiet negotiation between floors.", "Rain-dark dining room, narrow lamps, mirrored service hatch."),
  tower_clinic: operation("Get triage, diagnostics, and observation care.", "Care runner · deliver a sealed diagnostic kit", 26, "A diagnostic result proves a service bot is not malfunctioning.", "Clean care bay, cyan monitors, privacy curtains, practical clutter."),
  tower_doctor: operation("Book primary care or an executive physical.", "Patient coordinator · fill a same-day appointment gap", 24, "A routine physical uncovers a worker being pushed past safe limits.", "Quiet walnut consultation room, city glass, one precise exam light."),
  tower_dentist: operation("Book human dental care or replicant jaw service.", "Sterilizer tech · reopen a canceled clinic slot", 20, "A damaged replicant plate carries evidence from another floor.", "Violet dental chair, chrome instruments, tiny diagnostic display."),
  tower_law: operation("Get tenancy, licensing, contract, or defense counsel.", "Filing runner · assemble an evidence-backed contract packet", 42, "A lease clause decides who owns a neglected service corridor.", "Tall legal shelves, redline glass, sealed folders, severe task light."),
  tower_weapons_licensing: operation("Apply for fictional civic licensing and storage compliance.", "Compliance clerk · verify a permit trail", 44, "A missing signature turns a legal armory into a political fault line.", "Security desk, lock drawers, permit scanner, warning stripes."),
  tower_black_market: operation("Request a restricted fictional inventory appointment.", "Discreet broker · move a sealed parcel to the appointment point", 60, "A rare item comes with a name the Tower tried to erase.", "Unmarked service room, red slit light, velvet cases, hidden pass-through."),
  tower_stock_broker: operation("Execute Tower securities trades and research.", "Market board runner · verify a quote packet before open", 48, "A suspicious bid reveals a floor being quietly accumulated.", "Exchange gallery, green ticker glass, brass rails, layered paper charts."),
  tower_import_export: operation("Arrange freight, customs, sourcing, and export desks.", "Manifest checker · clear a delayed shipment", 34, "One container is labeled for a floor that officially does not exist.", "Blue logistics cage, cargo tags, lift manifest wall, rolling pallets."),
  tower_mineral_rights: operation("File claims, leases, surveys, and royalty administration.", "Survey aide · compare a claim map with the registry", 40, "The useful part of a Tower-owned parcel is under someone else's story.", "Stone sample drawers, topographic light table, dusty survey instruments."),
  tower_gold_exchange: operation("Exchange in-game GOLD and arrange secure custody.", "Assay runner · carry a sealed weight record", 46, "An assay disagrees with the owner's wealth story.", "Gold counter, assay lamps, dark velvet, heavy numbered vault door."),
  tower_jeweler: operation("Commission, repair, appraise, or collect jewelry.", "Atelier assistant · locate a repair and return it upstairs", 30, "A repaired piece becomes proof of an old promise.", "Cool atelier glass, gem trays, focused bench lights, fine tools."),
  tower_terminal_repair: operation("Repair terminals, computers, lifts, and replicants.", "Diagnostic runner · recover and return a damaged terminal", 32, "A broken terminal contains an instruction someone meant to delete.", "Copper service bay, hanging cables, parts drawers, amber diagnostic glow."),
  tower_realty: operation("Rent, buy, list, lease, and inspect Tower property.", "Floor scout · verify a vacant suite before a showing", 38, "A vacant floor has fresh power use and an old tenant's key.", "Reception annex, vertical blueprints, brass keys, lit model tower."),
  tower_massage: operation("Book massage, recovery, and ergonomic care.", "Recovery aide · reset a room between shift appointments", 16, "A regular's pain tells the truth about a workplace.", "Soft green circuit motifs, low lamps, linen screens, quiet water wall."),
  tower_pharmacy: operation("Fill prescriptions and buy first-aid supplies.", "Night dispenser · reconcile a medicine cabinet count", 24, "A shortage connects three apparently unrelated work accidents.", "Backlit drawers, cyan labels, rolling ladder, after-hours hatch."),
  tower_childcare: operation("Arrange childcare, tutoring, and shift coverage.", "Shift helper · deliver a lesson kit and cover a handoff", 18, "A child's drawing maps the Tower's hidden service elevators.", "Sun-yellow family room, modular tables, lesson screens, soft flooring."),
  tower_laundry: operation("Send uniforms, linens, and workwear through the wash.", "Laundry route · return a clean uniform before shift change", 15, "A pocket left in a uniform changes a resident's loyalties.", "Blue service corridor, rolling hampers, steam, tagged garment rail."),
  tower_tailor: operation("Alter uniforms, suits, and repaired workwear.", "Fitting runner · deliver measurements between the lobby and atelier", 17, "A tailored insignia identifies a group that claims not to exist.", "Sharp red seam lights, mannequins, chalk marks, brass scissors."),
  tower_courier: operation("Move documents and parcels between the lobby and floors.", "Liftline runner · collect a signature at two destinations", 25, "A delivery route turns into a map of who still talks to whom.", "Cyan delivery desk, parcel cages, lift tags, handheld scanner."),
  tower_security: operation("Request access, response, escort, and evidence handling.", "Floor escort · walk a contractor through a safe route", 35, "A routine escort finds a door that is not on the public directory.", "Red operations wall, camera feeds, evidence seals, hard bench."),
  tower_insurance: operation("Cover property, health, liability, and cargo risks.", "Claims aide · document a real loss without inflating it", 29, "A denied claim reveals the Tower's risk model is political.", "Indigo risk office, incident boards, stamped forms, rain-lit windows."),
  tower_print: operation("Print notices, ads, signage, menus, and classifieds.", "Press runner · proof and post a floor notice", 19, "A correction printed overnight names the wrong owner on purpose.", "Magenta press room, paper stacks, ink rollers, glowing layout table."),
  tower_sanitation: operation("Request cleaning, waste, and environmental service.", "Night crew · clear a blocked operations route", 21, "A discarded component proves a business is hiding its labor cost.", "Teal utility closets, carts, drain grates, reflective safety tape."),
  tower_florist: operation("Send flowers, plants, and office arrangements upstairs.", "Plant runner · deliver and place a floor arrangement", 13, "A condolence order becomes an invitation to a forbidden floor.", "Black glass, pink petals, grow lamps, clipped stems in metal tubs."),
  tower_accounting: operation("Reconcile books, payroll, tax filings, and invoices.", "Ledger clerk · match a receipt to its actual service", 33, "A clean ledger makes one worker's missing pay impossible to ignore.", "Green accounting suite, receipt walls, calculator glow, archive drawers."),
};

export const TOWER_NPCS: TowerNpc[] = [
  {
    code: "CLAW-PRIME-01",
    name: "CLAW PRIME",
    role: "RECEPTION · BUILDING OPERATIONS",
    color: "#67e8f9",
    logo: "✦",
    route: "LOBBY → EVERY FLOOR",
    caresFor: "access, tenants, deliveries, and the building’s daily rhythm",
    errands: ["checking lift permissions", "welcoming a new operator", "routing a buyer to Realty"],
  },
  {
    code: "FINANCE-TRACKER-02",
    name: "FINANCE TRACKER",
    role: "FILINGS · COMMERCE DESK",
    color: "#86efac",
    logo: "▣",
    route: "LOBBY → REGISTRY → BANK",
    caresFor: "appointments, rent records, payroll, and honest settlement",
    errands: ["reconciling a rent filing", "posting a payroll notice", "finding a missing invoice"],
  },
  {
    code: "MILA-LIAISON-03",
    name: "MILA",
    role: "SHADOW LIAISON · TENANT CARE",
    color: "#c4b5fd",
    logo: "◇",
    route: "FLOOR 66 → PUBLIC FLOORS",
    caresFor: "tenant fit, quiet escalations, and who needs an introduction",
    errands: ["checking a new lease", "leaving a discreet referral", "asking a tenant how work is going"],
  },
  {
    code: "DR-VALE-04",
    name: "DR. NOOR VALE",
    role: "LUMEN CARE · DOCTOR",
    color: "#7dd3fc",
    logo: "✚",
    route: "FLOOR 3 · CLINIC ROOM",
    caresFor: "one calm medical room, practical appointments, and tired workers",
    errands: ["checking the observation room", "calling the next patient", "restocking a med kit"],
  },
  {
    code: "BYTE-DENT-05",
    name: "DR. KIRA BYTE",
    role: "BITE//BYTE · DENTIST",
    color: "#f9a8d4",
    logo: "◈",
    route: "FLOOR 3 · SUITE 3B",
    caresFor: "replicant teeth, human smiles, and appointments that start on time",
    errands: ["opening the sterilizer", "posting a cancellation", "walking a patient back upstairs"],
  },
  {
    code: "MENDER-9-06",
    name: "MENDER-9",
    role: "MENDER-9 · REPLICANT MECHANIC",
    color: "#fbbf24",
    logo: "⚙",
    route: "FLOOR 4 · SERVICE BAY",
    caresFor: "lifts, terminals, service bots, and anything that hums wrong",
    errands: ["calibrating an elevator", "collecting a damaged terminal", "delivering a repaired service bot"],
  },
];

export const TOWER_BUSINESSES: TowerBusiness[] = TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => ({
  ...(() => {
    const placement = getTowerBusinessPlacement(business);
    return {
      floorNumber: placement?.floorNumber ?? null,
      unitNumber: placement?.unitNumber ?? null,
      exitPriority: placement?.exitPriority ?? null,
    };
  })(),
  key: business.key,
  code: business.code,
  ticker: business.ticker,
  name: business.name,
  category: `${business.category.toUpperCase()} · ${business.ticker}`,
  color: business.color,
  logo: business.logo,
  floor: business.floor,
  coverage: business.coverage,
  operatorCode: business.operatorCode,
  ad: business.ad,
  appointment: business.service,
  ...(TOWER_BUSINESS_OPERATIONS[business.key] ?? operation(
    business.service,
    "Tower operations assistant · follow a resident's work order",
    20,
    "A routine work order reveals how the Tower's businesses depend on one another.",
    "A distinct branded service suite with visible tools and an active work counter.",
  )),
}));

export type TowerFloor = "lobby" | number;

export type TowerOperatorDialogue = {
  residentName: string;
  businessName: string;
  role: string;
  service: string;
  offer: string;
  lines: readonly [string, string, string];
};
export type TowerResident = {
  id: number;
  name: string;
  role: string;
  color: string;
  logo: string;
  floor: TowerFloor;
  /** Floors this resident can be encountered on while carrying out service work. */
  serviceFloors?: readonly TowerFloor[];
  businessCode: string;
  route: string;
  caresFor: string;
  errands: string[];
  col: number;
  row: number;
  path: readonly { col: number; row: number }[];
  speed: number;
};

// These operators are physical residents, not a replacement for player-owned
// organizations. Each keeps one service or one part of the Tower working.
export const TOWER_RESIDENTS: readonly TowerResident[] = [
  {
    id: 501, name: "CLAW PRIME", role: "RECEPTION · BUILDING OPERATIONS", color: "#67e8f9", logo: "✦",
    floor: "lobby", businessCode: "TWR-PROP-018", route: "LOBBY → EVERY FLOOR",
    caresFor: "access, tenants, deliveries, and the building’s daily rhythm",
    errands: ["checking lift permissions", "welcoming a new operator", "routing a buyer to Realty"],
    col: 5, row: 8, path: [{ col: 5, row: 8 }, { col: 8, row: 8 }, { col: 10, row: 11 }, { col: 7, row: 12 }], speed: 0.18,
  },
  {
    id: 502, name: "FINANCE TRACKER", role: "LEDGER AFTER DARK · ACCOUNTANT", color: "#86efac", logo: "▣",
    floor: "lobby", businessCode: "TWR-FIN-030", route: "LOBBY → REGISTRY → BANK",
    caresFor: "rent records, payroll, appointments, and honest settlement",
    errands: ["reconciling a rent filing", "posting a payroll notice", "finding a missing invoice"],
    col: 8, row: 6, path: [{ col: 8, row: 6 }, { col: 13, row: 6 }, { col: 14, row: 10 }, { col: 10, row: 10 }], speed: 0.22,
  },
  {
    id: 503, name: "ADA BLOM", role: "BLACK GLASS FLORIST · OWNER", color: "#fda4af", logo: "❖",
    floor: "lobby", businessCode: "TWR-LIFE-029", route: "LOBBY · GIFT ARCADE",
    caresFor: "office plants, gift orders, and messages delivered upstairs",
    errands: ["assembling a condolence order", "checking the lobby plants", "sending flowers to Floor 66"],
    col: 12, row: 12, path: [{ col: 12, row: 12 }, { col: 16, row: 12 }, { col: 16, row: 15 }, { col: 12, row: 15 }], speed: 0.16,
  },
  {
    id: 504, name: "RIO LIFT", role: "LIFTLINE COURIER · RUNNER", color: "#22d3ee", logo: "↑",
    floor: "lobby", businessCode: "TWR-LOGI-024", route: "LOBBY → DELIVERY DESK → FLOORS",
    caresFor: "documents, parcels, and signatures that cannot wait",
    errands: ["collecting a sealed parcel", "running a contract upstairs", "checking a delivery signature"],
    col: 15, row: 8, path: [{ col: 15, row: 8 }, { col: 18, row: 8 }, { col: 18, row: 12 }, { col: 14, row: 12 }], speed: 0.28,
  },
  {
    id: 505, name: "THEO TABLE", role: "COMMON TABLE 67 · SHIFT STEWARD", color: "#fbbf24", logo: "▤",
    floor: 2, businessCode: "TWR-FOOD-001", route: "FLOOR 2 · PUBLIC COMMONS",
    caresFor: "meals, staff catering, and workers who forgot to eat",
    errands: ["loading the breakfast line", "counting shift trays", "delivering a late meal"],
    col: 5, row: 7, path: [{ col: 5, row: 7 }, { col: 10, row: 7 }, { col: 13, row: 11 }, { col: 8, row: 13 }], speed: 0.2,
  },
  {
    id: 506, name: "JUN PANTRY", role: "NIGHT PANTRY NETWORK · ROUTE OPERATOR", color: "#67e8f9", logo: "▦",
    floor: 2, businessCode: "TWR-UTILITY-003", route: "FLOOR 2 → EVERY SERVICE NOOK",
    caresFor: "water, batteries, consumables, and the next shift’s small mercies",
    errands: ["restocking a vending bay", "checking battery inventory", "taking a route request"],
    col: 13, row: 8, path: [{ col: 13, row: 8 }, { col: 17, row: 8 }, { col: 17, row: 13 }, { col: 13, row: 13 }], speed: 0.24,
  },
  {
    id: 507, name: "DR. NOOR VALE", role: "VALE PRIVATE MEDICINE · DOCTOR", color: "#93c5fd", logo: "+",
    floor: 3, businessCode: "TWR-CARE-007", route: "FLOOR 3 · SUITE 18A",
    caresFor: "tired workers, practical appointments, and quiet recovery",
    errands: ["checking the observation room", "calling the next patient", "restocking a med kit"],
    col: 6, row: 8, path: [{ col: 6, row: 8 }, { col: 10, row: 8 }, { col: 12, row: 12 }, { col: 8, row: 13 }], speed: 0.14,
  },
  {
    id: 508, name: "DR. KIRA BYTE", role: "BITE//BYTE DENTAL · DENTIST", color: "#f0abfc", logo: "◈",
    floor: 3, businessCode: "TWR-CARE-008", route: "FLOOR 3 · SUITE 18B",
    caresFor: "replicant teeth, human smiles, and appointments that start on time",
    errands: ["opening the sterilizer", "posting a cancellation", "walking a patient back upstairs"],
    col: 13, row: 10, path: [{ col: 13, row: 10 }, { col: 17, row: 10 }, { col: 17, row: 14 }, { col: 13, row: 14 }], speed: 0.15,
  },
  {
    id: 509, name: "MENDER-9", role: "MENDER-9 TERMINAL WORKS · MECHANIC", color: "#fbbf24", logo: "⚙",
    floor: 4, serviceFloors: ["lobby", 2, 3, 4], businessCode: "TWR-TECH-017", route: "FLOOR 4 · SERVICE BAY → EVERY FLOOR",
    caresFor: "lifts, terminals, service bots, and anything that hums wrong",
    errands: ["calibrating an elevator", "collecting a damaged terminal", "delivering a repaired service bot"],
    col: 7, row: 8, path: [{ col: 7, row: 8 }, { col: 12, row: 8 }, { col: 15, row: 12 }, { col: 10, row: 14 }], speed: 0.26,
  },
  {
    id: 510, name: "WARD 67", role: "WARD 67 SECURITY · FLOOR CAPTAIN", color: "#f87171", logo: "⬟",
    floor: 4, serviceFloors: ["lobby", 2, 3, 4], businessCode: "TWR-SEC-025", route: "FLOOR 4 → EVERY FLOOR",
    caresFor: "access, response, escorts, and evidence",
    errands: ["checking a door lock", "escorting a contractor", "logging a custody transfer"],
    col: 14, row: 7, path: [{ col: 14, row: 7 }, { col: 18, row: 7 }, { col: 18, row: 13 }, { col: 14, row: 14 }], speed: 0.23,
  },
];

export type TowerAmbientOccupant = Pick<TowerResident, "id" | "name" | "col" | "row" | "color" | "path" | "speed" | "role" | "errands"> & {
  /** Optional shipped named-art asset; IsoOffice keeps a procedural fallback. */
  artSrc?: string;
  /** The concrete task currently visible on the resident's route. */
  workLabel: string;
};

function ambientArtSrc(id: number): string | undefined {
  return id === 501 ? "tower-art/character-claw-prime.png" : undefined;
}

function projectAmbientResident(resident: TowerResident): TowerAmbientOccupant {
  return {
    id: resident.id,
    name: resident.name,
    col: resident.col,
    row: resident.row,
    color: resident.color,
    path: resident.path,
    speed: resident.speed,
    role: resident.role,
    errands: resident.errands,
    workLabel: resident.errands[0] ?? resident.role,
    artSrc: ambientArtSrc(resident.id),
  };
}

export function getTowerAmbientOccupants(floor: TowerFloor): TowerAmbientOccupant[] {
  if (typeof floor === "number" && floor >= 5) {
    return getShadowTowerCommercialTenants(floor).map(({ resident, business }) => ({
      id: resident.id,
      name: resident.name,
      col: resident.col,
      row: resident.row,
      color: resident.color,
      path: resident.path,
      speed: resident.speed,
      role: resident.role,
      errands: [business.service],
      workLabel: business.service,
      artSrc: ambientArtSrc(resident.id),
    }));
  }
  return TOWER_RESIDENTS
    .filter((resident) => resident.floor === floor || resident.serviceFloors?.includes(floor))
    .map(projectAmbientResident);
}

export const TOWER_GOSSIP = [
  ["CLAW PRIME", "The lift is behaving today. Finance Tracker says that means someone filed the right form."],
  ["FINANCE TRACKER", "Shadow Tower Medical has one opening after lunch. Tower Family Dental posted a cancellation."],
  ["MILA", "Tower Repair is handling a lift call upstairs. The public service desk is open downstairs."],
  ["MENDER-9", "The terminal on the mezzanine is not broken. It is simply waiting for a better question."],
  ["DR. NOOR VALE", "The building works better when people make appointments instead of emergencies."],
  ["TOWER FAMILY DENTAL", "A clean filing and a clean smile both make the week easier."],
] as const;

export function getTowerGossip(index = 0) {
  return TOWER_GOSSIP[index % TOWER_GOSSIP.length];
}

/** Occupied commercial floors have dialogue; vacant and non-commercial floors do not. */
export function getTowerOperatorDialogues(floor: TowerFloor): TowerOperatorDialogue[] {
  if (typeof floor !== "number") return [];
  return getShadowTowerCommercialTenants(floor)
    .map((tenant) => getTowerOperatorDialogue(tenant))
    .filter((dialogue): dialogue is TowerOperatorDialogue => dialogue !== null);
}

/**
 * Project a commercial tenant into the short conversation shown when a player
 * walks up to its resident. Tenant fields are already sourced from the shared
 * catalog; this helper only supplies the conversational framing.
 */
export function getTowerOperatorDialogue(
  tenant: ShadowTowerCommercialTenant | undefined,
): TowerOperatorDialogue | null {
  if (!tenant) return null;
  const { conversation } = tenant;
  return {
    residentName: tenant.resident.name,
    businessName: conversation.businessName,
    role: conversation.role,
    service: conversation.service,
    offer: conversation.offer,
    lines: [
      `Welcome to ${conversation.businessName}.`,
      `I am the ${conversation.role.toLowerCase()} on this floor.`,
      `Our current offer is ${conversation.service.toLowerCase()}. ${conversation.offer}`,
    ],
  };
}
