ALTER TABLE org_documents
  ADD CONSTRAINT org_documents_id_org_id_uidx
  UNIQUE USING INDEX org_documents_id_org_id_uidx;
