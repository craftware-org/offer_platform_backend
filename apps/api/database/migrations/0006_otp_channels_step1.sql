CREATE TYPE "public"."otp_channel" AS ENUM('SMS', 'EMAIL');--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "channel" "otp_channel" DEFAULT 'SMS' NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "destination" varchar(254);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: every existing challenge was an SMS code to its phone number.
UPDATE "otp_challenges" SET "destination" = "phone" WHERE "destination" IS NULL;
