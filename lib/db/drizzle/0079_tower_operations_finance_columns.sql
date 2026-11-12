ALTER TABLE "tower_operations_state"
  ADD COLUMN IF NOT EXISTS "operating_balance_fiat" integer DEFAULT 250000 NOT NULL,
  ADD COLUMN IF NOT EXISTS "power_bill_due_fiat" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "water_bill_due_fiat" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_utility_bill_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS "backup_fuel_days" integer DEFAULT 5 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tower_operations_balance_check' AND conrelid = 'public.tower_operations_state'::regclass) THEN
    ALTER TABLE "tower_operations_state"
      ADD CONSTRAINT "tower_operations_balance_check"
      CHECK ("operating_balance_fiat" between 0 and 2147483647);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tower_operations_power_bill_check' AND conrelid = 'public.tower_operations_state'::regclass) THEN
    ALTER TABLE "tower_operations_state"
      ADD CONSTRAINT "tower_operations_power_bill_check"
      CHECK ("power_bill_due_fiat" between 0 and 2147483647);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tower_operations_water_bill_check' AND conrelid = 'public.tower_operations_state'::regclass) THEN
    ALTER TABLE "tower_operations_state"
      ADD CONSTRAINT "tower_operations_water_bill_check"
      CHECK ("water_bill_due_fiat" between 0 and 2147483647);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tower_operations_backup_fuel_check' AND conrelid = 'public.tower_operations_state'::regclass) THEN
    ALTER TABLE "tower_operations_state"
      ADD CONSTRAINT "tower_operations_backup_fuel_check"
      CHECK ("backup_fuel_days" between 0 and 5);
  END IF;
END $$;
