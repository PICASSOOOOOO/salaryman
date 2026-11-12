BEGIN;

ALTER TABLE "contact_channel_prefs"
  ALTER COLUMN "tags" SET DEFAULT '{}';

-- org_id is an organization reference, not a generated serial. The table is
-- empty, and the declared schema has no default for this column.
ALTER TABLE "org_feature_grants"
  ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "org_feature_grants"
  ALTER COLUMN "org_id" SET DATA TYPE integer;

ALTER TABLE "desktop_basement_attack_events" ADD PRIMARY KEY ("id");
ALTER TABLE "desktop_basement_pests" ADD PRIMARY KEY ("id");
ALTER TABLE "desktop_basement_presence" ADD PRIMARY KEY ("user_id");

ALTER TABLE "desktop_office_presence"
  ADD CONSTRAINT "desktop_office_presence_office_unit_id_shadow_tower_office_units_id_fk"
  FOREIGN KEY ("office_unit_id") REFERENCES "public"."shadow_tower_office_units"("id")
  ON DELETE set null ON UPDATE no action;
ALTER TABLE "desktop_basement_attack_events"
  ADD CONSTRAINT "desktop_basement_attack_events_pest_id_desktop_basement_pests_id_fk"
  FOREIGN KEY ("pest_id") REFERENCES "public"."desktop_basement_pests"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shadow_tower_workstation_assignments"
  ADD CONSTRAINT "shadow_tower_workstation_assignments_floor_id_shadow_tower_floors_id_fk"
  FOREIGN KEY ("floor_id") REFERENCES "public"."shadow_tower_floors"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "business_entity_relations"
  ADD CONSTRAINT "business_entity_relations_from_entity_id_business_entities_id_fk"
  FOREIGN KEY ("from_entity_id") REFERENCES "public"."business_entities"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "career_work_events"
  ADD CONSTRAINT "career_work_events_position_key_career_positions_position_key_fk"
  FOREIGN KEY ("position_key") REFERENCES "public"."career_positions"("position_key")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tower_construction_contributions"
  ADD CONSTRAINT "tower_construction_contributions_plan_id_world_build_plans_id_fk"
  FOREIGN KEY ("plan_id") REFERENCES "public"."world_build_plans"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "game_business_org_members"
  ADD CONSTRAINT "game_business_org_members_org_id_game_business_orgs_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."game_business_orgs"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "game_business_income_events"
  ADD CONSTRAINT "game_business_income_events_org_id_game_business_orgs_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."game_business_orgs"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "game_business_tax_assessments"
  ADD CONSTRAINT "game_business_tax_assessments_org_id_game_business_orgs_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."game_business_orgs"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_shared_storage"
  ADD CONSTRAINT "org_shared_storage_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "verified_paid_wages"
  ADD CONSTRAINT "verified_paid_wages_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "verified_paid_wages"
  ADD CONSTRAINT "verified_paid_wages_business_id_world_businesses_id_fk"
  FOREIGN KEY ("business_id") REFERENCES "public"."world_businesses"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tower_shop_shipments"
  ADD CONSTRAINT "tower_shop_shipments_business_key_tower_shop_accounts_business_key_fk"
  FOREIGN KEY ("business_key") REFERENCES "public"."tower_shop_accounts"("business_key")
  ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_connector_connections"
  ADD CONSTRAINT "organization_connector_connections_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organization_connector_connections"
  ADD CONSTRAINT "organization_connector_connections_app_id_organization_connector_apps_id_fk"
  FOREIGN KEY ("app_id") REFERENCES "public"."organization_connector_apps"("id")
  ON DELETE restrict ON UPDATE no action;
ALTER TABLE "organization_connector_activity"
  ADD CONSTRAINT "organization_connector_activity_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organization_connector_activity"
  ADD CONSTRAINT "organization_connector_activity_connection_id_organization_connector_connections_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."organization_connector_connections"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organization_connector_activity"
  ADD CONSTRAINT "organization_connector_activity_app_id_organization_connector_apps_id_fk"
  FOREIGN KEY ("app_id") REFERENCES "public"."organization_connector_apps"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_documents"
  ADD CONSTRAINT "org_documents_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_documents"
  ADD CONSTRAINT "org_documents_parent_same_org_fk"
  FOREIGN KEY ("parent_id", "org_id") REFERENCES "public"."org_documents"("id", "org_id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_document_upload_intents"
  ADD CONSTRAINT "org_document_upload_intents_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_document_upload_intents"
  ADD CONSTRAINT "org_document_upload_intents_connection_id_organization_connector_connections_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."organization_connector_connections"("id")
  ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tower_alarm_events"
  ADD CONSTRAINT "tower_alarm_events_silenced_by_user_id_users_id_fk"
  FOREIGN KEY ("silenced_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
ALTER TABLE "tower_shop_inventory"
  ADD CONSTRAINT "tower_shop_inventory_business_key_tower_shop_accounts_business_key_fk"
  FOREIGN KEY ("business_key") REFERENCES "public"."tower_shop_accounts"("business_key")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX "org_shared_storage_org_idx"
  ON "org_shared_storage" USING btree ("org_id");
CREATE INDEX "org_shared_storage_org_item_idx"
  ON "org_shared_storage" USING btree ("org_id", "item_id");
CREATE INDEX "public_locker_storage_user_slot_idx"
  ON "public_locker_storage" USING btree ("user_id", "slot_index");
CREATE UNIQUE INDEX "tower_operations_ledger_event_unique"
  ON "tower_operations_ledger" USING btree ("event_key");
CREATE INDEX "tower_operations_ledger_created_idx"
  ON "tower_operations_ledger" USING btree ("created_at");
CREATE INDEX "tower_operations_ledger_user_created_idx"
  ON "tower_operations_ledger" USING btree ("user_id", "created_at");
CREATE UNIQUE INDEX "tower_alarm_events_one_active_type_idx"
  ON "tower_alarm_events"
  USING btree ("building_key", "alarm_type", "floor_key", "zone_key", coalesce("organization_key", ''))
  WHERE "tower_alarm_events"."status" in ('active', 'silenced');

ALTER TABLE "chat_read_cursors"
  ADD CONSTRAINT "chat_read_cursors_user_channel_unique" UNIQUE ("user_id", "channel_id");

ALTER TABLE "desktop_building_object_states"
  ADD CONSTRAINT "desktop_building_object_rotation_check"
  CHECK ("desktop_building_object_states"."rotation_degrees" between 0 and 359);
ALTER TABLE "desktop_building_object_states"
  ADD CONSTRAINT "desktop_building_object_damage_check"
  CHECK ("desktop_building_object_states"."damage" between 0 and 100);

COMMIT;
