BEGIN;

CREATE TABLE "tower_building_vitals_archive" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "building_key" varchar(64) NOT NULL,
  "power_condition" integer NOT NULL,
  "plumbing_condition" integer NOT NULL,
  "upkeep_condition" integer NOT NULL,
  "last_tick_at" timestamp with time zone NOT NULL,
  "updated_by_user_id" varchar(256),
  "updated_at" timestamp with time zone NOT NULL,
  "archived_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archive_reason" varchar(64) DEFAULT 'duplicate_building_key' NOT NULL
);

CREATE TEMP TABLE "tower_building_vitals_ranked" ON COMMIT DROP AS
SELECT
  ctid AS source_ctid,
  "building_key",
  "power_condition",
  "plumbing_condition",
  "upkeep_condition",
  "last_tick_at",
  "updated_by_user_id",
  "updated_at",
  row_number() OVER (
    PARTITION BY "building_key"
    ORDER BY
      "updated_at" DESC NULLS LAST,
      "last_tick_at" DESC NULLS LAST,
      "power_condition" DESC,
      "plumbing_condition" DESC,
      "upkeep_condition" DESC,
      "updated_by_user_id" DESC NULLS LAST
  ) AS row_rank
FROM "tower_building_vitals";

INSERT INTO "tower_building_vitals_archive" (
  "building_key",
  "power_condition",
  "plumbing_condition",
  "upkeep_condition",
  "last_tick_at",
  "updated_by_user_id",
  "updated_at",
  "archive_reason"
)
SELECT
  "building_key",
  "power_condition",
  "plumbing_condition",
  "upkeep_condition",
  "last_tick_at",
  "updated_by_user_id",
  "updated_at",
  'duplicate_building_key'
FROM "tower_building_vitals_ranked"
WHERE row_rank > 1;

DELETE FROM "tower_building_vitals" AS vitals
USING "tower_building_vitals_ranked" AS ranked
WHERE vitals.ctid = ranked.source_ctid
  AND ranked.row_rank > 1;

ALTER TABLE "tower_building_vitals"
  ADD CONSTRAINT "tower_building_vitals_building_pk" PRIMARY KEY ("building_key");

COMMIT;
