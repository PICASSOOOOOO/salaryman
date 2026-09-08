CREATE TABLE IF NOT EXISTS "business_transactions" (
        "id" serial PRIMARY KEY NOT NULL,
        "player_name" varchar(32) NOT NULL,
        "company_name" varchar(80),
        "category" varchar(32) DEFAULT 'general' NOT NULL,
        "description" text NOT NULL,
        "amount" integer NOT NULL,
        "balance_after" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "business_snapshots" (
        "id" serial PRIMARY KEY NOT NULL,
        "player_name" varchar(32) NOT NULL,
        "user_id" varchar(256),
        "slot_index" integer DEFAULT 0 NOT NULL,
        "balance" integer DEFAULT 0 NOT NULL,
        "salary" integer DEFAULT 0 NOT NULL,
        "business_profit" integer DEFAULT 0 NOT NULL,
        "government_base_salary" integer DEFAULT 0 NOT NULL,
        "real_salary_amount" integer DEFAULT 0 NOT NULL,
        "income_type" varchar(16) DEFAULT 'unemployed' NOT NULL,
        "data" jsonb,
        "snapshot_reason" varchar(64) DEFAULT 'auto' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
