import { pgTable, serial, varchar, text, integer, timestamp, jsonb, primaryKey, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Classroom-scoped roles are SEPARATE from org roles. The classroom creator and
// org owners/admins resolve to "teacher"; everyone who joins is a "student".
export const CLASSROOM_ROLES = ["teacher", "student"] as const;
export type ClassroomRole = (typeof CLASSROOM_ROLES)[number];

export const classroomsTable = pgTable("classrooms", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  joinCode: varchar("join_code", { length: 12 }).notNull().unique(),
  ownerUserId: varchar("owner_user_id").notNull(),
  orgId: integer("org_id"),
  liveActive: boolean("live_active").notNull().default(false),
  liveStartedAt: timestamp("live_started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("classrooms_owner_idx").on(t.ownerUserId),
  index("classrooms_org_idx").on(t.orgId),
]);

export type Classroom = typeof classroomsTable.$inferSelect;

export const classroomMembersTable = pgTable("classroom_members", {
  classroomId: integer("classroom_id").notNull().references(() => classroomsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("student"),
  displayName: varchar("display_name", { length: 120 }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.classroomId, t.userId] }),
  index("classroom_members_user_idx").on(t.userId),
  index("classroom_members_classroom_idx").on(t.classroomId),
]);

export type ClassroomMember = typeof classroomMembersTable.$inferSelect;

export const classroomLessonsTable = pgTable("classroom_lessons", {
  id: serial("id").primaryKey(),
  classroomId: integer("classroom_id").notNull().references(() => classroomsTable.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body"),
  resourceUrl: varchar("resource_url", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("classroom_lessons_classroom_idx").on(t.classroomId),
]);

export const insertClassroomLessonSchema = createInsertSchema(classroomLessonsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type ClassroomLesson = typeof classroomLessonsTable.$inferSelect;

export const classroomSubmissionsTable = pgTable("classroom_submissions", {
  id: serial("id").primaryKey(),
  classroomId: integer("classroom_id").notNull().references(() => classroomsTable.id, { onDelete: "cascade" }),
  lessonId: integer("lesson_id").references(() => classroomLessonsTable.id, { onDelete: "set null" }),
  studentUserId: varchar("student_user_id").notNull(),
  studentName: varchar("student_name", { length: 120 }),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  // AI written-word / plagiarism check results (null until a teacher runs the checker)
  aiScore: integer("ai_score"),
  aiReasoning: text("ai_reasoning"),
  aiFlagged: jsonb("ai_flagged").$type<string[]>(),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  checkedByUserId: varchar("checked_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("classroom_submissions_classroom_idx").on(t.classroomId),
  index("classroom_submissions_student_idx").on(t.studentUserId),
]);

export type ClassroomSubmission = typeof classroomSubmissionsTable.$inferSelect;
