import { pgTable, serial, varchar, text, integer, timestamp, json, index, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const realEmployeesTable = pgTable("real_employees", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  role: varchar("role", { length: 200 }).notNull().default(""),
  payRate: numeric("pay_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  payFrequency: varchar("pay_frequency", { length: 20 }).notNull().default("monthly"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("real_employees_user_id_idx").on(t.userId),
  index("real_employees_status_idx").on(t.status),
]);

export const insertRealEmployeeSchema = createInsertSchema(realEmployeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRealEmployee = z.infer<typeof insertRealEmployeeSchema>;
export type RealEmployee = typeof realEmployeesTable.$inferSelect;

export const payrollRunsTable = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  payPeriodStart: varchar("pay_period_start", { length: 20 }).notNull(),
  payPeriodEnd: varchar("pay_period_end", { length: 20 }).notNull(),
  runDate: varchar("run_date", { length: 20 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  breakdown: json("breakdown").notNull().default([]),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_runs_user_id_idx").on(t.userId),
]);

export const insertPayrollRunSchema = createInsertSchema(payrollRunsTable).omit({ id: true, createdAt: true });
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRun = typeof payrollRunsTable.$inferSelect;

export const billsTable = pgTable("bills", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  vendor: varchar("vendor", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: varchar("due_date", { length: 20 }).notNull(),
  category: varchar("category", { length: 80 }).notNull().default("other"),
  recurrence: varchar("recurrence", { length: 30 }).notNull().default("one-time"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  proofPath: varchar("proof_path", { length: 500 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("bills_user_id_idx").on(t.userId),
  index("bills_status_idx").on(t.status),
  index("bills_due_date_idx").on(t.dueDate),
]);

export const insertBillSchema = createInsertSchema(billsTable).omit({ id: true, createdAt: true, updatedAt: true, paidAt: true });
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof billsTable.$inferSelect;

export const businessExpensesTable = pgTable("business_expenses", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  category: varchar("category", { length: 80 }).notNull().default("other"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  expenseDate: varchar("expense_date", { length: 20 }).notNull(),
  description: varchar("description", { length: 500 }).notNull().default(""),
  receiptPath: varchar("receipt_path", { length: 500 }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("business_expenses_user_id_idx").on(t.userId),
  index("business_expenses_category_idx").on(t.category),
  index("business_expenses_date_idx").on(t.expenseDate),
]);

export const insertBusinessExpenseSchema = createInsertSchema(businessExpensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusinessExpense = z.infer<typeof insertBusinessExpenseSchema>;
export type BusinessExpense = typeof businessExpensesTable.$inferSelect;

export const balanceSheetTxTable = pgTable("balance_sheet_transactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  category: varchar("category", { length: 80 }).notNull().default("other"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  description: varchar("description", { length: 500 }).notNull().default(""),
  referenceId: integer("reference_id"),
  referenceType: varchar("reference_type", { length: 40 }),
  txDate: varchar("tx_date", { length: 20 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("balance_sheet_tx_user_id_idx").on(t.userId),
  index("balance_sheet_tx_type_idx").on(t.type),
  index("balance_sheet_tx_date_idx").on(t.txDate),
]);

export const insertBalanceSheetTxSchema = createInsertSchema(balanceSheetTxTable).omit({ id: true, createdAt: true });
export type InsertBalanceSheetTx = z.infer<typeof insertBalanceSheetTxSchema>;
export type BalanceSheetTx = typeof balanceSheetTxTable.$inferSelect;
