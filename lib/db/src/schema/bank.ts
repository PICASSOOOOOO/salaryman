import { pgTable, serial, varchar, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bankAccountsTable = pgTable(
  "bank_accounts",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    // Null is reserved for the internal cash wallet; every visible bank
    // account receives a unique 10-digit number when it is opened.
    accountNumber: varchar("account_number", { length: 32 }),
    balance: integer("balance").notNull().default(0),
    currency: varchar("currency", { length: 8 }).notNull().default("FIAT"),
    apyBps: integer("apy_bps").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("bank_accounts_user_idx").on(t.userId),
    accountNumberUnique: uniqueIndex("bank_accounts_account_number_unique").on(t.accountNumber),
  }),
);

export const bankTransactionsTable = pgTable(
  "bank_transactions",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    accountId: integer("account_id").notNull(),
    counterpartyAccountId: integer("counterparty_account_id"),
    kind: varchar("kind", { length: 24 }).notNull(),
    description: text("description").notNull().default(""),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("bank_tx_user_idx").on(t.userId),
    acctIdx: index("bank_tx_account_idx").on(t.accountId),
  }),
);

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccountsTable.$inferSelect;

export const insertBankTransactionSchema = createInsertSchema(bankTransactionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;
