import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import {
  careerPositionsTable,
  careerPromotionsTable,
  careerWorkEventsTable,
  db,
  towerStaffAssignmentsTable,
} from "@workspace/db";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TURNOVER_PROBABILITY = 0.2;
const PERFORMANCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const ABANDONED_SESSION_MS = 24 * 60 * 60 * 1_000;
const NPC_FIRST_NAMES = ["Ari", "Bao", "Cora", "Dara", "Eli", "Hanh", "Ivo", "June", "Khai", "Linh", "Mika", "Niko"];
const NPC_LAST_NAMES = ["An", "Bui", "Dao", "Do", "Le", "Mai", "Nguyen", "Pham", "Tran", "Vu"];

export type CareerPositionSpec = {
  positionKey: string;
  employerKey: string;
  title: string;
  department?: string;
};

export type CareerPerformance = {
  verifiedOutput: number;
  reliabilityPct: number;
  attendanceDays: number;
  outperformed: boolean;
};

export function nextRandomTurnoverAt(
  from: Date,
  random: () => number = Math.random,
): Date {
  let months = 1;
  while (random() >= TURNOVER_PROBABILITY && months < 240) months += 1;
  const targetMonth = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth() + months,
    1,
  ));
  const daysInMonth = new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  const day = randomInt(daysInMonth);
  const minute = randomInt(24 * 60);
  return new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    day + 1,
    Math.floor(minute / 60),
    minute % 60,
  ));
}

export function calculateCareerPerformance(
  events: Array<{ status: string; outputUnits: number; completedAt: Date | null }>,
  position: {
    baselineOutputUnits: number;
    baselineAttendanceDays: number;
    baselineReliabilityPct: number;
  },
): CareerPerformance {
  const completed = events.filter((event) => event.status === "completed" && event.completedAt);
  const verifiedOutput = completed.reduce((sum, event) => sum + event.outputUnits, 0);
  const attendanceDays = new Set(completed.map((event) =>
    event.completedAt!.toISOString().slice(0, 10))).size;
  const reliabilityPct = events.length === 0
    ? 100
    : Math.floor((completed.length * 100) / events.length);
  const meetsAllBenchmarks = verifiedOutput >= position.baselineOutputUnits
    && attendanceDays >= position.baselineAttendanceDays
    && reliabilityPct >= position.baselineReliabilityPct;
  const outperformed = meetsAllBenchmarks
    && (verifiedOutput > position.baselineOutputUnits
      || attendanceDays > position.baselineAttendanceDays
      || reliabilityPct > position.baselineReliabilityPct);
  return { verifiedOutput, reliabilityPct, attendanceDays, outperformed };
}

function newNpcName(): string {
  return `${NPC_FIRST_NAMES[randomInt(NPC_FIRST_NAMES.length)]} ${NPC_LAST_NAMES[randomInt(NPC_LAST_NAMES.length)]}`;
}

function newNpcBenchmarks() {
  return {
    baselineOutputUnits: randomInt(17, 29),
    baselineAttendanceDays: randomInt(16, 22),
    baselineReliabilityPct: randomInt(82, 97),
  };
}

export async function ensureCareerPosition(
  tx: DbTx,
  spec: CareerPositionSpec,
  now = new Date(),
) {
  const benchmarks = newNpcBenchmarks();
  await tx.insert(careerPositionsTable).values({
    positionKey: spec.positionKey,
    employerKey: spec.employerKey,
    title: spec.title,
    department: spec.department ?? "",
    incumbentName: newNpcName(),
    incumbentSince: now,
    nextTurnoverAt: nextRandomTurnoverAt(now),
    ...benchmarks,
    updatedAt: now,
  }).onConflictDoNothing();

  let [position] = await tx.select().from(careerPositionsTable)
    .where(eq(careerPositionsTable.positionKey, spec.positionKey))
    .for("update")
    .limit(1);
  if (!position) throw new Error("Career position could not be initialized");

  let replacements = 0;
  while (position.nextTurnoverAt <= now && replacements < 240) {
    const turnoverAt = position.nextTurnoverAt;
    const replacement = {
      incumbentName: newNpcName(),
      incumbentSince: turnoverAt,
      lastTurnoverAt: turnoverAt,
      nextTurnoverAt: nextRandomTurnoverAt(turnoverAt),
      ...newNpcBenchmarks(),
      updatedAt: now,
    };
    await tx.update(careerPositionsTable).set(replacement)
      .where(eq(careerPositionsTable.positionKey, position.positionKey));
    [position] = await tx.select().from(careerPositionsTable)
      .where(eq(careerPositionsTable.positionKey, spec.positionKey))
      .for("update")
      .limit(1);
    if (!position) throw new Error("Career position disappeared during turnover");
    replacements += 1;
  }
  return position;
}

async function evaluatePosition(
  tx: DbTx,
  position: Awaited<ReturnType<typeof ensureCareerPosition>>,
  userId: string,
  now: Date,
) {
  await tx.update(careerWorkEventsTable).set({ status: "missed" }).where(and(
    eq(careerWorkEventsTable.positionKey, position.positionKey),
    eq(careerWorkEventsTable.userId, userId),
    eq(careerWorkEventsTable.status, "started"),
    lt(careerWorkEventsTable.startedAt, new Date(now.getTime() - ABANDONED_SESSION_MS)),
  ));

  const windowStart = new Date(now.getTime() - PERFORMANCE_WINDOW_MS);
  const events = await tx.select({
    status: careerWorkEventsTable.status,
    outputUnits: careerWorkEventsTable.outputUnits,
    completedAt: careerWorkEventsTable.completedAt,
  }).from(careerWorkEventsTable).where(and(
    eq(careerWorkEventsTable.positionKey, position.positionKey),
    eq(careerWorkEventsTable.userId, userId),
    gte(careerWorkEventsTable.startedAt, windowStart),
  ));
  const performance = calculateCareerPerformance(events, position);
  let [promotion] = await tx.select().from(careerPromotionsTable).where(and(
    eq(careerPromotionsTable.employerKey, position.employerKey),
    eq(careerPromotionsTable.positionKey, position.positionKey),
    eq(careerPromotionsTable.userId, userId),
  )).for("update").limit(1);
  const level = promotion?.level ?? 1;
  const alreadyBeatThisIncumbent = promotion?.evaluatedIncumbentSince?.getTime()
    === position.incumbentSince.getTime();
  let promoted = false;
  let nextLevel = level;

  if (performance.outperformed && !alreadyBeatThisIncumbent && level < 10) {
    nextLevel = level + 1;
    await tx.insert(careerPromotionsTable).values({
      employerKey: position.employerKey,
      positionKey: position.positionKey,
      userId,
      level: nextLevel,
      promotedAt: now,
      evaluatedIncumbentSince: position.incumbentSince,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [
        careerPromotionsTable.employerKey,
        careerPromotionsTable.positionKey,
        careerPromotionsTable.userId,
      ],
      set: {
        level: nextLevel,
        promotedAt: now,
        evaluatedIncumbentSince: position.incumbentSince,
        updatedAt: now,
      },
    });
    promotion = {
      employerKey: position.employerKey,
      positionKey: position.positionKey,
      userId,
      level: nextLevel,
      promotedAt: now,
      evaluatedIncumbentSince: position.incumbentSince,
      updatedAt: now,
    };
    promoted = true;

    const towerRole = position.positionKey.match(/^pablo-corp:tower:(operations|maintenance|security)$/)?.[1];
    if (towerRole) {
      await tx.update(towerStaffAssignmentsTable).set({
        careerLevel: nextLevel,
        updatedAt: now,
      }).where(eq(towerStaffAssignmentsTable.userId, userId));
    }
  }

  return {
    positionKey: position.positionKey,
    employerKey: position.employerKey,
    title: position.title,
    incumbent: position.incumbentName,
    incumbentSince: position.incumbentSince.toISOString(),
    nextTurnoverAt: position.nextTurnoverAt.toISOString(),
    benchmarks: {
      verifiedOutput: position.baselineOutputUnits,
      reliabilityPct: position.baselineReliabilityPct,
      attendanceDays: position.baselineAttendanceDays,
    },
    performance,
    level: nextLevel,
    promoted,
    promotedAt: promotion?.promotedAt?.toISOString() ?? null,
  };
}

export async function startCareerWorkSession(
  tx: DbTx,
  input: CareerPositionSpec & { userId: string; eventKey: string },
  now = new Date(),
) {
  const position = await ensureCareerPosition(tx, input, now);
  await tx.insert(careerWorkEventsTable).values({
    eventKey: input.eventKey,
    positionKey: position.positionKey,
    userId: input.userId,
    status: "started",
    startedAt: now,
  }).onConflictDoNothing({ target: careerWorkEventsTable.eventKey });
  return position;
}

export async function completeCareerWorkSession(
  tx: DbTx,
  input: CareerPositionSpec & { userId: string; eventKey: string; outputUnits: number },
  now = new Date(),
) {
  const position = await ensureCareerPosition(tx, input, now);
  const [event] = await tx.select().from(careerWorkEventsTable)
    .where(and(
      eq(careerWorkEventsTable.eventKey, input.eventKey),
      eq(careerWorkEventsTable.positionKey, position.positionKey),
      eq(careerWorkEventsTable.userId, input.userId),
    )).for("update").limit(1);
  if (event?.status === "started") {
    await tx.update(careerWorkEventsTable).set({
      status: "completed",
      outputUnits: Math.max(1, Math.trunc(input.outputUnits)),
      completedAt: now,
    }).where(eq(careerWorkEventsTable.id, event.id));
  }
  return evaluatePosition(tx, position, input.userId, now);
}

export async function recordVerifiedCareerWork(
  tx: DbTx,
  input: CareerPositionSpec & {
    userId: string;
    eventKey: string;
    outputUnits: number;
    startedAt?: Date;
  },
  now = new Date(),
) {
  const position = await ensureCareerPosition(tx, input, now);
  await tx.insert(careerWorkEventsTable).values({
    eventKey: input.eventKey,
    positionKey: position.positionKey,
    userId: input.userId,
    status: "completed",
    outputUnits: Math.max(1, Math.trunc(input.outputUnits)),
    startedAt: input.startedAt ?? now,
    completedAt: now,
  }).onConflictDoNothing({ target: careerWorkEventsTable.eventKey });
  return evaluatePosition(tx, position, input.userId, now);
}

export async function careerPositionForTowerRole(
  tx: DbTx,
  userId: string,
  role: string,
  now = new Date(),
) {
  const validRole = ["operations", "maintenance", "security"].includes(role);
  if (!validRole) return null;
  const spec = {
    employerKey: "pablo-corp",
    positionKey: `pablo-corp:tower:${role}`,
    title: {
      operations: "Tower Operations",
      maintenance: "Tower Maintenance",
      security: "Tower Security",
    }[role]!,
    department: "PABLO CORP / SHADOW TOWER",
  };
  const position = await ensureCareerPosition(tx, spec, now);
  const [promotion] = await tx.select().from(careerPromotionsTable).where(and(
    eq(careerPromotionsTable.employerKey, spec.employerKey),
    eq(careerPromotionsTable.positionKey, spec.positionKey),
    eq(careerPromotionsTable.userId, userId),
  )).limit(1);
  return { spec, position, level: promotion?.level ?? 1 };
}

export function careerEventId(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}
