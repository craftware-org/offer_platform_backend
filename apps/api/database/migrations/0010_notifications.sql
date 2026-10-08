CREATE TYPE "public"."notification_email_status" AS ENUM('NONE', 'PENDING', 'SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('BUSINESS_VERIFIED', 'BUSINESS_REJECTED', 'BUSINESS_SUSPENDED', 'BUSINESS_REACTIVATED', 'BUSINESS_WARNED', 'OFFER_APPROVED', 'OFFER_REJECTED', 'OFFER_CHANGES_REQUESTED', 'OFFER_SUSPENDED', 'OFFER_ENDING_SOON', 'FOLLOWED_SHOP_NEW_OFFER', 'SAVED_OFFER_ENDING', 'ADMIN_DAILY_SUMMARY');--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"in_app" boolean NOT NULL,
	"email" boolean NOT NULL,
	CONSTRAINT "notification_preferences_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(1000) NOT NULL,
	"link" varchar(300),
	"dedupe_key" varchar(200),
	"in_app" boolean DEFAULT true NOT NULL,
	"read_at" timestamp with time zone,
	"email_status" "notification_email_status" DEFAULT 'NONE' NOT NULL,
	"email_not_before" timestamp with time zone,
	"email_attempts" smallint DEFAULT 0 NOT NULL,
	"email_sent_at" timestamp with time zone,
	"email_error" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_email_outbox_idx" ON "notifications" USING btree ("email_not_before") WHERE email_status = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "notifications" USING btree ("user_id","dedupe_key");