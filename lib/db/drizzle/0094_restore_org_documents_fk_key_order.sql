BEGIN;

-- Keep the FK paired with the explicit (id, org_id) unique target used by
-- the established Publish-compatible organization-document schema.
ALTER TABLE "org_documents"
  DROP CONSTRAINT "org_documents_parent_same_org_fk";

ALTER TABLE "org_documents"
  ADD CONSTRAINT "org_documents_parent_same_org_fk"
  FOREIGN KEY ("parent_id", "org_id")
  REFERENCES "public"."org_documents"("id", "org_id")
  ON DELETE cascade ON UPDATE no action;

COMMIT;
