CREATE TYPE "public"."analytics_event_type" AS ENUM('OFFER_VIEWED', 'OFFER_SAVED', 'OFFER_SHARED', 'BUSINESS_VIEWED', 'BUSINESS_FOLLOWED', 'CALL_CLICKED', 'WHATSAPP_CLICKED', 'WEBSITE_CLICKED', 'DIRECTIONS_CLICKED', 'OFFER_REPORTED', 'SEARCH_PERFORMED', 'CATEGORY_VIEWED');--> statement-breakpoint
CREATE TYPE "public"."report_action_type" AS ENUM('DISMISS', 'WARN_BUSINESS', 'SUSPEND_OFFER', 'SUSPEND_BUSINESS');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('OFFER_UNAVAILABLE', 'WRONG_DISCOUNT', 'MISLEADING_INFORMATION', 'BUSINESS_CLOSED', 'WRONG_LOCATION', 'OFFENSIVE_CONTENT', 'SUSPICIOUS_ACTIVITY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "analytics_event_type" NOT NULL,
	"business_id" uuid NOT NULL,
	"offer_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_followers" (
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_followers_user_id_business_id_pk" PRIMARY KEY("user_id","business_id")
);
--> statement-breakpoint
CREATE TABLE "saved_offers" (
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_offers_user_id_offer_id_pk" PRIMARY KEY("user_id","offer_id")
);
--> statement-breakpoint
CREATE TABLE "report_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" "report_action_type" NOT NULL,
	"note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"offer_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"reason" "report_reason" NOT NULL,
	"note" varchar(1000),
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_followers" ADD CONSTRAINT "business_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_followers" ADD CONSTRAINT "business_followers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_offers" ADD CONSTRAINT "saved_offers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_offers" ADD CONSTRAINT "saved_offers_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_offers" ADD CONSTRAINT "saved_offers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_actions" ADD CONSTRAINT "report_actions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_actions" ADD CONSTRAINT "report_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_business_type_idx" ON "analytics_events" USING btree ("business_id","type");--> statement-breakpoint
CREATE INDEX "analytics_events_offer_type_idx" ON "analytics_events" USING btree ("offer_id","type");--> statement-breakpoint
CREATE INDEX "analytics_events_created_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "business_followers_business_idx" ON "business_followers" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "saved_offers_offer_idx" ON "saved_offers" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "saved_offers_business_idx" ON "saved_offers" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "report_actions_report_idx" ON "report_actions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_offer_idx" ON "reports" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "reports_business_idx" ON "reports" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_reporter_key" ON "reports" USING btree ("offer_id","reporter_user_id") WHERE status = 'OPEN';