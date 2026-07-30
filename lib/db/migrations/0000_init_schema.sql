CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_name" text NOT NULL,
	"site_address" text,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_on" date NOT NULL,
	"closed_on" date,
	"created_by" uuid,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"applied_on" date NOT NULL,
	"client_uuid" text NOT NULL,
	"created_by" uuid,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjustments_org_client_uuid_key" UNIQUE("org_id","client_uuid"),
	CONSTRAINT "adjustments_amount_check" CHECK ("adjustments"."amount" > 0),
	CONSTRAINT "adjustments_kind_check" CHECK ("adjustments"."kind" in ('charge', 'credit'))
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"rent_total" bigint NOT NULL,
	"damage_total" bigint DEFAULT 0 NOT NULL,
	"charges_total" bigint DEFAULT 0 NOT NULL,
	"credits_total" bigint DEFAULT 0 NOT NULL,
	"grand_total" bigint NOT NULL,
	"lines" jsonb NOT NULL,
	"due_on" date,
	"issued_by" uuid,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_org_invoice_no_key" UNIQUE("org_id","invoice_no")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mobile" text NOT NULL,
	"alt_mobile" text,
	"address" text,
	"id_proof_url" text,
	"credit_limit" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_org_mobile_key" UNIQUE("org_id","mobile")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"unit" text DEFAULT 'nos' NOT NULL,
	"rate_per_day" bigint NOT NULL,
	"replacement_rate" bigint DEFAULT 0 NOT NULL,
	"purchase_cost" bigint DEFAULT 0 NOT NULL,
	"qty_owned" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "items_org_code_key" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"qty" integer NOT NULL,
	"rate_snapshot" bigint NOT NULL,
	"replacement_snapshot" bigint DEFAULT 0 NOT NULL,
	"manual_charge" bigint,
	"moved_at" date NOT NULL,
	"reverses_id" uuid,
	"gate_pass_no" text,
	"photo_url" text,
	"signature_url" text,
	"remarks" text,
	"client_uuid" text NOT NULL,
	"device_id" text,
	"created_by" uuid,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_org_client_uuid_key" UNIQUE("org_id","client_uuid"),
	CONSTRAINT "movements_qty_check" CHECK ("movements"."qty" > 0),
	CONSTRAINT "movements_type_check" CHECK ("movements"."type" in ('ISSUE', 'RETURN', 'RETURN_DAMAGED', 'LOST', 'REVERSAL'))
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_bill_id_pk" PRIMARY KEY("payment_id","bill_id"),
	CONSTRAINT "payment_allocations_amount_check" CHECK ("payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"paid_on" date NOT NULL,
	"remarks" text,
	"client_uuid" text NOT NULL,
	"created_by" uuid,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_org_client_uuid_key" UNIQUE("org_id","client_uuid"),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('cash', 'upi', 'bank', 'cheque', 'other'))
);
--> statement-breakpoint
CREATE TABLE "portal_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"mobile_hash" text NOT NULL,
	"ip_hash" text,
	"matched" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"source" text DEFAULT 'admin_link' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "portal_tokens_source_check" CHECK ("portal_tokens"."source" in ('admin_link', 'mobile_lookup'))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"billing" jsonb NOT NULL,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"next_invoice_no" integer DEFAULT 1 NOT NULL,
	"terms_text" text,
	"show_rates_to_customer" boolean DEFAULT false NOT NULL,
	"portal_token_days" integer DEFAULT 90 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_uuid" text NOT NULL,
	"device_id" text,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('super_admin', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_reverses_id_movements_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_lookups" ADD CONSTRAINT "portal_lookups_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_rejections" ADD CONSTRAINT "sync_rejections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_customer_idx" ON "accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "accounts_org_seq_idx" ON "accounts" USING btree ("org_id","server_seq");--> statement-breakpoint
CREATE INDEX "adjustments_account_idx" ON "adjustments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "adjustments_org_seq_idx" ON "adjustments" USING btree ("org_id","server_seq");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "bills_account_idx" ON "bills" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "bills_org_seq_idx" ON "bills" USING btree ("org_id","server_seq");--> statement-breakpoint
CREATE INDEX "customers_org_seq_idx" ON "customers" USING btree ("org_id","server_seq");--> statement-breakpoint
CREATE INDEX "items_org_seq_idx" ON "items" USING btree ("org_id","server_seq");--> statement-breakpoint
CREATE INDEX "movements_account_item_date_idx" ON "movements" USING btree ("account_id","item_id","moved_at");--> statement-breakpoint
CREATE INDEX "movements_org_created_idx" ON "movements" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "movements_org_seq_idx" ON "movements" USING btree ("org_id","server_seq");--> statement-breakpoint
CREATE INDEX "movements_reverses_idx" ON "movements" USING btree ("reverses_id");--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "payments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "payments_org_seq_idx" ON "payments" USING btree ("org_id","server_seq");--> statement-breakpoint
CREATE INDEX "portal_lookups_mobile_time_idx" ON "portal_lookups" USING btree ("mobile_hash","created_at");--> statement-breakpoint
CREATE INDEX "portal_lookups_ip_time_idx" ON "portal_lookups" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "portal_tokens_customer_idx" ON "portal_tokens" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sync_rejections_org_created_idx" ON "sync_rejections" USING btree ("org_id","created_at");