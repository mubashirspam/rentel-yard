ALTER TABLE "items" ADD COLUMN "minimum_days" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "min_days_snapshot" integer;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_minimum_days_check" CHECK ("items"."minimum_days" >= 1);