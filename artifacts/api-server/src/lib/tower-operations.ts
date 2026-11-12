import { eq } from "drizzle-orm";
import {
  careerPositionsTable,
  db,
  towerBuildingVitalsTable,
  towerOperationsStateTable,
} from "@workspace/db";
import { ensureCareerPosition } from "./career-progression";
import { advanceTowerFinance, towerBackupAllocation } from "./tower-finance";
import {
  TOWER_BASEMENT_STATIONS,
  TOWER_SERVICE_ELEVATOR_BASEMENT,
} from "./tower-basement-layout";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const BUILDING_KEY = "shadow_tower";
const DAY_MS = 24 * 60 * 60 * 1_000;
const SUPPLY_DELIVERY_MS = 7 * DAY_MS;
const NPC_UTILITY_REPAIR = 4;
const TRASH_PER_DAY = 2;
const NPC_TRASH_HAUL_PER_DAY = 1;
const SUPPLY_CRATES_PER_DELIVERY = 1;
const TOWER_B1_WASTE_STATION = { x: 9_000, y: 9_000 };

export type TowerWorkSuggestion = {
  id: "generator" | "pumping" | "waste";
  title: string;
  reason: string;
  floorNumber: 1 | 5 | 6;
  advisoryOnly: true;
};

export function prioritizeApprovedTowerWork(input: {
  powerCondition: number;
  plumbingCondition: number;
  accumulatedTrash: number;
}): TowerWorkSuggestion[] {
  const suggestions: Array<TowerWorkSuggestion & { priority: number }> = [];
  if (input.powerCondition < 70) {
    suggestions.push({
      id: "generator",
      title: "Inspect generator",
      reason: `Tower power condition is ${input.powerCondition}%.`,
      floorNumber: 5,
      advisoryOnly: true,
      priority: 100 - input.powerCondition,
    });
  }
  if (input.plumbingCondition < 70) {
    suggestions.push({
      id: "pumping",
      title: "Check water pumps",
      reason: `Tower plumbing condition is ${input.plumbingCondition}%.`,
      floorNumber: 6,
      advisoryOnly: true,
      priority: 100 - input.plumbingCondition,
    });
  }
  if (input.accumulatedTrash > 0) {
    suggestions.push({
      id: "waste",
      title: "Haul accumulated waste",
      reason: `${input.accumulatedTrash} waste unit${input.accumulatedTrash === 1 ? "" : "s"} await hauling.`,
      floorNumber: 1,
      advisoryOnly: true,
      priority: Math.min(100, 30 + input.accumulatedTrash),
    });
  }
  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map(({ priority: _priority, ...suggestion }) => suggestion);
}

function wholeIntervals(now: Date, last: Date, intervalMs: number): number {
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / intervalMs));
}

export function utilityNpcLocation(now: Date) {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minutes >= 7 * 60 + 30 && minutes < 8 * 60) {
    return {
      floorNumber: 1,
      x: TOWER_SERVICE_ELEVATOR_BASEMENT.x,
      y: TOWER_SERVICE_ELEVATOR_BASEMENT.y,
      action: "traveling",
      route: "service_elevator",
      destinationFloor: 5,
    } as const;
  }
  if (minutes >= 8 * 60 && minutes < 12 * 60) {
    return {
      floorNumber: 5,
      x: TOWER_BASEMENT_STATIONS.power.x,
      y: TOWER_BASEMENT_STATIONS.power.y,
      action: "generating",
      route: "at_station",
    } as const;
  }
  if (minutes >= 12 * 60 && minutes < 13 * 60) {
    return {
      floorNumber: 5,
      x: TOWER_SERVICE_ELEVATOR_BASEMENT.x,
      y: TOWER_SERVICE_ELEVATOR_BASEMENT.y,
      action: "traveling",
      route: "service_elevator",
      destinationFloor: 6,
    } as const;
  }
  if (minutes >= 13 * 60 && minutes < 17 * 60) {
    return {
      floorNumber: 6,
      x: TOWER_BASEMENT_STATIONS.plumbing.x,
      y: TOWER_BASEMENT_STATIONS.plumbing.y,
      action: "pumping",
      route: "at_station",
    } as const;
  }
  if (minutes >= 17 * 60 && minutes < 18 * 60) {
    return {
      floorNumber: 6,
      x: TOWER_SERVICE_ELEVATOR_BASEMENT.x,
      y: TOWER_SERVICE_ELEVATOR_BASEMENT.y,
      action: "traveling",
      route: "service_elevator",
      destinationFloor: 1,
    } as const;
  }
  return {
    floorNumber: null,
    x: 0,
    y: 0,
    action: "off_shift",
    route: "off_shift",
  } as const;
}

export function wasteNpcLocation(now: Date) {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minutes >= 9 * 60 && minutes < 10 * 60) {
    return {
      floorNumber: 6,
      x: TOWER_SERVICE_ELEVATOR_BASEMENT.x,
      y: TOWER_SERVICE_ELEVATOR_BASEMENT.y,
      action: "traveling",
      route: "service_elevator",
      destinationFloor: 1,
    } as const;
  }
  if (minutes >= 10 * 60 && minutes < 12 * 60) {
    return {
      floorNumber: 1,
      x: TOWER_B1_WASTE_STATION.x,
      y: TOWER_B1_WASTE_STATION.y,
      action: "hauling_trash",
      route: "waste_station",
    } as const;
  }
  if (minutes >= 12 * 60 && minutes < 13 * 60) {
    return {
      floorNumber: 1,
      x: TOWER_SERVICE_ELEVATOR_BASEMENT.x,
      y: TOWER_SERVICE_ELEVATOR_BASEMENT.y,
      action: "traveling",
      route: "service_elevator",
      destinationFloor: 6,
    } as const;
  }
  return {
    floorNumber: null,
    x: 0,
    y: 0,
    action: "off_shift",
    route: "off_shift",
  } as const;
}

export async function advanceTowerOperations(tx: DbTx, now = new Date()) {
  await tx.insert(towerOperationsStateTable)
    .values({ buildingKey: BUILDING_KEY })
    .onConflictDoNothing();
  const [state] = await tx.select().from(towerOperationsStateTable)
    .where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY))
    .for("update")
    .limit(1);
  if (!state) throw new Error("Tower operations state could not be initialized");

  const generatorDays = wholeIntervals(now, state.lastGeneratorWorkAt, DAY_MS);
  const pumpDays = wholeIntervals(now, state.lastPumpWorkAt, DAY_MS);
  const trashDays = wholeIntervals(now, state.lastTrashTickAt, DAY_MS);
  const trashHaulDays = wholeIntervals(now, state.lastTrashHaulAt, DAY_MS);
  const supplyDeliveries = wholeIntervals(now, state.lastSupplyDeliveryAt, SUPPLY_DELIVERY_MS);
  const generatedTrash = trashDays * TRASH_PER_DAY;
  const npcHauledTrash = Math.min(
    state.accumulatedTrash + generatedTrash,
    trashHaulDays * NPC_TRASH_HAUL_PER_DAY,
  );

  if (generatorDays || pumpDays) {
    await tx.insert(towerBuildingVitalsTable)
      .values({ buildingKey: BUILDING_KEY })
      .onConflictDoNothing();
    const [vitals] = await tx.select().from(towerBuildingVitalsTable)
      .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY))
      .for("update")
      .limit(1);
    if (!vitals) throw new Error("Tower vitality state could not be initialized");

    const decayDays = wholeIntervals(now, vitals.lastTickAt, 3 * DAY_MS);
    const lastTickRemainder = Math.max(0, now.getTime() - vitals.lastTickAt.getTime()) % (3 * DAY_MS);
    await tx.update(towerBuildingVitalsTable).set({
      powerCondition: Math.min(100, Math.max(0, vitals.powerCondition - decayDays)
        + generatorDays * NPC_UTILITY_REPAIR),
      plumbingCondition: Math.min(100, Math.max(0, vitals.plumbingCondition - decayDays)
        + pumpDays * NPC_UTILITY_REPAIR),
      lastTickAt: new Date(now.getTime() - lastTickRemainder),
      updatedAt: now,
    }).where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY));
  }

  await tx.update(towerOperationsStateTable).set({
    accumulatedTrash: Math.min(1_000_000, state.accumulatedTrash + generatedTrash - npcHauledTrash),
    processedTrash: Math.min(1_000_000, state.processedTrash + npcHauledTrash),
    incomingSupplyCrates: Math.min(1_000_000,
      state.incomingSupplyCrates + supplyDeliveries * SUPPLY_CRATES_PER_DELIVERY),
    lastTrashTickAt: new Date(state.lastTrashTickAt.getTime() + trashDays * DAY_MS),
    lastTrashHaulAt: new Date(state.lastTrashHaulAt.getTime() + trashHaulDays * DAY_MS),
    lastSupplyDeliveryAt: new Date(state.lastSupplyDeliveryAt.getTime() + supplyDeliveries * SUPPLY_DELIVERY_MS),
    lastGeneratorWorkAt: new Date(state.lastGeneratorWorkAt.getTime() + generatorDays * DAY_MS),
    lastPumpWorkAt: new Date(state.lastPumpWorkAt.getTime() + pumpDays * DAY_MS),
    updatedAt: now,
  }).where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY));

  const maintenancePosition = await ensureCareerPosition(tx, {
    employerKey: "pablo-corp",
    positionKey: "pablo-corp:tower:maintenance",
    title: "Tower Maintenance",
    department: "PABLO CORP / SHADOW TOWER",
  }, now);
  const operationsPosition = await ensureCareerPosition(tx, {
    employerKey: "pablo-corp",
    positionKey: "pablo-corp:tower:operations",
    title: "Tower Operations",
    department: "PABLO CORP / SHADOW TOWER",
  }, now);

  const [updatedState] = await tx.select().from(towerOperationsStateTable)
    .where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY))
    .limit(1);
  const [updatedVitals] = await tx.select().from(towerBuildingVitalsTable)
    .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY))
    .limit(1);
  if (!updatedState) throw new Error("Tower operations state disappeared during update");

  return {
    state: updatedState,
    vitals: updatedVitals,
    npcs: {
      generator: {
        id: "tower-maintenance",
        name: maintenancePosition.incumbentName,
        role: maintenancePosition.title,
        floorNumber: 5,
        action: "daily_generator_work",
      },
      pump: {
        id: "tower-pump-operator",
        name: maintenancePosition.incumbentName,
        role: maintenancePosition.title,
        floorNumber: 6,
        action: "daily_pump_work",
      },
      waste: {
        id: "tower-waste-porter",
        name: operationsPosition.incumbentName,
        role: operationsPosition.title,
        floorNumber: wasteNpcLocation(now).floorNumber,
        action: "shipping_and_waste",
      },
      maintenanceRoute: utilityNpcLocation(now),
      wasteRoute: wasteNpcLocation(now),
    },
  };
}

export async function towerOperationsSnapshot(tx: DbTx, now = new Date(), currentUserId = "") {
  const advanced = await advanceTowerOperations(tx, now);
  const finance = await advanceTowerFinance(tx, now);
  const powerOutage = (advanced.vitals?.powerCondition ?? 100) <= 0 || !finance.powerBillPaid;
  const backup = await towerBackupAllocation(
    tx,
    now,
    currentUserId,
    powerOutage,
    finance.backupFuelDays,
  );
  const [maintenancePosition] = await tx.select().from(careerPositionsTable)
    .where(eq(careerPositionsTable.positionKey, "pablo-corp:tower:maintenance"))
    .limit(1);
  return {
    state: advanced.state,
    vitals: advanced.vitals,
    accumulatedTrash: advanced.state.accumulatedTrash,
    incomingSupplyCrates: advanced.state.incomingSupplyCrates,
    storedSupplyCrates: advanced.state.storedSupplyCrates,
    processedTrash: advanced.state.processedTrash,
    observedAt: now.toISOString(),
    finance,
    backup,
    utilityWork: {
      generator: advanced.state.lastGeneratorWorkAt.toISOString(),
      pump: advanced.state.lastPumpWorkAt.toISOString(),
    },
    workSuggestions: prioritizeApprovedTowerWork({
      powerCondition: advanced.vitals?.powerCondition ?? 100,
      plumbingCondition: advanced.vitals?.plumbingCondition ?? 100,
      accumulatedTrash: advanced.state.accumulatedTrash,
    }),
    maintenanceNpc: maintenancePosition?.incumbentName ?? null,
    npcs: advanced.npcs,
  };
}
