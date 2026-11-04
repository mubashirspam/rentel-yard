ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_check";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_discount_check" CHECK ("payments"."discount" >= 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_total_check" CHECK ("payments"."amount" + "payments"."discount" > 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" >= 0);