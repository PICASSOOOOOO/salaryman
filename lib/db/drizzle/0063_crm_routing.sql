CREATE TABLE IF NOT EXISTS "crm_routing_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "primary_channel" varchar(16) DEFAULT 'sms' NOT NULL,
  "fallback_channel" varchar(16) DEFAULT 'comms' NOT NULL,
  "phone_number_id" integer,
  "comms_target" varchar(16) DEFAULT 'company' NOT NULL,
  "comms_user_id" varchar(256),
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" varchar(256) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "crm_routing_profiles_org_idx" ON "crm_routing_profiles" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "crm_routing_profiles_org_name_uq" ON "crm_routing_profiles" ("org_id", "name");

CREATE TABLE IF NOT EXISTS "crm_lead_routing" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "lead_id" integer NOT NULL,
  "profile_id" integer,
  "primary_channel" varchar(16),
  "fallback_channel" varchar(16),
  "phone_number_id" integer,
  "comms_target" varchar(16),
  "comms_user_id" varchar(256),
  "updated_by_user_id" varchar(256) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_lead_routing_lead_id_lead_records_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "lead_records"("id") ON DELETE CASCADE,
  CONSTRAINT "crm_lead_routing_profile_id_crm_routing_profiles_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "crm_routing_profiles"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_lead_routing_lead_uq" ON "crm_lead_routing" ("lead_id");
CREATE INDEX IF NOT EXISTS "crm_lead_routing_org_idx" ON "crm_lead_routing" ("org_id");