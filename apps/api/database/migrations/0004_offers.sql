CREATE TYPE "public"."offer_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'REJECTED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'EXPIRED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('PRICE_DROP', 'PERCENTAGE_OFF', 'FLAT_AMOUNT_OFF', 'BUY_X_GET_Y', 'FREE_GIFT', 'COMBO', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."price_change_source" AS ENUM('CREATED', 'UPDATED_BY_BUSINESS');--> statement-breakpoint
CREATE TABLE "offer_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"offer_id" uuid NOT NULL,
	"storage_prefix" varchar(200) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_price_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"offer_id" uuid NOT NULL,
	"price" bigint,
	"original_price" bigint,
	"discount_percent" numeric(4, 1),
	"pricing" jsonb NOT NULL,
	"source" "price_change_source" NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"type" "offer_type" NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" varchar(2000),
	"category_id" uuid NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"original_price" bigint,
	"offer_price" bigint,
	"discount_percent" numeric(4, 1),
	"is_up_to" boolean DEFAULT false NOT NULL,
	"max_discount_amount" bigint,
	"flat_amount_off" bigint,
	"min_purchase_amount" bigint,
	"buy_quantity" smallint,
	"get_quantity" smallint,
	"item_name" varchar(120),
	"combo_items" jsonb,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"terms" varchar(2000),
	"eligibility" varchar(500),
	"quantity_limit" integer,
	"status" "offer_status" DEFAULT 'DRAFT' NOT NULL,
	"status_reason" varchar(1000),
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"first_published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_money_non_negative" CHECK (coalesce("offers"."original_price", 0) >= 0 and coalesce("offers"."offer_price", 0) >= 0
        and coalesce("offers"."flat_amount_off", 0) >= 0 and coalesce("offers"."min_purchase_amount", 0) >= 0
        and coalesce("offers"."max_discount_amount", 0) >= 0),
	CONSTRAINT "offers_offer_price_below_original" CHECK ("offers"."original_price" is null or "offers"."offer_price" is null or "offers"."offer_price" < "offers"."original_price"),
	CONSTRAINT "offers_discount_range" CHECK ("offers"."discount_percent" is null or "offers"."discount_percent" between 0 and 100),
	CONSTRAINT "offers_dates_valid" CHECK ("offers"."starts_at" < "offers"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "offer_images" ADD CONSTRAINT "offer_images_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_images" ADD CONSTRAINT "offer_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_price_history" ADD CONSTRAINT "offer_price_history_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_price_history" ADD CONSTRAINT "offer_price_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offer_images_offer_id_idx" ON "offer_images" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_price_history_offer_id_idx" ON "offer_price_history" USING btree ("offer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_slug_key" ON "offers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "offers_business_id_idx" ON "offers" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "offers_category_id_idx" ON "offers" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "offers_status_expires_at_idx" ON "offers" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "offers_status_starts_at_idx" ON "offers" USING btree ("status","starts_at");