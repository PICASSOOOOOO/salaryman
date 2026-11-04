BEGIN;

ALTER TABLE "org_documents"
  DROP CONSTRAINT "org_documents_parent_same_org_fk";

ALTER TABLE "org_documents"
  ADD CONSTRAINT "org_documents_parent_same_org_fk"
  FOREIGN KEY ("org_id", "parent_id")
  REFERENCES "public"."org_documents"("org_id", "id")
  ON DELETE cascade ON UPDATE no action;

COMMIT;
