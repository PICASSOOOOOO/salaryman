import { pgTable, serial, varchar, text, integer, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobListingsTable = pgTable("job_listings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  requirements: text("requirements").notNull().default(""),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("job_listings_user_id_idx").on(table.userId),
  index("job_listings_status_idx").on(table.status),
]);

export const insertJobListingSchema = createInsertSchema(jobListingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJobListing = z.infer<typeof insertJobListingSchema>;
export type JobListing = typeof jobListingsTable.$inferSelect;

export const applicantsTable = pgTable("applicants", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobListingsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 200 }).notNull().default(""),
  resumeNotes: text("resume_notes").notNull().default(""),
  source: varchar("source", { length: 100 }).notNull().default(""),
  stage: varchar("stage", { length: 20 }).notNull().default("applied"),
  stageUpdatedAt: timestamp("stage_updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("applicants_job_id_idx").on(table.jobId),
  index("applicants_user_id_idx").on(table.userId),
  index("applicants_stage_idx").on(table.stage),
]);

export const insertApplicantSchema = createInsertSchema(applicantsTable).omit({ id: true, createdAt: true, stageUpdatedAt: true });
export type InsertApplicant = z.infer<typeof insertApplicantSchema>;
export type Applicant = typeof applicantsTable.$inferSelect;

export const staffTable = pgTable("staff_members", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  applicantId: integer("applicant_id").references(() => applicantsTable.id, { onDelete: "set null" }),
  name: varchar("name", { length: 200 }).notNull(),
  role: varchar("role", { length: 200 }).notNull().default(""),
  department: varchar("department", { length: 100 }).notNull().default(""),
  salary: integer("salary"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp("end_date", { withTimezone: true }),
  offboardingNotes: text("offboarding_notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("staff_user_id_idx").on(table.userId),
  index("staff_status_idx").on(table.status),
  index("staff_applicant_id_idx").on(table.applicantId),
]);

export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staffTable.$inferSelect;

export const stageTransitionsTable = pgTable("stage_transitions", {
  id: serial("id").primaryKey(),
  applicantId: integer("applicant_id").notNull().references(() => applicantsTable.id, { onDelete: "cascade" }),
  fromStage: varchar("from_stage", { length: 20 }).notNull(),
  toStage: varchar("to_stage", { length: 20 }).notNull(),
  transitionedAt: timestamp("transitioned_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("stage_transitions_applicant_id_idx").on(table.applicantId),
]);

export type StageTransition = typeof stageTransitionsTable.$inferSelect;

export const employeePerformanceNotesTable = pgTable("employee_performance_notes", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("perf_notes_staff_id_idx").on(table.staffId),
  index("perf_notes_user_id_idx").on(table.userId),
]);

export const insertEmployeePerformanceNoteSchema = createInsertSchema(employeePerformanceNotesTable).omit({ id: true, createdAt: true });
export type InsertEmployeePerformanceNote = z.infer<typeof insertEmployeePerformanceNoteSchema>;
export type EmployeePerformanceNote = typeof employeePerformanceNotesTable.$inferSelect;

export const onboardingChecklistsTable = pgTable("onboarding_checklists", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  item: varchar("item", { length: 300 }).notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("onboarding_staff_id_idx").on(table.staffId),
  index("onboarding_user_id_idx").on(table.userId),
]);

export const insertOnboardingChecklistSchema = createInsertSchema(onboardingChecklistsTable).omit({ id: true, createdAt: true });
export type InsertOnboardingChecklist = z.infer<typeof insertOnboardingChecklistSchema>;
export type OnboardingChecklist = typeof onboardingChecklistsTable.$inferSelect;
