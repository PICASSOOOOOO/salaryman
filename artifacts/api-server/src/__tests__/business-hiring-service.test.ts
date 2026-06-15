import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import {
  db,
  jobListingsTable,
  applicantsTable,
  staffTable,
  stageTransitionsTable,
  businessTasksTable,
  timeEntriesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  createJobListing,
  createApplicant,
  updateApplicant,
  countActiveStaff,
  isServiceError,
} from "../lib/hiring-service";
import {
  createBusinessTask,
  updateBusinessTask,
  updateTimeEntry,
} from "../lib/business-ops-service";

// Integration coverage for the SHARED service functions extracted from
// routes/hiring.ts and routes/business-ops.ts. Both the manual HTTP screens and
// the Business Ops autopilot drive these exact functions, so a regression here
// silently breaks BOTH flows. We hit the real dev DB scoped by a unique
// synthetic userId per file (no FK on user_id columns) and clean up after.
//
// The hiring webhooks (fireWebhook/fireDiscordWebhook) short-circuit when no
// webhook row is configured for the user — our throwaway user has none, so no
// network calls or charges ever happen.

const TEST_USER = `test-bizhire-${randomUUID()}`;

afterAll(async () => {
  // Tables with a user_id can be wiped directly. staff.applicantId is
  // ON DELETE SET NULL so staff must go before applicants; stage_transitions
  // cascades off applicants, which cascades off job_listings.
  await Promise.allSettled([
    db.delete(staffTable).where(eq(staffTable.userId, TEST_USER)),
    db.delete(businessTasksTable).where(eq(businessTasksTable.userId, TEST_USER)),
    db.delete(timeEntriesTable).where(eq(timeEntriesTable.userId, TEST_USER)),
  ]);
  await db.delete(applicantsTable).where(eq(applicantsTable.userId, TEST_USER));
  await db.delete(jobListingsTable).where(eq(jobListingsTable.userId, TEST_USER));
});

async function seedJob(overrides: { title?: string; salaryMin?: number | null } = {}) {
  const res = await createJobListing(TEST_USER, {
    title: overrides.title ?? "Senior Engineer",
    salaryMin: overrides.salaryMin ?? 120000,
    salaryMax: 160000,
  });
  if (isServiceError(res)) throw new Error(`seedJob failed: ${res.error}`);
  return res;
}

async function seedApplicant(jobId: number, name = "Ada Lovelace") {
  const res = await createApplicant(TEST_USER, { jobId, name, email: `${randomUUID()}@example.test` });
  if (isServiceError(res)) throw new Error(`seedApplicant failed: ${res.error}`);
  return res;
}

describe("hiring-service.updateApplicant — stage transitions", () => {
  it("records a stage transition row and stamps stageUpdatedAt on a real stage move", async () => {
    const job = await seedJob();
    const applicant = await seedApplicant(job.id);
    const before = applicant.stageUpdatedAt;

    const updated = await updateApplicant(TEST_USER, applicant.id, { stage: "screening" });
    expect(isServiceError(updated)).toBe(false);
    if (isServiceError(updated)) return;

    expect(updated.stage).toBe("screening");
    expect(new Date(updated.stageUpdatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());

    const transitions = await db
      .select()
      .from(stageTransitionsTable)
      .where(eq(stageTransitionsTable.applicantId, applicant.id));
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ fromStage: "applied", toStage: "screening" });
  });

  it("does NOT record a transition when the stage is unchanged or invalid", async () => {
    const job = await seedJob();
    const applicant = await seedApplicant(job.id);

    // same stage (applied → applied) — no-op transition-wise
    await updateApplicant(TEST_USER, applicant.id, { stage: "applied" });
    // invalid stage — ignored by VALID_APPLICANT_STAGES guard
    const bogus = await updateApplicant(TEST_USER, applicant.id, { stage: "promoted" });
    expect(isServiceError(bogus)).toBe(false);

    const transitions = await db
      .select()
      .from(stageTransitionsTable)
      .where(eq(stageTransitionsTable.applicantId, applicant.id));
    expect(transitions).toHaveLength(0);

    const [row] = await db.select().from(applicantsTable).where(eq(applicantsTable.id, applicant.id));
    expect(row.stage).toBe("applied"); // invalid stage never applied
  });

  it("updates plain profile fields without a stage move", async () => {
    const job = await seedJob();
    const applicant = await seedApplicant(job.id);

    const updated = await updateApplicant(TEST_USER, applicant.id, {
      name: "Grace Hopper",
      email: "grace@example.test",
      resumeNotes: "COBOL pioneer",
    });
    expect(isServiceError(updated)).toBe(false);
    if (isServiceError(updated)) return;
    expect(updated.name).toBe("Grace Hopper");
    expect(updated.email).toBe("grace@example.test");
    expect(updated.stage).toBe("applied");

    const transitions = await db
      .select()
      .from(stageTransitionsTable)
      .where(eq(stageTransitionsTable.applicantId, applicant.id));
    expect(transitions).toHaveLength(0);
  });

  it("returns a 404 ServiceError for an unknown applicant or wrong owner", async () => {
    const res = await updateApplicant(TEST_USER, 999999999, { stage: "screening" });
    expect(isServiceError(res)).toBe(true);
    if (isServiceError(res)) expect(res.status).toBe(404);

    // Owned by another user → not visible → 404
    const job = await seedJob();
    const applicant = await seedApplicant(job.id);
    const otherUser = await updateApplicant(`other-${randomUUID()}`, applicant.id, { stage: "screening" });
    expect(isServiceError(otherUser)).toBe(true);
    if (isServiceError(otherUser)) expect(otherUser.status).toBe(404);
  });
});

describe("hiring-service.updateApplicant — applied→hired auto-staff creation", () => {
  it("auto-creates an active staff row carrying the job title + salary on hire", async () => {
    const job = await seedJob({ title: "Platform Lead", salaryMin: 145000 });
    const applicant = await seedApplicant(job.id, "Linus Torvalds");

    expect(await countActiveStaff(TEST_USER)).toBe(0);

    const hired = await updateApplicant(TEST_USER, applicant.id, { stage: "hired" });
    expect(isServiceError(hired)).toBe(false);
    if (isServiceError(hired)) return;
    expect(hired.stage).toBe("hired");

    const staff = await db
      .select()
      .from(staffTable)
      .where(and(eq(staffTable.userId, TEST_USER), eq(staffTable.applicantId, applicant.id)));
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({
      name: "Linus Torvalds",
      role: "Platform Lead", // pulled from the job listing
      salary: 145000, // job.salaryMin
      status: "active",
    });
    expect(await countActiveStaff(TEST_USER)).toBe(1);

    // The applied→hired transition is also recorded in history.
    const transitions = await db
      .select()
      .from(stageTransitionsTable)
      .where(eq(stageTransitionsTable.applicantId, applicant.id));
    expect(transitions.map((t) => t.toStage)).toContain("hired");
  });

  it("is idempotent — re-hiring an already-staffed applicant does not duplicate the staff row", async () => {
    const job = await seedJob();
    const applicant = await seedApplicant(job.id, "Margaret Hamilton");

    await updateApplicant(TEST_USER, applicant.id, { stage: "hired" });
    // Move away and back to hired to re-trigger the hire branch.
    await updateApplicant(TEST_USER, applicant.id, { stage: "offer" });
    await updateApplicant(TEST_USER, applicant.id, { stage: "hired" });

    const staff = await db
      .select()
      .from(staffTable)
      .where(and(eq(staffTable.userId, TEST_USER), eq(staffTable.applicantId, applicant.id)));
    expect(staff).toHaveLength(1); // never duplicated
  });
});

describe("business-ops-service.updateBusinessTask — status transitions", () => {
  it("stamps completedAt when a task is marked done and clears it when reopened", async () => {
    const task = await createBusinessTask(TEST_USER, { title: "Ship the thing" });
    expect(task.status).toBe("todo");
    expect(task.completedAt).toBeNull();

    const done = await updateBusinessTask(TEST_USER, task.id, { status: "done" });
    expect(done).not.toBeNull();
    expect(done!.status).toBe("done");
    expect(done!.completedAt).not.toBeNull();

    const reopened = await updateBusinessTask(TEST_USER, task.id, { status: "in_progress" });
    expect(reopened).not.toBeNull();
    expect(reopened!.status).toBe("in_progress");
    expect(reopened!.completedAt).toBeNull(); // reopening clears the completion stamp
  });

  it("updates allow-listed fields and ignores unknown keys", async () => {
    const task = await createBusinessTask(TEST_USER, { title: "Draft" });
    const updated = await updateBusinessTask(TEST_USER, task.id, {
      title: "Final",
      priority: "high",
      assignee: "Pablo Jr",
      bogusField: "ignored",
    });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Final");
    expect(updated!.priority).toBe("high");
    expect(updated!.assignee).toBe("Pablo Jr");
    expect((updated as Record<string, unknown>).bogusField).toBeUndefined();
  });

  it("returns null for an unknown task or one owned by another user", async () => {
    expect(await updateBusinessTask(TEST_USER, 999999999, { status: "done" })).toBeNull();

    const task = await createBusinessTask(TEST_USER, { title: "Mine" });
    expect(await updateBusinessTask(`other-${randomUUID()}`, task.id, { status: "done" })).toBeNull();
  });
});

describe("business-ops-service.updateTimeEntry — closing active sessions", () => {
  async function seedActiveEntry() {
    const [row] = await db
      .insert(timeEntriesTable)
      .values({
        userId: TEST_USER,
        employeeName: "Worker",
        date: "2026-06-14",
        clockIn: "09:00",
        status: "active",
      })
      .returning();
    return row;
  }

  it("closes an active entry by setting clockOut + status + hours", async () => {
    const entry = await seedActiveEntry();
    expect(entry.status).toBe("active");
    expect(entry.clockOut).toBeNull();

    const closed = await updateTimeEntry(TEST_USER, entry.id, {
      clockOut: "17:00",
      status: "completed",
      hoursWorked: "8.00",
    });
    expect(closed).not.toBeNull();
    expect(closed!.status).toBe("completed");
    expect(closed!.clockOut).toBe("17:00");
    expect(Number(closed!.hoursWorked)).toBe(8);
  });

  it("only writes allow-listed fields and ignores unknown keys", async () => {
    const entry = await seedActiveEntry();
    const updated = await updateTimeEntry(TEST_USER, entry.id, {
      project: "Apollo",
      bogusField: "ignored",
    });
    expect(updated).not.toBeNull();
    expect(updated!.project).toBe("Apollo");
    expect((updated as Record<string, unknown>).bogusField).toBeUndefined();
  });

  it("returns null for an unknown entry or one owned by another user", async () => {
    expect(await updateTimeEntry(TEST_USER, 999999999, { status: "completed" })).toBeNull();

    const entry = await seedActiveEntry();
    expect(await updateTimeEntry(`other-${randomUUID()}`, entry.id, { status: "completed" })).toBeNull();
  });
});
