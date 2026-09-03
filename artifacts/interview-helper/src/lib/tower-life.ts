import { TOWER_INFRASTRUCTURE_BUSINESSES } from "@workspace/api-zod";

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
  code: string;
  name: string;
  category: string;
  color: string;
  logo: string;
  floor: string;
  ad: string;
  appointment: string;
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
  code: business.code,
  name: business.name,
  category: `${business.category.toUpperCase()} · ${business.ticker}`,
  color: business.color,
  logo: business.logo,
  floor: business.floor,
  ad: business.ad,
  appointment: business.service,
}));

export type TowerFloor = "lobby" | 2 | 3 | 4;

export type TowerResident = {
  id: number;
  name: string;
  role: string;
  color: string;
  logo: string;
  floor: TowerFloor;
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
    floor: 4, businessCode: "TWR-TECH-017", route: "FLOOR 4 · SERVICE BAY → EVERY FLOOR",
    caresFor: "lifts, terminals, service bots, and anything that hums wrong",
    errands: ["calibrating an elevator", "collecting a damaged terminal", "delivering a repaired service bot"],
    col: 7, row: 8, path: [{ col: 7, row: 8 }, { col: 12, row: 8 }, { col: 15, row: 12 }, { col: 10, row: 14 }], speed: 0.26,
  },
  {
    id: 510, name: "WARD 67", role: "WARD 67 SECURITY · FLOOR CAPTAIN", color: "#f87171", logo: "⬟",
    floor: 4, businessCode: "TWR-SEC-025", route: "FLOOR 4 → EVERY FLOOR",
    caresFor: "access, response, escorts, and evidence",
    errands: ["checking a door lock", "escorting a contractor", "logging a custody transfer"],
    col: 14, row: 7, path: [{ col: 14, row: 7 }, { col: 18, row: 7 }, { col: 18, row: 13 }, { col: 14, row: 14 }], speed: 0.23,
  },
];

export type TowerAmbientOccupant = Pick<TowerResident, "id" | "name" | "col" | "row" | "color" | "path" | "speed">;

export function getTowerAmbientOccupants(floor: TowerFloor): TowerAmbientOccupant[] {
  return TOWER_RESIDENTS.filter((resident) => resident.floor === floor).map(({ id, name, col, row, color, path, speed }) => ({
    id, name, col, row, color, path, speed,
  }));
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