export type VendingFood = {
  id: string;
  name: string;
  price: number;
  effect: string;
};

export const VENDING_FOOD: readonly VendingFood[] = [
  { id: "power_pellet", name: "POWER PELLET", price: 800, effect: "hunger30 thirst20" },
  { id: "synth_ramen", name: "SYNTH RAMEN", price: 1200, effect: "hunger50 energy15" },
  { id: "recycled_water", name: "RECYCLED WATER", price: 400, effect: "thirst40" },
  { id: "pablo_cola", name: "PABLO COLA", price: 600, effect: "thirst30 energy20" },
  { id: "nutri_pack", name: "NUTRI-PACK", price: 2000, effect: "hunger60 thirst60" },
  { id: "stim_shot", name: "STIM SHOT", price: 3500, effect: "energy50 hp10" },
  { id: "med_kit", name: "MED KIT", price: 6000, effect: "hp50" },
  { id: "antidote", name: "ANTIDOTE", price: 4000, effect: "cure_poison" },
  { id: "clean_water", name: "CLEAN WATER", price: 500, effect: "thirst50" },
  { id: "beer", name: "BEER", price: 350, effect: "thirst30 energy15 hprisk5" },
  { id: "energy_drink", name: "ENERGY DRINK", price: 900, effect: "energy60 thirst-10" },
  { id: "power_cell", name: "POWER CELL", price: 2000, effect: "power35" },
];

export function findVendingFood(id: string): VendingFood | undefined {
  return VENDING_FOOD.find((item) => item.id === id);
}