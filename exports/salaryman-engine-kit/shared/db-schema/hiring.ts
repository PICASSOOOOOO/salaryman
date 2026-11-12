import { pgTable, serial, varchar, text, integer, timestamp, index, boolean, numeric, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

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

export const departmentsTable = pgTable("hiring_departments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull().default(""),
  color: varchar("color", { length: 20 }).notNull().default("sky"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("hiring_departments_user_id_idx").on(table.userId),
]);

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({ id: true, createdAt: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departmentsTable.$inferSelect;

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
  assignedOffice: varchar("assigned_office", { length: 200 }).notNull().default(""),
  assignedDesk: varchar("assigned_desk", { length: 100 }).notNull().default(""),
  assignedTerminal: varchar("assigned_terminal", { length: 100 }).notNull().default(""),
  email: varchar("email", { length: 200 }).notNull().default(""),
  phone: varchar("phone", { length: 30 }).notNull().default(""),
  linkedUserId: varchar("linked_user_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("staff_user_id_idx").on(table.userId),
  index("staff_status_idx").on(table.status),
  index("staff_applicant_id_idx").on(table.applicantId),
  index("staff_linked_user_id_idx").on(table.linkedUserId),
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

// ── Job Board ─────────────────────────────────────────────────────────────────
// Org-controlled labor market: orgs post openings, players browse + apply,
// org admins extend offers, players accept/decline. Accepted offers become
// job_contracts that drive payroll and show the employer badge on the player's
// profile.

export const JOB_POSTING_STATUSES = ["open", "filled", "closed"] as const;
export type JobPostingStatus = (typeof JOB_POSTING_STATUSES)[number];

export const JOB_CONTRACT_STATUSES = ["pending", "active", "terminated", "declined"] as const;
export type JobContractStatus = (typeof JOB_CONTRACT_STATUSES)[number];

export const jobPostingsTable = pgTable("job_postings", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  industry: varchar("industry", { length: 80 }).notNull().default(""),
  payRateFiat: numeric("pay_rate_fiat", { precision: 14, scale: 2 }).notNull().default("0"),
  requiredSkillTier: integer("required_skill_tier").notNull().default(0),
  slots: integer("slots").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  description: text("description").notNull().default(""),
  cityId: varchar("city_id", { length: 60 }),
  createdByUserId: varchar("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("job_postings_org_id_idx").on(t.orgId),
  index("job_postings_status_idx").on(t.status),
  index("job_postings_industry_idx").on(t.industry),
]);

export const insertJobPostingSchema = createInsertSchema(jobPostingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJobPosting = z.infer<typeof insertJobPostingSchema>;
export type JobPosting = typeof jobPostingsTable.$inferSelect;

export const jobApplicationsTable = pgTable("job_applications", {
  id: serial("id").primaryKey(),
  postingId: integer("posting_id").notNull().references(() => jobPostingsTable.id, { onDelete: "cascade" }),
  applicantUserId: varchar("applicant_user_id").notNull(),
  coverNote: text("cover_note").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("job_apps_posting_id_idx").on(t.postingId),
  index("job_apps_applicant_user_id_idx").on(t.applicantUserId),
  uniqueIndex("job_apps_posting_user_unique_idx").on(t.postingId, t.applicantUserId),
]);

export const insertJobApplicationSchema = createInsertSchema(jobApplicationsTable).omit({ id: true, createdAt: true });
export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type JobApplication = typeof jobApplicationsTable.$inferSelect;

export const jobContractsTable = pgTable("job_contracts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  postingId: integer("posting_id").references(() => jobPostingsTable.id, { onDelete: "set null" }),
  roleTitle: varchar("role_title", { length: 200 }).notNull(),
  payRateFiat: numeric("pay_rate_fiat", { precision: 14, scale: 2 }).notNull().default("0"),
  rightsJson: jsonb("rights_json"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  terminatedBy: varchar("terminated_by"),
  severancePaid: boolean("severance_paid").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("job_contracts_user_id_idx").on(t.userId),
  index("job_contracts_org_id_idx").on(t.orgId),
  index("job_contracts_status_idx").on(t.status),
]);

export const insertJobContractSchema = createInsertSchema(jobContractsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJobContract = z.infer<typeof insertJobContractSchema>;
export type JobContract = typeof jobContractsTable.$inferSelect;
