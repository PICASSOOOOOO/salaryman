import {
  db,
  timeEntriesTable,
  businessTasksTable,
  announcementsTable,
  type BusinessTask,
  type TimeEntry,
  type Announcement,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

// ─── Business Ops service ────────────────────────────────────────────────────
// Callable service functions extracted from routes/business-ops.ts so BOTH the
// manual HTTP routes and the Business Ops autopilot handler perform their work
// through the SAME logic. Never re-implement these inline — see
// lib/autopilot/CONTRACT.md.

// ── Tasks ──

export async function listBusinessTasks(userId: string): Promise<BusinessTask[]> {
  return db
    .select()
    .from(businessTasksTable)
    .where(eq(businessTasksTable.userId, userId))
    .orderBy(desc(businessTasksTable.createdAt));
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  dueDate?: string | null;
  project?: string;
  tags?: string;
}

export async function createBusinessTask(userId: string, input: CreateTaskInput): Promise<BusinessTask> {
  const [row] = await db
    .insert(businessTasksTable)
    .values({
      userId,
      title: input.title,
      description: input.description || "",
      status: input.status || "todo",
      priority: input.priority || "medium",
      assignee: input.assignee || "",
      dueDate: input.dueDate || null,
      project: input.project || "",
      tags: input.tags || "",
    })
    .returning();
  return row;
}

const TASK_UPDATE_FIELDS = ["title", "description", "status", "priority", "assignee", "dueDate", "project", "tags"] as const;

/** Update a task. Mirrors the manual PUT /business/tasks/:id behavior exactly. */
export async function updateBusinessTask(
  userId: string,
  id: number,
  body: Record<string, unknown>
): Promise<BusinessTask | null> {
  const updates: Record<string, unknown> = {};
  for (const k of TASK_UPDATE_FIELDS) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (body.status === "done" && !body.completedAt) updates.completedAt = new Date();
  if (body.status && body.status !== "done") updates.completedAt = null;
  const [row] = await db
    .update(businessTasksTable)
    .set(updates)
    .where(and(eq(businessTasksTable.id, id), eq(businessTasksTable.userId, userId)))
    .returning();
  return row ?? null;
}

// ── Time entries ──

export async function listTimeEntries(userId: string): Promise<TimeEntry[]> {
  return db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.userId, userId))
    .orderBy(desc(timeEntriesTable.date), desc(timeEntriesTable.clockIn));
}

const TIME_ENTRY_UPDATE_FIELDS = [
  "employeeName", "date", "clockIn", "clockOut", "hoursWorked",
  "hourlyRate", "project", "description", "billable", "status",
] as const;

/** Update a time entry. Mirrors the manual PUT /business/time-entries/:id. */
export async function updateTimeEntry(
  userId: string,
  id: number,
  body: Record<string, unknown>
): Promise<TimeEntry | null> {
  const updates: Record<string, unknown> = {};
  for (const k of TIME_ENTRY_UPDATE_FIELDS) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  const [row] = await db
    .update(timeEntriesTable)
    .set(updates)
    .where(and(eq(timeEntriesTable.id, id), eq(timeEntriesTable.userId, userId)))
    .returning();
  return row ?? null;
}

// ── Announcements ──

export async function listAnnouncements(userId: string): Promise<Announcement[]> {
  return db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.userId, userId))
    .orderBy(desc(announcementsTable.pinned), desc(announcementsTable.createdAt));
}

export interface CreateAnnouncementInput {
  title: string;
  content?: string;
  category?: string;
  pinned?: boolean;
  authorName?: string;
}

/** Create an announcement. Mirrors the manual POST /business/announcements. */
export async function createAnnouncement(userId: string, input: CreateAnnouncementInput): Promise<Announcement> {
  const [row] = await db
    .insert(announcementsTable)
    .values({
      userId,
      title: input.title,
      content: input.content || "",
      category: input.category || "general",
      pinned: input.pinned || false,
      authorName: input.authorName || "",
    })
    .returning();
  return row;
}
