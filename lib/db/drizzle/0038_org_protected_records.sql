ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "website" varchar(500);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "business_address" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contact_email" varchar(254);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contact_phone" varchar(50);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_entity_name" varchar(160);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "entity_type" varchar(80);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_protected_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "label" varchar(120) NOT NULL,
  "encrypted_value" text NOT NULL,
  "masked_value" varchar(64) NOT NULL,
  "created_by_user_id" varchar NOT NULL,
  "updated_by_user_id" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "org_protected_records_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_protected_records_org_idx"
  ON "org_protected_records" USING btree ("org_id","updated_at");