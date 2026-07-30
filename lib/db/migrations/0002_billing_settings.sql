ALTER TABLE "settings" ADD COLUMN "payment_terms_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "yard_address" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "yard_phone" text;