BEGIN;

ALTER TABLE "desktop_office_presence"
  RENAME CONSTRAINT "desktop_office_presence_office_unit_id_shadow_tower_office_unit"
  TO "desktop_office_presence_unit_fk";
ALTER TABLE "desktop_basement_attack_events"
  RENAME CONSTRAINT "desktop_basement_attack_events_pest_id_desktop_basement_pests_i"
  TO "desktop_basement_attack_pest_fk";
ALTER TABLE "shadow_tower_workstation_assignments"
  RENAME CONSTRAINT "shadow_tower_workstation_assignments_floor_id_shadow_tower_floo"
  TO "shadow_tower_workstation_floor_fk";
ALTER TABLE "business_entity_relations"
  RENAME CONSTRAINT "business_entity_relations_from_entity_id_business_entities_id_f"
  TO "business_entity_relation_from_fk";
ALTER TABLE "career_work_events"
  RENAME CONSTRAINT "career_work_events_position_key_career_positions_position_key_f"
  TO "career_work_event_position_fk";
ALTER TABLE "tower_construction_contributions"
  RENAME CONSTRAINT "tower_construction_contributions_plan_id_world_build_plans_id_f"
  TO "tower_construction_plan_fk";
ALTER TABLE "tower_shop_shipments"
  RENAME CONSTRAINT "tower_shop_shipments_business_key_tower_shop_accounts_business_"
  TO "tower_shop_shipment_account_fk";
ALTER TABLE "organization_connector_connections"
  RENAME CONSTRAINT "organization_connector_connections_app_id_organization_connecto"
  TO "org_connector_connection_app_fk";
ALTER TABLE "organization_connector_activity"
  RENAME CONSTRAINT "organization_connector_activity_connection_id_organization_conn"
  TO "org_connector_activity_connection_fk";
ALTER TABLE "organization_connector_activity"
  RENAME CONSTRAINT "organization_connector_activity_app_id_organization_connector_a"
  TO "org_connector_activity_app_fk";
ALTER TABLE "org_document_upload_intents"
  RENAME CONSTRAINT "org_document_upload_intents_connection_id_organization_connecto"
  TO "org_document_upload_connection_fk";
ALTER TABLE "tower_shop_inventory"
  RENAME CONSTRAINT "tower_shop_inventory_business_key_tower_shop_accounts_business_"
  TO "tower_shop_inventory_account_fk";

COMMIT;
