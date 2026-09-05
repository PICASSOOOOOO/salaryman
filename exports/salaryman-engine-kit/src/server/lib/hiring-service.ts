import {
  db,
  jobListingsTable,
  applicantsTable,
  staffTable,
  stageTransitionsTable,
  usersTable,
  type JobListing,
  type Applicant,
  type Staff,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { fireWebhook } from "./webhook";
import { fireDiscordWebhook } from "./discord-webhook";

// ─── Hiring service ──────────────────────────────────────────────────────────
// Callable service functions extracted from routes/hiring.ts so BOTH the manual
// HTTP routes and the Business Ops autopilot handler drive the hiring pipeline
// through the SAME logic (stage transitions, webhooks, auto-staff-on-hire).
// Never re-implement these inline — see lib/autopilot/CONTRACT.md.

export const VALID_JOB_STATUSES = ["open", "closed", "filled"] as const;
export const VALID_APPLICANT_STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;

export interface ServiceError {
  error: string;
  status: number;
}

function isError<T>(r: T | ServiceError): r is ServiceError {
  return typeof r === "object" && r !== null && "error" in r && "status" in r;
}
export { isError as isServiceError };

// ── Job listings ──

export async function listJobListings(userId: string): Promise<JobListing[]> {
  return db
    .select()
    .from(jobListingsTable)
    .where(eq(jobListingsTable.userId, userId))
    .orderBy(sql`${jobListingsTable.createdAt} DESC`);
}

export interface CreateJobInput {
  title?: string;
  description?: string;
  requirements?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  status?: string;
}

export async function createJobListing(userId: string, body: CreateJobInput): Promise<JobListing | ServiceError> {
  if (!body.title?.trim()) return { error: "Title required", status: 400 };
  const [record] = await db
    .insert(jobListingsTable)
    .values({
      userId,
      title: body.title.trim(),
      description: body.description ?? "",
      requirements: body.requirements ?? "",
      salaryMin: body.salaryMin != null ? Number(body.salaryMin) : null,
      salaryMax: body.salaryMax != null ? Number(body.salaryMax) : null,
      status: (VALID_JOB_STATUSES as readonly string[]).includes(body.status ?? "") ? body.status! : "open",
    })
    .returning();
  return record;
}

// ── Applicants ──

export async function listApplicants(userId: string, jobId?: number): Promise<Applicant[]> {
  const conditions = [eq(applicantsTable.userId, userId)];
  if (jobId) conditions.push(eq(applicantsTable.jobId, jobId));
  return db
    .select()
    .from(applicantsTable)
    .where(and(...conditions))
    .orderBy(sql`${applicantsTable.createdAt} DESC`);
}

export interface CreateApplicantInput {
  jobId?: number;
  name?: string;
  email?: string;
  resumeNotes?: string;
  source?: string;
}

export async function createApplicant(userId: string, body: CreateApplicantInput): Promise<Applicant | ServiceError> {
  if (!body.jobId || !body.name?.trim()) return { error: "jobId and name required", status: 400 };
  const [job] = await db
    .select()
    .from(jobListingsTable)
    .where(and(eq(jobListingsTable.id, Number(body.jobId)), eq(jobListingsTable.userId, userId)));
  if (!job) return { error: "Job not found", status: 404 };
  const [record] = await db
    .insert(applicantsTable)
    .values({
      jobId: Number(body.jobId),
      userId,
      name: body.name.trim(),
      email: body.email ?? "",
      resumeNotes: body.resumeNotes ?? "",
      source: body.source ?? "",
      stage: "applied",
    })
    .returning();

  void fireWebhook(userId, "new_applicant", {
    applicant: { id: record.id, name: record.name, email: record.email, jobId: record.jobId },
  });
  void fireDiscordWebhook(userId, "new_applicant", {
    applicant: { id: record.id, name: record.name, email: record.email, jobId: record.jobId },
  });

  return record;
}

export interface UpdateApplicantInput {
  stage?: string;
  name?: string;
  email?: string;
  resumeNotes?: string;
  source?: string;
}

/**
 * Update an applicant — including a stage transition that records history, fires
 * webhooks, and auto-creates a staff member when moved to "hired". Mirrors the
 * manual PUT /tools/hiring/applicants/:id behavior exactly.
 */
export async function updateApplicant(
  userId: string,
  id: number,
  body: UpdateApplicantInput
): Promise<Applicant | ServiceError> {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.email !== undefined) updates.email = body.email;
  if (body.resumeNotes !== undefined) updates.resumeNotes = body.resumeNotes;
  if (body.source !== undefined) updates.source = body.source;

  const [current] = await db
    .select()
    .from(applicantsTable)
    .where(and(eq(applicantsTable.id, id), eq(applicantsTable.userId, userId)));
  if (!current) return { error: "Not found", status: 404 };

  if (body.stage !== undefined && body.stage !== current.stage && (VALID_APPLICANT_STAGES as readonly string[]).includes(body.stage)) {
    updates.stage = body.stage;
    updates.stageUpdatedAt = new Date();

    await db.insert(stageTransitionsTable).values({
      applicantId: id,
      fromStage: current.stage,
      toStage: body.stage,
    });

    void fireWebhook(userId, "applicant_stage_changed", {
      applicant: { id, name: current.name, email: current.email, jobId: current.jobId, fromStage: current.stage, toStage: body.stage },
    });
    void fireDiscordWebhook(userId, "applicant_stage_changed", {
      applicant: { id, name: current.name, email: current.email, jobId: current.jobId, fromStage: current.stage, toStage: body.stage },
    });
  }

  // A no-op update (e.g. an unchanged or invalid-only stage with no other
  // fields) leaves `updates` empty; drizzle rejects an empty .set() with
  // "No values to set", which would 500 BOTH the manual route and the autopilot.
  // Treat it as a no-op and return the current row unchanged.
  if (Object.keys(updates).length === 0) return current;

  const [updated] = await db
    .update(applicantsTable)
    .set(updates)
    .where(and(eq(applicantsTable.id, id), eq(applicantsTable.userId, userId)))
    .returning();
  if (!updated) return { error: "Not found", status: 404 };

  if (body.stage === "hired") {
    const existing = await db
      .select()
      .from(staffTable)
      .where(and(eq(staffTable.applicantId, id), eq(staffTable.userId, userId)));
    if (existing.length === 0) {
      const [job] = await db.select().from(jobListingsTable).where(eq(jobListingsTable.id, updated.jobId));
      await db.insert(staffTable).values({
        userId,
        applicantId: id,
        name: updated.name,
        role: job?.title ?? "",
        salary: job?.salaryMin ?? null,
        status: "active",
        startDate: new Date(),
      });

      void fireWebhook(userId, "new_hire", { hire: { name: updated.name, role: job?.title ?? "", email: updated.email } });
      void fireDiscordWebhook(userId, "new_hire", { hire: { name: updated.name, role: job?.title ?? "", email: updated.email } });
    }
  }

  return updated;
}

// ── Staff ──

export async function listStaff(userId: string): Promise<Staff[]> {
  return db
    .select()
    .from(staffTable)
    .where(eq(staffTable.userId, userId))
    .orderBy(sql`${staffTable.createdAt} DESC`);
}

export async function countActiveStaff(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(staffTable)
    .where(and(eq(staffTable.userId, userId), eq(staffTable.status, "active")));
  return row?.count ?? 0;
}

export async function findLinkedUserId(email: string): Promise<string | null> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return null;
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${cleaned}`);
  return u?.id ?? null;
}
