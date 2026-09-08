CREATE TABLE IF NOT EXISTS "colleagues" (
        "user_a_id" varchar NOT NULL,
        "user_b_id" varchar NOT NULL,
        "requester_id" varchar NOT NULL,
        "status" varchar(16) DEFAULT 'pending' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "responded_at" timestamp with time zone,
        CONSTRAINT "colleagues_user_a_id_user_b_id_pk" PRIMARY KEY("user_a_id","user_b_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colleagues" ADD CONSTRAINT "colleagues_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colleagues" ADD CONSTRAINT "colleagues_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colleagues" ADD CONSTRAINT "colleagues_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "colleagues_user_a_idx" ON "colleagues" USING btree ("user_a_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "colleagues_user_b_idx" ON "colleagues" USING btree ("user_b_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "colleagues_status_idx" ON "colleagues" USING btree ("status");
