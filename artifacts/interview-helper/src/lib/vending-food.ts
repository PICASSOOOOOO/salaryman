/**
 * Shared FOOD catalog for the SALARYMAN vending machines.
 *
 * Both the in-world vending overlay (WorldPlay.tsx `VEND_CATALOG`) and the
 * standalone PABLO FRESH vending page (VendingMachine.tsx) source their food &
 * drink items from THIS list, so the restore values can never drift between the
 * two machines. Effect strings use the same compact grammar the world consumes
 * ("hunger30 thirst20 energy15 hp10 power35 cure_poison hprisk5").
 */

export interface VendFoodItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** Compact effect grammar applied on consume. */
  effect: string;
  /** Always a stackable consumable — kept so the list is a valid `VendItem[]`. */
  consumable: true;
}

export const VEND_FOOD_ITEMS: VendFoodItem[] = [
  { id: 'power_pellet',   name: 'POWER PELLET',   desc: 'Off-brand ration. Hunger+30 Thirst+20.',              price: 800,  consumable: true, effect: 'hunger30 thirst20' },
  { id: 'synth_ramen',    name: 'SYNTH RAMEN',    desc: 'Hot. Questionable protein. Hunger+50 Energy+15.',     price: 1200, consumable: true, effect: 'hunger50 energy15' },
  { id: 'recycled_water', name: 'RECYCLED WATER', desc: 'Distilled twice. Probably fine. Thirst+40.',          price: 400,  consumable: true, effect: 'thirst40' },
  { id: 'pablo_cola',     name: 'PABLO COLA',     desc: 'Electrolyte formula. Thirst+30 Energy+20.',           price: 600,  consumable: true, effect: 'thirst30 energy20' },
  { id: 'nutri_pack',     name: 'NUTRI-PACK',     desc: 'Field ration. Full refill. Hunger+60 Thirst+60.',     price: 2000, consumable: true, effect: 'hunger60 thirst60' },
  { id: 'stim_shot',      name: 'STIM SHOT',      desc: 'Adrenaline. Energy+50 HP+10. Side effects unlisted.', price: 3500, consumable: true, effect: 'energy50 hp10' },
  { id: 'med_kit',        name: 'MED KIT',        desc: 'Trauma wrap. HP+50. No sterile field needed.',        price: 6000, consumable: true, effect: 'hp50' },
  { id: 'antidote',       name: 'ANTIDOTE',       desc: 'Clears poison status immediately.',                   price: 4000, consumable: true, effect: 'cure_poison' },
  { id: 'clean_water',    name: 'CLEAN WATER',    desc: 'Filtered. Thirst+50. No side effects.',               price: 500,  consumable: true, effect: 'thirst50' },
  { id: 'beer',           name: 'BEER',           desc: 'Thirst+30. Energy+15. 10% chance HP-5.',              price: 350,  consumable: true, effect: 'thirst30 energy15 hprisk5' },
  { id: 'energy_drink',   name: 'ENERGY DRINK',   desc: 'JOLT BRAND. Energy+60. Thirst-10.',                   price: 900,  consumable: true, effect: 'energy60 thirst-10' },
  { id: 'power_cell',     name: 'POWER CELL',     desc: 'Restores grid power. Power+35.',                      price: 2000, consumable: true, effect: 'power35' },
];

export interface FoodEffectDeltas {
  hunger: number;
  thirst: number;
  energy: number;
  hp: number;
  power: number;
  curePoison: boolean;
  /** Risky food: 10% chance of a small HP loss when consumed. */
  hpRisk: boolean;
}

/**
 * Parse a compact effect string into stat deltas. Mirrors the per-token parser
 * the in-world vending handler uses, so a food item behaves identically whether
 * eaten in the world or bought from the standalone machine. Each whitespace
 * token maps to exactly one stat; order of checks matters for the
 * overlapping prefixes (`hprisk5` before `hp`, `thirst-10` before `thirst`).
 */
export function parseFoodEffect(effect: string): FoodEffectDeltas {
  const d: FoodEffectDeltas = { hunger: 0, thirst: 0, energy: 0, hp: 0, power: 0, curePoison: false, hpRisk: false };
  for (const p of effect.split(' ')) {
    if (!p) continue;
    if (p.startsWith('hunger')) d.hunger += parseInt(p.slice(6)) || 0;
    else if (p === 'thirst-10') d.thirst -= 10;
    else if (p.startsWith('thirst')) d.thirst += parseInt(p.slice(6)) || 0;
    else if (p.startsWith('energy')) d.energy += parseInt(p.slice(6)) || 0;
    else if (p === 'hprisk5') d.hpRisk = true;
    else if (p.startsWith('hp')) d.hp += parseInt(p.slice(2)) || 0;
    else if (p === 'cure_poison') d.curePoison = true;
    else if (p.startsWith('power')) d.power += parseInt(p.slice(5)) || 0;
  }
  return d;
}

/** Stamina/energy restored by a food item (0 when it restores no energy). */
export function foodEnergyRestore(effect: string): number {
  return parseFoodEffect(effect).energy;
}
