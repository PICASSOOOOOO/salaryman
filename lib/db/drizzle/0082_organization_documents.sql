CREATE TABLE "org_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(300) NOT NULL,
  "parent_id" integer,
  "is_folder" boolean DEFAULT false NOT NULL,
  "object_path" varchar(1000),
  "mime_type" varchar(200),
  "file_size" integer,
  "uploaded_by_user_id" varchar,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "org_documents_id_org_id_uidx"
  ON "org_documents" USING btree ("id", "org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "org_documents_object_path_uidx"
  ON "org_documents" USING btree ("object_path");
--> statement-breakpoint
CREATE INDEX "org_documents_org_parent_created_idx"
  ON "org_documents" USING btree ("org_id", "parent_id", "created_at");
--> statement-breakpoint
ALTER TABLE "org_documents"
  ADD CONSTRAINT "org_documents_parent_same_org_fk"
  FOREIGN KEY ("parent_id", "org_id")
  REFERENCES "org_documents"("id", "org_id")
  ON DELETE CASCADE;
