CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"industry" varchar(80),
	"size" varchar(40),
	"owner_user_id" varchar NOT NULL,
	"stripe_customer_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(20) DEFAULT 'employee' NOT NULL,
	"department" varchar(100),
	"spawn_location" varchar(100),
	"feature_billing" varchar(20) DEFAULT 'individual' NOT NULL,
	"status" varchar(20) DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" varchar,
	"invite_email" varchar(200),
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "org_feature_grants" (
	"org_id" integer NOT NULL,
	"feature_key" varchar NOT NULL,
	"stripe_subscription_id" varchar(100),
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_feature_grants_org_id_feature_key_pk" PRIMARY KEY("org_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE "org_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"invited_by_user_id" varchar NOT NULL,
	"invite_email" varchar(200),
	"invite_username" varchar(80),
	"token" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "org_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_feature_grants" ADD CONSTRAINT "org_feature_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "org_members_user_id_idx" ON "org_members" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "org_members_org_id_idx" ON "org_members" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "org_feature_grants_org_id_idx" ON "org_feature_grants" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "org_invites_token_idx" ON "org_invites" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "org_invites_org_id_idx" ON "org_invites" USING btree ("org_id");
