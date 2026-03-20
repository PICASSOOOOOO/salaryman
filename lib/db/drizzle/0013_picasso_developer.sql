ALTER TABLE "organizations" ADD COLUMN "is_developer" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_name_unique_idx" ON "organizations" USING btree (lower("name"));
