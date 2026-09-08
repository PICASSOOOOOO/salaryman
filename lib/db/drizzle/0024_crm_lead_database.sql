CREATE TABLE IF NOT EXISTS "lead_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "import_id" integer,
  "is_locked" boolean DEFAULT false NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(64) DEFAULT '' NOT NULL,
  "email" varchar(255) DEFAULT '' NOT NULL,
  "company" varchar(255) DEFAULT '' NOT NULL,
  "job_title" varchar(255) DEFAULT '' NOT NULL,
  "source" varchar(64) DEFAULT 'manual' NOT NULL,
  "status" varchar(32) DEFAULT 'new' NOT NULL,
  "assigned_user_id" varchar(64),
  "pablo_notes_json" text,
  "last_called_at" timestamp,
  "call_count" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" varchar(64) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "user_id" varchar(64) NOT NULL,
  "user_name" varchar(255),
  "note" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_imports" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "uploaded_by_user_id" varchar(64) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "total_records" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "errors_json" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
