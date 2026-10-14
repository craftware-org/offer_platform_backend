ALTER TABLE "businesses" ADD COLUMN "listed_by_platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "source_url" varchar(300);