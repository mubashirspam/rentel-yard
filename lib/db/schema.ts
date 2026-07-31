/**
 * Drizzle schema — the authoritative §04 DDL expressed in TypeScript.
 *
 * Conventions:
 *  - Every table carries `orgId` (§00 rule 6). Single-tenant today, no
 *    migration needed to become multi-tenant.
 *  - Money is `bigint` paise, read as a JS number (§00 rule 3). Safe to
 *    ₹90,000,000,000,000 — far past anything a yard will bill.
 *  - Rent dates are `date`, read as `YYYY-MM-DD` strings (§00 rule 4), which
 *    is exactly what the accrual engine consumes. Timestamps are audit only.
 *  - `movements` is append-only (§00 rule 1). Nothing here may UPDATE or
 *    DELETE a movement row.
 */

import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * One global sequence behind every syncable table's `server_seq` (§07.3).
 *
 * Global rather than per-table so the offline client can hold a single
 * monotonic cursor across all of them. A sequence, not a timestamp — device
 * and server clocks are both unreliable and rows must never be skipped.
 */
export const syncSeq = pgSequence('sync_seq');

/** `server_seq` column shared by every table the offline client mirrors. */
const serverSeq = () =>
  bigint('server_seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`);

const money = (name: string) => bigint(name, { mode: 'number' });

// ---------------------------------------------------------------- tenancy --

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => orgs.id),
  /** The §03.1 billing config object. Validated by `assertBillingConfig`. */
  billing: jsonb('billing').notNull(),
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  nextInvoiceNo: integer('next_invoice_no').notNull().default(1),
  termsText: text('terms_text'),
  /**
   * Days from issue to `bills.due_on`. Drives the §09 reminder queue — nothing
   * can be overdue without it.
   */
  paymentTermsDays: integer('payment_terms_days').notNull().default(7),
  /** §09 bill header: "yard name, address, phone". §04 carries only the name. */
  yardAddress: text('yard_address'),
  yardPhone: text('yard_phone'),
  /** §11: whether the customer portal shows per-day rates. */
  showRatesToCustomer: boolean('show_rates_to_customer').notNull().default(false),
  /** §11: how long an admin-shared portal link stays valid. */
  portalTokenDays: integer('portal_token_days').notNull().default(90),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------- people --

/**
 * Staff logins, managed by Better Auth (model name `users`).
 *
 * Only two roles exist: `admin` runs the yard day to day, `super_admin`
 * additionally controls item rates, other users, and billing settings.
 * Customers are NOT users — they never log in (§05.4).
 *
 * `emailVerified`, `image`, and `updatedAt` are Better Auth's required
 * columns; the rest is the §04 shape.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    role: text('role', { enum: ['super_admin', 'admin'] }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('users_role_check', sql`${t.role} in ('super_admin', 'admin')`)],
);

/**
 * Better Auth session / credential / verification tables.
 *
 * Prefixed `auth_` because Better Auth's default `account` model would
 * otherwise collide with §04's `accounts` — the customer khata, which is a
 * completely different thing.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    /** Hashed by Better Auth. Never selected into an API response. */
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_accounts_user_idx').on(t.userId)],
);

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_verifications_identifier_idx').on(t.identifier)],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    name: text('name').notNull(),
    /** E.164, e.g. +919XXXXXXXXX. Also the customer's portal identity (§05.4). */
    mobile: text('mobile').notNull(),
    altMobile: text('alt_mobile'),
    address: text('address'),
    idProofUrl: text('id_proof_url'),
    /** Paise. 0 means no limit. */
    creditLimit: money('credit_limit').notNull().default(0),
    notes: text('notes'),
    isBlocked: boolean('is_blocked').notNull().default(false),
    serverSeq: serverSeq(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('customers_org_mobile_key').on(t.orgId, t.mobile),
    index('customers_org_seq_idx').on(t.orgId, t.serverSeq),
  ],
);

// -------------------------------------------------------------- catalogue --

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    name: text('name').notNull(),
    /** Short code for fast entry in the yard. */
    code: text('code'),
    unit: text('unit').notNull().default('nos'),
    /** Paise per unit per day. Snapshotted onto every ISSUE (§02 invariant). */
    ratePerDay: money('rate_per_day').notNull(),
    /** Paise per unit, charged on damage or loss. */
    replacementRate: money('replacement_rate').notNull().default(0),
    /** Paise. §10 wants recovery-vs-cost, which needs the purchase price. */
    purchaseCost: money('purchase_cost').notNull().default(0),
    qtyOwned: integer('qty_owned').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    serverSeq: serverSeq(),
  },
  (t) => [
    unique('items_org_code_key').on(t.orgId, t.code),
    index('items_org_seq_idx').on(t.orgId, t.serverSeq),
  ],
);

// ------------------------------------------------------------- the ledger --

/** One running khata, usually per construction site. */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    siteName: text('site_name').notNull(),
    siteAddress: text('site_address'),
    /**
     * Device-minted idempotency key (§07.2). Null for accounts opened online
     * before M5; unique per org where present, so a queued "open site" pushed
     * twice cannot become two khatas for one contractor.
     */
    clientUuid: text('client_uuid'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    openedOn: date('opened_on').notNull(),
    closedOn: date('closed_on'),
    createdBy: uuid('created_by').references(() => users.id),
    serverSeq: serverSeq(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('accounts_status_check', sql`${t.status} in ('open', 'closed')`),
    index('accounts_customer_idx').on(t.customerId),
    index('accounts_org_seq_idx').on(t.orgId, t.serverSeq),
    // Partial, because rows opened online carry no key and several nulls must
    // not collide.
    uniqueIndex('accounts_org_client_uuid_key')
      .on(t.orgId, t.clientUuid)
      .where(sql`${t.clientUuid} is not null`),
  ],
);

/**
 * The append-only movement ledger — the heart of the product.
 *
 * NEVER UPDATE OR DELETE A ROW HERE (§00 rule 1). Corrections are REVERSAL
 * rows carrying `reversesId`. This one rule is what makes offline sync,
 * auditing, and dispute resolution work.
 */
export const movements = pgTable(
  'movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    type: text('type', {
      enum: ['ISSUE', 'RETURN', 'RETURN_DAMAGED', 'LOST', 'REVERSAL'],
    }).notNull(),
    qty: integer('qty').notNull(),
    /** Paise per unit per day, frozen at issue time. */
    rateSnapshot: money('rate_snapshot').notNull(),
    /** Paise per unit, frozen at issue time. */
    replacementSnapshot: money('replacement_snapshot').notNull().default(0),
    /** Paise per unit. Overrides the replacement rate when the admin typed one. */
    manualCharge: money('manual_charge'),
    movedAt: date('moved_at').notNull(),
    reversesId: uuid('reverses_id').references((): AnyPgColumn => movements.id),
    gatePassNo: text('gate_pass_no'),
    photoUrl: text('photo_url'),
    signatureUrl: text('signature_url'),
    remarks: text('remarks'),
    /** Idempotency key generated on the device. Makes sync retries free. */
    clientUuid: text('client_uuid').notNull(),
    deviceId: text('device_id'),
    createdBy: uuid('created_by').references(() => users.id),
    serverSeq: serverSeq(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('movements_org_client_uuid_key').on(t.orgId, t.clientUuid),
    check('movements_qty_check', sql`${t.qty} > 0`),
    check(
      'movements_type_check',
      sql`${t.type} in ('ISSUE', 'RETURN', 'RETURN_DAMAGED', 'LOST', 'REVERSAL')`,
    ),
    index('movements_account_item_date_idx').on(t.accountId, t.itemId, t.movedAt),
    index('movements_org_created_idx').on(t.orgId, t.createdAt),
    index('movements_org_seq_idx').on(t.orgId, t.serverSeq),
    index('movements_reverses_idx').on(t.reversesId),
  ],
);

// ------------------------------------------------------------------ money --

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    /** Paise. Payments are recorded here, never processed — no gateway in v1. */
    amount: money('amount').notNull(),
    method: text('method', { enum: ['cash', 'upi', 'bank', 'cheque', 'other'] }).notNull(),
    reference: text('reference'),
    paidOn: date('paid_on').notNull(),
    remarks: text('remarks'),
    clientUuid: text('client_uuid').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    serverSeq: serverSeq(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('payments_org_client_uuid_key').on(t.orgId, t.clientUuid),
    check('payments_amount_check', sql`${t.amount} > 0`),
    check(
      'payments_method_check',
      sql`${t.method} in ('cash', 'upi', 'bank', 'cheque', 'other')`,
    ),
    index('payments_account_idx').on(t.accountId),
    index('payments_org_seq_idx').on(t.orgId, t.serverSeq),
  ],
);

export const adjustments = pgTable(
  'adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    kind: text('kind', { enum: ['charge', 'credit'] }).notNull(),
    /** Paise, always positive. Direction comes from `kind`. */
    amount: money('amount').notNull(),
    reason: text('reason').notNull(),
    appliedOn: date('applied_on').notNull(),
    clientUuid: text('client_uuid').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    serverSeq: serverSeq(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('adjustments_org_client_uuid_key').on(t.orgId, t.clientUuid),
    check('adjustments_amount_check', sql`${t.amount} > 0`),
    check('adjustments_kind_check', sql`${t.kind} in ('charge', 'credit')`),
    index('adjustments_account_idx').on(t.accountId),
    index('adjustments_org_seq_idx').on(t.orgId, t.serverSeq),
  ],
);

/** A frozen snapshot of dues for a period. Immutable once issued (§02). */
export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    invoiceNo: text('invoice_no').notNull(),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    rentTotal: money('rent_total').notNull(),
    damageTotal: money('damage_total').notNull().default(0),
    chargesTotal: money('charges_total').notNull().default(0),
    creditsTotal: money('credits_total').notNull().default(0),
    grandTotal: money('grand_total').notNull(),
    /** Frozen `AccrualResult.lines`. A later rate change must not move these. */
    lines: jsonb('lines').notNull(),
    dueOn: date('due_on'),
    issuedBy: uuid('issued_by').references(() => users.id),
    serverSeq: serverSeq(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('bills_org_invoice_no_key').on(t.orgId, t.invoiceNo),
    index('bills_account_idx').on(t.accountId),
    index('bills_org_seq_idx').on(t.orgId, t.serverSeq),
  ],
);

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    /** Paise. */
    amount: money('amount').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.paymentId, t.billId] }),
    check('payment_allocations_amount_check', sql`${t.amount} > 0`),
  ],
);

// ---------------------------------------------------------- portal access --

/**
 * Read-only customer access. Two ways to get a token, one way to verify it:
 *
 *  - `admin_link`   — admin taps "Share statement", a 32-byte token goes out
 *                     over WhatsApp and stays valid for `portalTokenDays`.
 *  - `mobile_lookup` — the customer typed their own mobile number on the
 *                     public lookup page and got a short-lived session.
 *
 * Only the SHA-256 hash (peppered) is stored, so a database leak does not hand
 * over working links.
 */
export const portalTokens = pgTable(
  'portal_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    tokenHash: text('token_hash').notNull().unique(),
    source: text('source', { enum: ['admin_link', 'mobile_lookup'] })
      .notNull()
      .default('admin_link'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('portal_tokens_source_check', sql`${t.source} in ('admin_link', 'mobile_lookup')`),
    index('portal_tokens_customer_idx').on(t.customerId),
  ],
);

/**
 * Every attempt at the public mobile-number lookup.
 *
 * Serves two purposes: it is the rate-limit source (serverless has no reliable
 * in-memory counter), and it is the audit trail for a lookup route that is, by
 * design, gated only on knowing a phone number. `mobileHash` rather than the
 * number itself so this table is not a harvestable customer list.
 */
export const portalLookups = pgTable(
  'portal_lookups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => orgs.id),
    /** SHA-256 of the peppered mobile number. */
    mobileHash: text('mobile_hash').notNull(),
    ipHash: text('ip_hash'),
    matched: boolean('matched').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('portal_lookups_mobile_time_idx').on(t.mobileHash, t.createdAt),
    index('portal_lookups_ip_time_idx').on(t.ipHash, t.createdAt),
  ],
);

// ------------------------------------------------------ sync bookkeeping --

export const syncRejections = pgTable(
  'sync_rejections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    clientUuid: text('client_uuid').notNull(),
    deviceId: text('device_id'),
    payload: jsonb('payload').notNull(),
    reason: text('reason').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sync_rejections_org_created_idx').on(t.orgId, t.createdAt)],
);

// ------------------------------------------------------------------ views --

/**
 * Live stock, derived from the ledger (§04). Created by migration 0001 and
 * declared `.existing()` here so queries are typed without drizzle-kit trying
 * to own the DDL.
 *
 * `qtyAvailable = qtyOwned - qtyLost - qtyOut`. It can go negative when two
 * devices issue the same item offline; §07.4 says accept both and raise an
 * alert, because the equipment really did leave the yard.
 */
export const vItemStock = pgView('v_item_stock', {
  id: uuid('id').notNull(),
  orgId: uuid('org_id').notNull(),
  name: text('name').notNull(),
  code: text('code'),
  unit: text('unit').notNull(),
  qtyOwned: integer('qty_owned').notNull(),
  qtyOut: integer('qty_out').notNull(),
  qtyLost: integer('qty_lost').notNull(),
  qtyAvailable: integer('qty_available').notNull(),
}).existing();

// ------------------------------------------------------------------ types --

export type Org = typeof orgs.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = User['role'];
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type MovementRow = typeof movements.$inferSelect;
export type NewMovementRow = typeof movements.$inferInsert;
export type PaymentRow = typeof payments.$inferSelect;
export type AdjustmentRow = typeof adjustments.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type PortalToken = typeof portalTokens.$inferSelect;
export type ItemStock = typeof vItemStock.$inferSelect;
