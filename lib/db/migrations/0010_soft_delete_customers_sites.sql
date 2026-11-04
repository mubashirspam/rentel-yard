ALTER TABLE "customers" DROP CONSTRAINT "customers_org_mobile_key";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_mobile_key" ON "customers" USING btree ("org_id","mobile") WHERE "customers"."deleted_at" is null;