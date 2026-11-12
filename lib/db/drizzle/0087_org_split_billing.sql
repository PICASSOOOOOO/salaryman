ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "billing_plan" varchar(20) DEFAULT 'free' NOT NULL;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "stripe_plan_subscription_id" varchar(100);

ALTER TABLE "org_members"
  ADD COLUMN IF NOT EXISTS "seat_billing" varchar(20) DEFAULT 'individual' NOT NULL;

ALTER TABLE "org_members"
  ADD COLUMN IF NOT EXISTS "seat_status" varchar(20) DEFAULT 'not_required' NOT NULL;

ALTER TABLE "org_members"
  ADD COLUMN IF NOT EXISTS "stripe_seat_subscription_id" varchar(100);

ALTER TABLE "org_invites"
  ADD COLUMN IF NOT EXISTS "offered_seat_billing" varchar(20) DEFAULT 'individual' NOT NULL;
