CREATE TABLE "tower_shop_staff_assignments" (
  "business_key" varchar(80) NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "assigned_by_user_id" varchar(256),
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_shop_staff_assignments_business_user_pk"
    PRIMARY KEY ("business_key", "user_id"),
  CONSTRAINT "tower_shop_staff_assignments_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tower_shop_staff_assignments_assigned_by_user_id_users_id_fk"
    FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);

CREATE INDEX "tower_shop_staff_assignments_user_idx"
  ON "tower_shop_staff_assignments" USING btree ("user_id");
