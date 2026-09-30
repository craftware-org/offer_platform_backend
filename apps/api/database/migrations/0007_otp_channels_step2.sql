DROP INDEX "otp_challenges_phone_created_idx";--> statement-breakpoint
ALTER TABLE "otp_challenges" ALTER COLUMN "destination" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "otp_challenges_destination_created_idx" ON "otp_challenges" USING btree ("destination","created_at");--> statement-breakpoint
ALTER TABLE "otp_challenges" DROP COLUMN "phone";