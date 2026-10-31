CREATE TABLE "org_time_off_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "requester_user_id" varchar(255) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "leave_type" varchar(30) DEFAULT 'vacation' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "reviewer_user_id" varchar(255),
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "org_time_off_date_range_check" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "org_time_off_type_check" CHECK ("leave_type" IN ('vacation', 'personal', 'other')),
  CONSTRAINT "org_time_off_status_check" CHECK ("status" IN ('pending', 'approved', 'declined', 'cancelled'))
);

CREATE INDEX "org_time_off_org_status_created_idx"
  ON "org_time_off_requests" ("org_id", "status", "created_at");
CREATE INDEX "org_time_off_org_requester_created_idx"
  ON "org_time_off_requests" ("org_id", "requester_user_id", "created_at");
