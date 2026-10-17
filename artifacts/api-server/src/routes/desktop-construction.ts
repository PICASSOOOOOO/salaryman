import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  desktopBasementPresenceTable,
  desktopOfficePresenceTable,
  salarymanSavesTable,
  towerBuildingVitalsTable,
  towerConstructionContributionsTable,
  worldBuildPlansTable,
  type WorldBuildTask,
} from "@workspace/db";
import { creditFiat } from "../lib/fiat-wallet";
import { BUILDING_PRESENCE_MAX_AGE_MS } from "../lib/desktop-building-objects";
import { TOWER_BASEMENT_STATIONS, TOWER_POWER_EXPORT_REACH } from "../lib/tower-basement-layout";
import { requireDesktopLink } from "../lib/desktop-link-auth";
import { readPlayerStamina, spendPlayerStamina } from "../lib/desktop-player-stamina";

const router = Router();
const BUILDING_KEY = "shadow_tower";
const MIN_WORK_MS = 8_000;
const MAX_WORK_AGE_MS = 10 * 60_000;
const SITE_REACH = 850;
const SITE_FLOORS = [2, 3, 4, 5] as const;
const CONSTRUCTION_STAMINA_COST = 3;

function defaultPlan(floor: number) {
  const floorLabel = String(floor).padStart(2, "0");
  return {
    slug: `shadow-tower-construction-floor-${floorLabel}`,
    title: `TOWER FLOOR ${floorLabel} / CONSTRUCTION`,
    description: `Export backup power from B5, then complete the prepared construction work on Floor ${floorLabel}.`,
    region: "city",
    status: "active",
    areaX: 6_000,
    areaY: 7_000,
    areaW: 10_000,
    areaH: 11_000,
    rewardPerTask: 2_500,
    createdByUserId: "tower-system",
    createdByName: "TOWER CONSTRUCTION",
    openToDebtorLabor: false,
    targetBuildingKey: BUILDING_KEY,
    targetFloorNumber: floor,
    tasks: [
      {
        id: `f${floorLabel}-power-export`,
        kind: "power_export",
        x: TOWER_BASEMENT_STATIONS.power.x,
        y: TOWER_BASEMENT_STATIONS.power.y,
        label: `EXPORT B5 BACKUP POWER TO FLOOR ${floorLabel}`,
        notes: "Work at the B5 generator control. This powers only this construction area.",
        assetKey: "power_feed",
        workBasementLevel: TOWER_BASEMENT_STATIONS.power.level,
      },
      {
        id: `f${floorLabel}-structural-frame`,
        kind: "building",
        x: 10_000,
        y: 9_500,
        label: "RAISE THE PREFABRICATED STRUCTURAL FRAME",
        assetKey: "steel_frame",
      },
      {
        id: `f${floorLabel}-service-conduit`,
        kind: "light",
        x: 12_000,
        y: 13_000,
        label: "ROUTE POWER, WATER, AND FIRE-SAFETY CONDUITS",
        assetKey: "service_conduit",
      },
      {
        id: `f${floorLabel}-safe-shell`,
        kind: "building",
        x: 10_000,
        y: 17_000,
        label: "FIT SAFETY PARTITIONS AND FINISH THE SHELL",
        assetKey: "partition_shell",
      },
    ] satisfies WorldBuildTask[],
  };
}

async function ensureTowerPlans(): Promise<void> {
  await db.insert(worldBuildPlansTable)
    .values(SITE_FLOORS.map(defaultPlan))
    .onConflictDoNothing({ target: worldBuildPlansTable.slug });
}

function readTasks(raw: unknown): WorldBuildTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((task): task is WorldBuildTask =>
    !!task && typeof task === "object"
    && typeof (task as WorldBuildTask).id === "string"
    && typeof (task as WorldBuildTask).label === "string"
    && Number.isInteger((task as WorldBuildTask).x)
    && Number.isInteger((task as WorldBuildTask).y));
}

function publicTask(task: WorldBuildTask, userId: string, nowMs: number) {
  const startedMs = task.workStartedAt ? Date.parse(task.workStartedAt) : NaN;
  const sessionFresh = Number.isFinite(startedMs) && nowMs - startedMs <= MAX_WORK_AGE_MS;
  return {
    id: task.id,
    kind: task.kind,
    x: task.x,
    y: task.y,
    label: task.label,
    assetKey: task.assetKey ?? null,
    completed: task.completed === true,
    working: !task.completed && sessionFresh,
    workingByYou: !task.completed && sessionFresh && task.workingUserId === userId,
  };
}

function taskIndex(tasks: WorldBuildTask[], taskId: string): number {
  return tasks.findIndex((task) => task.id === taskId);
}

function validTowerPlan(plan: typeof worldBuildPlansTable.$inferSelect): boolean {
  return plan.targetBuildingKey === BUILDING_KEY
    && plan.targetFloorNumber != null
    && SITE_FLOORS.includes(plan.targetFloorNumber as (typeof SITE_FLOORS)[number]);
}

async function hasLiveBuildingPower(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<boolean> {
  const [vitals] = await tx.select({ powerCondition: towerBuildingVitalsTable.powerCondition })
    .from(towerBuildingVitalsTable)
    .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY))
    .limit(1);
  return vitals == null || vitals.powerCondition > 0;
}

async function presenceAtTask(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  linkId: string,
  plan: typeof worldBuildPlansTable.$inferSelect,
  task: WorldBuildTask,
  now: Date,
): Promise<boolean> {
  if (task.kind === "power_export") {
    const [presence] = await tx.select().from(desktopBasementPresenceTable)
      .where(eq(desktopBasementPresenceTable.userId, userId))
      .for("update").limit(1);
    const station = TOWER_BASEMENT_STATIONS.power;
    return task.workBasementLevel === station.level
      && !!presence
      && presence.linkId === linkId
      && presence.level === station.level
      && now.getTime() - presence.lastSeenAt.getTime() >= 0
      && now.getTime() - presence.lastSeenAt.getTime() <= 15_000
      && Math.hypot(presence.x - station.x, presence.y - station.y) <= TOWER_POWER_EXPORT_REACH;
  }

  const [presence] = await tx.select().from(desktopOfficePresenceTable)
    .where(eq(desktopOfficePresenceTable.userId, userId))
    .for("update").limit(1);
  const expectedFloor = plan.targetFloorNumber;
  const areaContainsTask = task.x >= plan.areaX
    && task.x <= plan.areaX + plan.areaW
    && task.y >= plan.areaY
    && task.y <= plan.areaY + plan.areaH;
  return areaContainsTask
    && !!presence
    && presence.linkId === linkId
    && presence.room === "hallway"
    && presence.floorNumber === expectedFloor
    && now.getTime() - presence.lastSeenAt.getTime() >= 0
    && now.getTime() - presence.lastSeenAt.getTime() <= BUILDING_PRESENCE_MAX_AGE_MS
    && Math.hypot(presence.x - task.x, presence.y - task.y) <= SITE_REACH;
}

router.get("/desktop-building/construction", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  try {
    await ensureTowerPlans();
    await db.insert(towerBuildingVitalsTable).values({ buildingKey: BUILDING_KEY }).onConflictDoNothing();
    const plans = await db.select().from(worldBuildPlansTable).where(and(
      eq(worldBuildPlansTable.targetBuildingKey, BUILDING_KEY),
      inArray(worldBuildPlansTable.targetFloorNumber, [...SITE_FLOORS]),
      inArray(worldBuildPlansTable.status, ["active", "completed"]),
    ));
    const vitals = await db.select({ powerCondition: towerBuildingVitalsTable.powerCondition })
      .from(towerBuildingVitalsTable)
      .where(eq(towerBuildingVitalsTable.buildingKey, BUILDING_KEY))
      .limit(1);
    const nowMs = Date.now();
    res.json({
      observedAt: new Date(nowMs).toISOString(),
      towerPowerAvailable: (vitals[0]?.powerCondition ?? 100) > 0,
      plans: plans.map((plan) => {
        const tasks = readTasks(plan.tasks);
        const powered = tasks.some((task) => task.kind === "power_export" && task.completed === true);
        return {
          id: plan.id,
          title: plan.title,
          floorNumber: plan.targetFloorNumber,
          area: { x: plan.areaX, y: plan.areaY, w: plan.areaW, h: plan.areaH },
          rewardPerTask: plan.rewardPerTask,
          status: plan.status,
          powered: powered && (vitals[0]?.powerCondition ?? 100) > 0,
          tasks: tasks.map((task) => publicTask(task, link.userId, nowMs)),
        };
      }),
    });
  } catch (error) {
    req.log.error({ err: error }, "Tower construction snapshot failed");
    res.status(500).json({ error: "Could not load Tower construction plans" });
  }
});

router.post("/desktop-building/construction/work/start", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const planId = Number(req.body?.planId);
  const taskId = typeof req.body?.taskId === "string" ? req.body.taskId.slice(0, 64) : "";
  if (!Number.isInteger(planId) || planId <= 0 || !taskId) {
    res.status(400).json({ error: "planId and taskId are required" });
    return;
  }
  try {
    await ensureTowerPlans();
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(worldBuildPlansTable)
        .where(eq(worldBuildPlansTable.id, planId)).for("update").limit(1);
      if (!plan || !validTowerPlan(plan)) return { status: 404, error: "Construction plan not found" } as const;
      if (plan.status !== "active") return { status: 409, error: "Construction plan is not active" } as const;
      const tasks = readTasks(plan.tasks);
      const idx = taskIndex(tasks, taskId);
      if (idx < 0) return { status: 404, error: "Construction task not found" } as const;
      const task = tasks[idx];
      if (task.completed) return { status: 409, error: "Construction task already completed" } as const;
      if (task.kind !== "power_export" && !await hasLiveBuildingPower(tx)) {
        return { status: 409, error: "Tower power is unavailable" } as const;
      }
      if (task.kind !== "power_export"
        && !tasks.some((entry) => entry.kind === "power_export" && entry.completed === true)) {
        return { status: 409, error: "Export power from B5 to this area first" } as const;
      }
      if (!await presenceAtTask(tx, link.userId, link.id, plan, task, now)) {
        return { status: 409, error: task.kind === "power_export"
          ? "Stand at the B5 generator control to export power"
          : "Stand at the prepared construction task on its target floor" } as const;
      }
      const startedAt = task.workStartedAt ? Date.parse(task.workStartedAt) : NaN;
      const sessionFresh = Number.isFinite(startedAt)
        && now.getTime() - startedAt >= 0
        && now.getTime() - startedAt <= MAX_WORK_AGE_MS;
      if (sessionFresh && task.workingUserId && task.workingUserId !== link.userId) {
        return { status: 409, error: "Another player is working on this task" } as const;
      }
      let stamina = 100;
      if (!sessionFresh || task.workingUserId !== link.userId) {
        const [save] = await tx.select().from(salarymanSavesTable).where(and(
          eq(salarymanSavesTable.userId, link.userId),
          eq(salarymanSavesTable.slotIndex, 0),
        )).for("update").limit(1);
        if (!save) return { status: 404, error: "Create a character before starting construction work" } as const;
        const spent = spendPlayerStamina(save.data, CONSTRUCTION_STAMINA_COST, now);
        if (!spent) return { status: 402, error: "Too exhausted to work; recover stamina before starting another task" } as const;
        stamina = spent.stamina;
        await tx.update(salarymanSavesTable).set({ data: spent.data }).where(eq(salarymanSavesTable.id, save.id));
      } else {
        const [save] = await tx.select().from(salarymanSavesTable).where(and(
          eq(salarymanSavesTable.userId, link.userId),
          eq(salarymanSavesTable.slotIndex, 0),
        )).limit(1);
        if (save) stamina = readPlayerStamina(save.data, now).stamina;
      }
      const sessionId = sessionFresh && task.workingUserId === link.userId && task.workSessionId
        ? task.workSessionId
        : randomUUID();
      tasks[idx] = {
        ...task,
        workingUserId: link.userId,
        workSessionId: sessionId,
        workStartedAt: sessionFresh && task.workingUserId === link.userId
          ? task.workStartedAt
          : now.toISOString(),
      };
      await tx.update(worldBuildPlansTable)
        .set({ tasks, updatedAt: now })
        .where(eq(worldBuildPlansTable.id, plan.id));
      return { status: 200, sessionId, durationMs: MIN_WORK_MS, label: task.label, stamina } as const;
    });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    req.log.error({ err: error }, "Tower construction work start failed");
    res.status(500).json({ error: "Could not start construction work" });
  }
});

router.post("/desktop-building/construction/work/complete", async (req, res): Promise<void> => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const planId = Number(req.body?.planId);
  const taskId = typeof req.body?.taskId === "string" ? req.body.taskId.slice(0, 64) : "";
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.slice(0, 64) : "";
  if (!Number.isInteger(planId) || planId <= 0 || !taskId || !sessionId) {
    res.status(400).json({ error: "planId, taskId, and sessionId are required" });
    return;
  }
  try {
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(worldBuildPlansTable)
        .where(eq(worldBuildPlansTable.id, planId)).for("update").limit(1);
      if (!plan || !validTowerPlan(plan)) return { status: 404, error: "Construction plan not found" } as const;
      if (plan.status !== "active") return { status: 409, error: "Construction plan is not active" } as const;
      const tasks = readTasks(plan.tasks);
      const idx = taskIndex(tasks, taskId);
      if (idx < 0) return { status: 404, error: "Construction task not found" } as const;
      const task = tasks[idx];
      if (task.completed) return { status: 409, error: "Construction task already completed" } as const;
      if (task.workingUserId !== link.userId || task.workSessionId !== sessionId || !task.workStartedAt) {
        return { status: 409, error: "Construction work session is not active" } as const;
      }
      const startedAt = Date.parse(task.workStartedAt);
      const elapsedMs = now.getTime() - startedAt;
      if (!Number.isFinite(startedAt) || elapsedMs < MIN_WORK_MS || elapsedMs > MAX_WORK_AGE_MS) {
        return { status: 409, error: "Stay on site for the full work session, then try again" } as const;
      }
      if (task.kind !== "power_export" && !await hasLiveBuildingPower(tx)) {
        return { status: 409, error: "Tower power is unavailable" } as const;
      }
      if (task.kind !== "power_export"
        && !tasks.some((entry) => entry.kind === "power_export" && entry.completed === true)) {
        return { status: 409, error: "Export power from B5 to this area first" } as const;
      }
      if (!await presenceAtTask(tx, link.userId, link.id, plan, task, now)) {
        return { status: 409, error: "Return to the active construction task before completing it" } as const;
      }
      const rewardFiat = Math.max(1, Math.min(100_000, Math.trunc(plan.rewardPerTask)));
      const [contribution] = await tx.insert(towerConstructionContributionsTable).values({
        planId: plan.id,
        taskId,
        userId: link.userId,
        rewardFiat,
      }).onConflictDoNothing().returning({ id: towerConstructionContributionsTable.id });
      if (!contribution) return { status: 409, error: "Construction task already claimed" } as const;

      tasks[idx] = {
        ...task,
        completed: true,
        completedAt: now.toISOString(),
        workingUserId: null,
        workSessionId: null,
        workStartedAt: null,
      };
      const allDone = tasks.every((entry) => entry.completed === true);
      await tx.update(worldBuildPlansTable).set({
        tasks,
        status: allDone ? "completed" : "active",
        updatedAt: now,
      }).where(eq(worldBuildPlansTable.id, plan.id));
      const credit = await creditFiat(tx, {
        userId: link.userId,
        amountFiat: rewardFiat,
        description: `Tower construction / Floor ${plan.targetFloorNumber}`,
        kind: "income",
        idempotencyKey: `tower-build-${plan.id}-${taskId}`,
      });
      return {
        status: 200,
        rewardFiat,
        newBalance: credit.newBalance,
        floorNumber: plan.targetFloorNumber,
        powered: tasks.some((entry) => entry.kind === "power_export" && entry.completed === true),
        planCompleted: allDone,
      } as const;
    });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    req.log.error({ err: error }, "Tower construction work completion failed");
    res.status(500).json({ error: "Could not complete construction work" });
  }
});

export default router;
