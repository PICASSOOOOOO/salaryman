CREATE TABLE "balance_sheet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar(20) NOT NULL,
	"category" varchar(80) DEFAULT 'other' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"reference_id" integer,
	"reference_type" varchar(40),
	"tx_date" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"vendor" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"due_date" varchar(20) NOT NULL,
	"category" varchar(80) DEFAULT 'other' NOT NULL,
	"recurrence" varchar(30) DEFAULT 'one-time' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"proof_path" varchar(500),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"category" varchar(80) DEFAULT 'other' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expense_date" varchar(20) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"receipt_path" varchar(500),
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"pay_period_start" varchar(20) NOT NULL,
	"pay_period_end" varchar(20) NOT NULL,
	"run_date" varchar(20) NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"breakdown" json DEFAULT '[]'::json NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "real_employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" varchar(200) DEFAULT '' NOT NULL,
	"pay_rate" numeric(12, 2) DEFAULT '0' NOT NULL,
	"pay_frequency" varchar(20) DEFAULT 'monthly' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "balance_sheet_tx_user_id_idx" ON "balance_sheet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "balance_sheet_tx_type_idx" ON "balance_sheet_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "balance_sheet_tx_date_idx" ON "balance_sheet_transactions" USING btree ("tx_date");--> statement-breakpoint
CREATE INDEX "bills_user_id_idx" ON "bills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bills_status_idx" ON "bills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bills_due_date_idx" ON "bills" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "business_expenses_user_id_idx" ON "business_expenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "business_expenses_category_idx" ON "business_expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "business_expenses_date_idx" ON "business_expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "payroll_runs_user_id_idx" ON "payroll_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "real_employees_user_id_idx" ON "real_employees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "real_employees_status_idx" ON "real_employees" USING btree ("status");