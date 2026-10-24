ALTER TABLE org_document_upload_intents
  ALTER COLUMN connection_id DROP NOT NULL;

ALTER TABLE org_document_upload_intents
  ADD COLUMN uploaded_by_user_id varchar(255);
