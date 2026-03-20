CREATE TABLE "merch_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(300),
	"stripe_session_id" varchar(500) NOT NULL,
	"stripe_payment_intent_id" varchar(500),
	"product_id" integer NOT NULL,
	"product_name" varchar(300) NOT NULL,
	"size" varchar(50),
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount_total" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd' NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"shipping_name" varchar(300),
	"shipping_email" varchar(300),
	"shipping_line1" varchar(500),
	"shipping_line2" varchar(500),
	"shipping_city" varchar(200),
	"shipping_state" varchar(200),
	"shipping_postal_code" varchar(50),
	"shipping_country" varchar(10),
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merch_orders_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "merch_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(300) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" varchar(100) DEFAULT 'apparel' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"stripe_price_id" varchar(200),
	"stripe_product_id" varchar(200),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "merch_orders_user_id_idx" ON "merch_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "merch_orders_status_idx" ON "merch_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merch_orders_stripe_session_idx" ON "merch_orders" USING btree ("stripe_session_id");