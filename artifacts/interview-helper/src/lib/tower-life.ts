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

export const TOWER_BUSINESSES: TowerBusiness[] = [
  {
    code: "LUMEN-CARE-CLINIC",
    name: "SHADOW TOWER MEDICAL",
    category: "DOCTOR · HEALTHCARE",
    color: "#7dd3fc",
    logo: "✚",
    floor: "FLOOR 3 · CLINIC ROOM",
    ad: "Medical care, checkups, and quiet observation for Tower residents.",
    appointment: "Appointments and walk-ins available",
  },
  {
    code: "BITE-BYTE-DENTAL",
    name: "TOWER FAMILY DENTAL",
    category: "DENTIST · ALL AGES",
    color: "#f9a8d4",
    logo: "◈",
    floor: "FLOOR 3 · SUITE 3B",
    ad: "Cleanings, repairs, and comfortable dental care for people and replicants.",
    appointment: "Book an appointment · same-week openings",
  },
  {
    code: "MENDER-9-SERVICE",
    name: "TOWER REPAIR & MAINTENANCE",
    category: "REPAIRS · BUILDING SERVICES",
    color: "#fbbf24",
    logo: "⚙",
    floor: "FLOOR 4 · SERVICE BAY",
    ad: "Fast repairs for lifts, computers, appliances, and everyday building problems.",
    appointment: "Request service · priority repairs available",
  },
];

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