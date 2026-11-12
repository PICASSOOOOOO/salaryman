export type TowerInfrastructureBusiness = {
  key: string;
  code: string;
  ticker: string;
  name: string;
  category: string;
  issuer: "PABLO CORP / SHADOW CORP";
  logo: string;
  color: string;
  floor: string;
  coverage: "single_suite" | "lobby" | "every_floor";
  ad: string;
  service: string;
  operatorCode: string;
  baseSharePriceFiat: number;
  publicFloatShares: number;
  physicalState: "awaiting_art_direction";
};

export type TowerBusinessConversation = {
  businessName: string;
  role: string;
  service: string;
  offer: string;
};

export type TowerBusinessPlacement = {
  businessKey: string;
  floorNumber: number | null;
  unitNumber: number | null;
  coverage: TowerInfrastructureBusiness["coverage"];
  /** Lower values are closer to the Tower exit. Lobby-only businesses are
   * intentionally unranked so "lobby" never becomes a placement advantage. */
  exitPriority: number | null;
};

export const TOWER_INFRASTRUCTURE_BUSINESSES: readonly TowerInfrastructureBusiness[] = [
  { key:"shadow_cafeteria", code:"TWR-FOOD-001", ticker:"TRAY", name:"COMMON TABLE 67", category:"Cafeteria", issuer:"PABLO CORP / SHADOW CORP", logo:"▤", color:"#fbbf24", floor:"FLOOR 2 · PUBLIC COMMONS", coverage:"single_suite", ad:"Three shifts fed. No meeting required.", service:"Meals, staff catering, shift trays", operatorCode:"STEWARD-TRAY-01", baseSharePriceFiat:42, publicFloatShares:180000, physicalState:"awaiting_art_direction" },
  { key:"lobby_gift_shop", code:"TWR-RETAIL-002", ticker:"GIFT", name:"LAST LOOK GIFT CO.", category:"Gift Shop", issuer:"PABLO CORP / SHADOW CORP", logo:"◇", color:"#f9a8d4", floor:"LOBBY · ARRIVAL WALL", coverage:"lobby", ad:"Proof you made it into the Tower.", service:"Gifts, flowers, cards, visitor goods", operatorCode:"CURATOR-GIFT-02", baseSharePriceFiat:31, publicFloatShares:140000, physicalState:"awaiting_art_direction" },
  { key:"tower_vending", code:"TWR-UTILITY-003", ticker:"VEND", name:"NIGHT PANTRY NETWORK", category:"Vending", issuer:"PABLO CORP / SHADOW CORP", logo:"▦", color:"#67e8f9", floor:"EVERY FLOOR · SERVICE NOOK", coverage:"every_floor", ad:"Food, water, batteries, and small mercies at 03:00.", service:"Every-floor vending service", operatorCode:"PANTRY-ROUTE-03", baseSharePriceFiat:56, publicFloatShares:220000, physicalState:"awaiting_art_direction" },
  { key:"tower_atm", code:"TWR-FIN-004", ticker:"TATM", name:"OMBRA TOWER CASH", category:"ATM Network", issuer:"PABLO CORP / SHADOW CORP", logo:"▣", color:"#86efac", floor:"EVERY FLOOR · LIFT BANK", coverage:"every_floor", ad:"Your FIAT, where the elevator leaves you.", service:"Every-floor FIAT access and account service", operatorCode:"OMBRA-CASH-04", baseSharePriceFiat:88, publicFloatShares:250000, physicalState:"awaiting_art_direction" },
  { key:"tower_restaurant", code:"TWR-FOOD-005", ticker:"NOIR", name:"NOIR RESERVATION", category:"Restaurant", issuer:"PABLO CORP / SHADOW CORP", logo:"◆", color:"#c4b5fd", floor:"FLOOR 12 · DINING SUITE", coverage:"single_suite", ad:"Dinner above the weather. Jackets optional; discretion required.", service:"Dining, private rooms, corporate tables", operatorCode:"HOST-NOIR-05", baseSharePriceFiat:124, publicFloatShares:160000, physicalState:"awaiting_art_direction" },
  { key:"tower_clinic", code:"TWR-CARE-006", ticker:"LUMN", name:"LUMEN CARE CLINIC", category:"Clinic", issuer:"PABLO CORP / SHADOW CORP", logo:"✚", color:"#7dd3fc", floor:"FLOOR 3 · CARE COMMONS", coverage:"single_suite", ad:"Triage, observation, and practical care inside the Tower.", service:"Urgent care, diagnostics, observation", operatorCode:"CLINIC-LUMEN-06", baseSharePriceFiat:96, publicFloatShares:175000, physicalState:"awaiting_art_direction" },
  { key:"tower_doctor", code:"TWR-CARE-007", ticker:"VALE", name:"VALE PRIVATE MEDICINE", category:"Doctor", issuer:"PABLO CORP / SHADOW CORP", logo:"+", color:"#93c5fd", floor:"FLOOR 18 · SUITE 18A", coverage:"single_suite", ad:"One physician. Longer appointments. Fewer excuses.", service:"Primary care and executive physicals", operatorCode:"DR-VALE-07", baseSharePriceFiat:73, publicFloatShares:95000, physicalState:"awaiting_art_direction" },
  { key:"tower_dentist", code:"TWR-CARE-008", ticker:"BYTE", name:"BITE//BYTE DENTAL", category:"Dentist", issuer:"PABLO CORP / SHADOW CORP", logo:"◈", color:"#f0abfc", floor:"FLOOR 18 · SUITE 18B", coverage:"single_suite", ad:"Human smiles. Replicant plates. One careful chair.", service:"Dental care and replicant jaw service", operatorCode:"DENT-BYTE-08", baseSharePriceFiat:61, publicFloatShares:105000, physicalState:"awaiting_art_direction" },
  { key:"tower_law", code:"TWR-LEGAL-009", ticker:"WRIT", name:"BLACKLINE COUNSEL", category:"Law Office", issuer:"PABLO CORP / SHADOW CORP", logo:"§", color:"#d8b4fe", floor:"FLOOR 24 · LEGAL SUITE", coverage:"single_suite", ad:"Contracts before conflict. Representation after it.", service:"Business, tenancy, licensing, defense", operatorCode:"COUNSEL-WRIT-09", baseSharePriceFiat:142, publicFloatShares:130000, physicalState:"awaiting_art_direction" },
  { key:"tower_weapons_licensing", code:"TWR-SEC-010", ticker:"ARMR", name:"CIVIC ARMORY LICENSING", category:"Weapons Licensing", issuer:"PABLO CORP / SHADOW CORP", logo:"⌁", color:"#fb7185", floor:"FLOOR 4 · SECURITY DESK", coverage:"single_suite", ad:"Training, permits, storage compliance. No permit, no sale.", service:"Legal weapons expertise and licenses", operatorCode:"EXPERT-ARMR-10", baseSharePriceFiat:155, publicFloatShares:120000, physicalState:"awaiting_art_direction" },
  { key:"tower_black_market", code:"TWR-BLACK-011", ticker:"OBSN", name:"OBSIDIAN BACKROOM", category:"Black Market Dealer", issuer:"PABLO CORP / SHADOW CORP", logo:"▼", color:"#ef4444", floor:"LOCATION WITHHELD · APPOINTMENT ONLY", coverage:"single_suite", ad:"Rare inventory. Obscene prices. No warranties and no directions.", service:"Restricted fictional weapons brokerage", operatorCode:"DEALER-OBSN-11", baseSharePriceFiat:666, publicFloatShares:50000, physicalState:"awaiting_art_direction" },
  { key:"tower_stock_broker", code:"TWR-FIN-012", ticker:"BIDR", name:"BID/ASK HOUSE", category:"Stock Broker", issuer:"PABLO CORP / SHADOW CORP", logo:"↗", color:"#34d399", floor:"FLOOR 31 · EXCHANGE GALLERY", coverage:"single_suite", ad:"Place the trade. Own part of the building that takes your rent.", service:"Tower securities execution and research", operatorCode:"BROKER-BIDR-12", baseSharePriceFiat:210, publicFloatShares:200000, physicalState:"awaiting_art_direction" },
  { key:"tower_import_export", code:"TWR-TRADE-013", ticker:"PORT", name:"NIGHT PORT IMPORT/EXPORT", category:"Import / Export", issuer:"PABLO CORP / SHADOW CORP", logo:"⇄", color:"#60a5fa", floor:"FLOOR 34 · LOGISTICS SUITE", coverage:"single_suite", ad:"Documents move first. Cargo follows.", service:"Customs, freight, sourcing, export desks", operatorCode:"BROKER-PORT-13", baseSharePriceFiat:118, publicFloatShares:230000, physicalState:"awaiting_art_direction" },
  { key:"tower_mineral_rights", code:"TWR-RESOURCE-014", ticker:"VEIN", name:"DEEP VEIN RIGHTS", category:"Mineral Rights", issuer:"PABLO CORP / SHADOW CORP", logo:"⬡", color:"#a3a3a3", floor:"FLOOR 38 · RESOURCE OFFICE", coverage:"single_suite", ad:"The useful part of land is usually underneath it.", service:"Claims, leases, surveys, royalty administration", operatorCode:"SURVEY-VEIN-14", baseSharePriceFiat:184, publicFloatShares:190000, physicalState:"awaiting_art_direction" },
  { key:"tower_gold_exchange", code:"TWR-FIN-015", ticker:"AURM", name:"AURUM GOLD EXCHANGE", category:"Gold Exchange", issuer:"PABLO CORP / SHADOW CORP", logo:"●", color:"#facc15", floor:"FLOOR 29 · SECURE COUNTER", coverage:"single_suite", ad:"Bars, ounces, assay, custody. Weight before words.", service:"In-game GOLD exchange and secure custody", operatorCode:"ASSAY-AURM-15", baseSharePriceFiat:305, publicFloatShares:150000, physicalState:"awaiting_art_direction" },
  { key:"tower_jeweler", code:"TWR-LUX-016", ticker:"FACX", name:"FACET NO. 67", category:"Jeweler", issuer:"PABLO CORP / SHADOW CORP", logo:"◊", color:"#bae6fd", floor:"FLOOR 16 · ATELIER", coverage:"single_suite", ad:"Stone, metal, memory. Made above the city.", service:"Jewelry, appraisal, repair, commissions", operatorCode:"JEWELER-FACX-16", baseSharePriceFiat:132, publicFloatShares:110000, physicalState:"awaiting_art_direction" },
  { key:"tower_terminal_repair", code:"TWR-TECH-017", ticker:"MEND", name:"MENDER-9 TERMINAL WORKS", category:"Computer / Terminal Repair", issuer:"PABLO CORP / SHADOW CORP", logo:"⚙", color:"#fbbf24", floor:"FLOOR 4 · SERVICE BAY", coverage:"single_suite", ad:"Screens, terminals, replicants, and anything that hums wrong.", service:"Terminal, computer, and replicant repair", operatorCode:"MENDER-9-17", baseSharePriceFiat:81, publicFloatShares:165000, physicalState:"awaiting_art_direction" },
  { key:"tower_realty", code:"TWR-PROP-018", ticker:"DEED", name:"VERTICAL REALTY REGISTRY", category:"Real Estate", issuer:"PABLO CORP / SHADOW CORP", logo:"⌂", color:"#f472b6", floor:"LOBBY · RECEPTION ANNEX", coverage:"lobby", ad:"Rent it, buy it, list it, inherit the elevator politics.", service:"Tower rentals, sales, leasing, owner brokerage", operatorCode:"BROKER-DEED-18", baseSharePriceFiat:244, publicFloatShares:210000, physicalState:"awaiting_art_direction" },
  { key:"tower_massage", code:"TWR-WELL-019", ticker:"EASE", name:"SOFT CIRCUIT MASSAGE", category:"Massage Parlor", issuer:"PABLO CORP / SHADOW CORP", logo:"≈", color:"#a7f3d0", floor:"FLOOR 21 · WELLNESS SUITE", coverage:"single_suite", ad:"Quiet hands for loud weeks. Human and replicant sessions.", service:"Massage, recovery, ergonomic care", operatorCode:"THERAPIST-EASE-19", baseSharePriceFiat:47, publicFloatShares:100000, physicalState:"awaiting_art_direction" },
  { key:"tower_pharmacy", code:"TWR-CARE-020", ticker:"DOSE", name:"THIRD SHIFT PHARMACY", category:"Pharmacy", issuer:"PABLO CORP / SHADOW CORP", logo:"✣", color:"#6ee7b7", floor:"FLOOR 3 · CARE COMMONS", coverage:"single_suite", ad:"Prescriptions, first aid, and the things night shifts forget.", service:"Pharmacy and medical supplies", operatorCode:"PHARM-DOSE-20", baseSharePriceFiat:92, publicFloatShares:170000, physicalState:"awaiting_art_direction" },
  { key:"tower_childcare", code:"TWR-LIFE-021", ticker:"NEST", name:"NEST SHIFT CHILDCARE", category:"Childcare", issuer:"PABLO CORP / SHADOW CORP", logo:"○", color:"#fde68a", floor:"FLOOR 9 · FAMILY SUITE", coverage:"single_suite", ad:"Safe care aligned to Tower shifts.", service:"Childcare, tutoring, shift coverage", operatorCode:"CARE-NEST-21", baseSharePriceFiat:39, publicFloatShares:125000, physicalState:"awaiting_art_direction" },
  { key:"tower_laundry", code:"TWR-LIFE-022", ticker:"RINZ", name:"RINSE 67", category:"Laundry", issuer:"PABLO CORP / SHADOW CORP", logo:"◌", color:"#93c5fd", floor:"FLOOR 7 · SERVICE CORRIDOR", coverage:"single_suite", ad:"Uniforms returned before your next shift.", service:"Laundry, dry cleaning, linen service", operatorCode:"ROUTE-RINZ-22", baseSharePriceFiat:28, publicFloatShares:150000, physicalState:"awaiting_art_direction" },
  { key:"tower_tailor", code:"TWR-LUX-023", ticker:"SEAM", name:"THE SHARP SEAM", category:"Tailor", issuer:"PABLO CORP / SHADOW CORP", logo:"✂", color:"#fb7185", floor:"FLOOR 16 · ATELIER", coverage:"single_suite", ad:"Suits altered while your contract is being reviewed.", service:"Tailoring, uniforms, repairs", operatorCode:"TAILOR-SEAM-23", baseSharePriceFiat:34, publicFloatShares:90000, physicalState:"awaiting_art_direction" },
  { key:"tower_courier", code:"TWR-LOGI-024", ticker:"LIFT", name:"LIFTLINE COURIER", category:"Courier", issuer:"PABLO CORP / SHADOW CORP", logo:"↑", color:"#22d3ee", floor:"LOBBY · DELIVERY DESK", coverage:"lobby", ad:"Door to floor. Floor to city. Signature required.", service:"Documents, parcels, internal delivery", operatorCode:"RUNNER-LIFT-24", baseSharePriceFiat:51, publicFloatShares:180000, physicalState:"awaiting_art_direction" },
  { key:"tower_security", code:"TWR-SEC-025", ticker:"WARD", name:"WARD 67 SECURITY", category:"Security", issuer:"PABLO CORP / SHADOW CORP", logo:"⬟", color:"#f87171", floor:"FLOOR 4 · SECURITY OPERATIONS", coverage:"every_floor", ad:"Access, response, escort, evidence.", service:"Every-floor security and response", operatorCode:"WATCH-WARD-25", baseSharePriceFiat:176, publicFloatShares:220000, physicalState:"awaiting_art_direction" },
  { key:"tower_insurance", code:"TWR-FIN-026", ticker:"COVR", name:"COVERED SHADOW", category:"Insurance", issuer:"PABLO CORP / SHADOW CORP", logo:"▱", color:"#818cf8", floor:"FLOOR 27 · RISK OFFICE", coverage:"single_suite", ad:"For the event you swore would never happen.", service:"Property, health, liability, cargo coverage", operatorCode:"ADJUSTER-COVR-26", baseSharePriceFiat:111, publicFloatShares:185000, physicalState:"awaiting_art_direction" },
  { key:"tower_print", code:"TWR-MEDIA-027", ticker:"INKR", name:"INK & RUMOR PRESS", category:"Print / Advertising", issuer:"PABLO CORP / SHADOW CORP", logo:"▧", color:"#e879f9", floor:"FLOOR 14 · PRESS ROOM", coverage:"single_suite", ad:"Menus, legal notices, launch posters, discreet corrections.", service:"Printing, ads, signage, classifieds", operatorCode:"PRESS-INKR-27", baseSharePriceFiat:45, publicFloatShares:130000, physicalState:"awaiting_art_direction" },
  { key:"tower_sanitation", code:"TWR-OPS-028", ticker:"CLEAN", name:"NIGHT JANITORIAL UNION", category:"Sanitation", issuer:"PABLO CORP / SHADOW CORP", logo:"✦", color:"#5eead4", floor:"EVERY FLOOR · OPERATIONS", coverage:"every_floor", ad:"The Tower is clean because someone is awake.", service:"Every-floor cleaning, waste, environmental service", operatorCode:"CREW-CLEAN-28", baseSharePriceFiat:37, publicFloatShares:200000, physicalState:"awaiting_art_direction" },
  { key:"tower_florist", code:"TWR-LIFE-029", ticker:"BLOM", name:"BLACK GLASS FLORIST", category:"Florist", issuer:"PABLO CORP / SHADOW CORP", logo:"❖", color:"#fda4af", floor:"LOBBY · GIFT ARCADE", coverage:"lobby", ad:"Apologies, congratulations, condolences. Delivered upstairs.", service:"Flowers, plants, office arrangements", operatorCode:"FLORIST-BLOM-29", baseSharePriceFiat:26, publicFloatShares:85000, physicalState:"awaiting_art_direction" },
  { key:"tower_accounting", code:"TWR-FIN-030", ticker:"BOOK", name:"LEDGER AFTER DARK", category:"Accounting", issuer:"PABLO CORP / SHADOW CORP", logo:"≡", color:"#4ade80", floor:"FLOOR 26 · ACCOUNTS SUITE", coverage:"single_suite", ad:"Books reconciled before the building wakes.", service:"Bookkeeping, payroll, tax filings", operatorCode:"ACCOUNTANT-BOOK-30", baseSharePriceFiat:102, publicFloatShares:140000, physicalState:"awaiting_art_direction" },
] as const;

export function towerBusinessByKey(key: string) {
  return TOWER_INFRASTRUCTURE_BUSINESSES.find((company) => company.key === key);
}

export function towerBusinessByTicker(ticker: string) {
  return TOWER_INFRASTRUCTURE_BUSINESSES.find((company) => company.ticker === ticker.toUpperCase());
}

/**
 * Build the operator-facing conversation from the canonical business record.
 * Keeping these fields here prevents floor scenes from inventing a second set
 * of tenant names, roles, or service copy.
 */
export function getTowerBusinessConversation(
  business: TowerInfrastructureBusiness | string,
): TowerBusinessConversation | null {
  const company = typeof business === "string" ? towerBusinessByKey(business) : business;
  if (!company) return null;
  return {
    businessName: company.name,
    role: `${company.category.toUpperCase()} · ${company.operatorCode}`,
    service: company.service,
    offer: company.ad,
  };
}

function floorNumberFromLabel(company: TowerInfrastructureBusiness): number | null {
  const match = company.floor.match(/\bFLOOR\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

const SINGLE_SUITE_PLACEMENTS = (() => {
  const counts = new Map<number, number>();
  const placements = new Map<string, TowerBusinessPlacement>();
  for (const company of [...TOWER_INFRASTRUCTURE_BUSINESSES]
    .filter((item) => item.coverage === "single_suite")
    .sort((a, b) => {
      const floorA = floorNumberFromLabel(a) ?? Number.MAX_SAFE_INTEGER;
      const floorB = floorNumberFromLabel(b) ?? Number.MAX_SAFE_INTEGER;
      return floorA - floorB || a.key.localeCompare(b.key);
    })) {
    const floorNumber = floorNumberFromLabel(company);
    const unitNumber = floorNumber == null ? null : (counts.get(floorNumber) ?? 0) + 1;
    if (floorNumber != null) counts.set(floorNumber, unitNumber!);
    placements.set(company.key, {
      businessKey: company.key,
      floorNumber,
      unitNumber,
      coverage: company.coverage,
      // Floor 1 is the lobby and is intentionally not a priority tier.
      exitPriority: floorNumber != null && floorNumber > 1 ? floorNumber : null,
    });
  }
  return placements;
})();

export function getTowerBusinessPlacement(
  business: TowerInfrastructureBusiness | string,
): TowerBusinessPlacement | null {
  const company = typeof business === "string" ? towerBusinessByKey(business) : business;
  if (!company) return null;
  const fixed = SINGLE_SUITE_PLACEMENTS.get(company.key);
  if (fixed) return fixed;
  return {
    businessKey: company.key,
    floorNumber: company.coverage === "every_floor" ? 1 : floorNumberFromLabel(company),
    unitNumber: null,
    coverage: company.coverage,
    exitPriority: null,
  };
}

/** Stable catalog order for assigning fixed-suite businesses from the exit up. */
export function sortTowerBusinessesByExitPriority(
  businesses: readonly TowerInfrastructureBusiness[] = TOWER_INFRASTRUCTURE_BUSINESSES,
) {
  return [...businesses].sort((a, b) => {
    const aPriority = getTowerBusinessPlacement(a)?.exitPriority ?? Number.MAX_SAFE_INTEGER;
    const bPriority = getTowerBusinessPlacement(b)?.exitPriority ?? Number.MAX_SAFE_INTEGER;
    return aPriority - bPriority || a.key.localeCompare(b.key);
  });
}