ALTER TYPE "public"."notification_type" ADD VALUE 'BUSINESS_WEEKLY_SUMMARY';--> statement-breakpoint
CREATE TABLE "analytics_daily" (
	"day" date NOT NULL,
	"business_id" uuid NOT NULL,
	"offer_id" uuid,
	"type" "analytics_event_type" NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"query" varchar(100) NOT NULL,
	"city_id" uuid,
	"results" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_daily_business_day_idx" ON "analytics_daily" USING btree ("business_id","day");--> statement-breakpoint
CREATE INDEX "analytics_daily_day_idx" ON "analytics_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "search_logs_created_idx" ON "search_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_logs_query_idx" ON "search_logs" USING btree ("query");