/**
 * Seed one org, one super_admin, and ten realistic items (§13 M2).
 *
 * Rates are typical Kerala scaffolding-hire figures per unit per day. They are
 * a starting point for the yard owner to edit on /items, not gospel.
 *
 * Run with:  pnpm seed
 * Idempotent — safe to re-run against the same database.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

import { auth } from '../lib/auth/auth';
import { DEFAULT_BILLING_CONFIG } from '../lib/accrual';
import { rupeesToPaise } from '../lib/money';
import * as schema from '../lib/db/schema';

const ORG_NAME = process.env.SEED_ORG_NAME ?? 'Bismi Scaffolding';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'owner@example.com';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Yard Owner';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

/**
 * Minimum rental days. 0 — the owner's rule: charge the days actually held
 * (D57). Set a number here if a yard wants a floor per issue lot.
 */
const MINIMUM_DAYS = Number(process.env.SEED_MINIMUM_DAYS ?? 0);

/** §09 bill header. Editable here until the settings screen arrives at M7. */
const YARD_ADDRESS = process.env.SEED_YARD_ADDRESS?.trim() || null;
const YARD_PHONE = process.env.SEED_YARD_PHONE?.trim() || null;
const PAYMENT_TERMS_DAYS = Number(process.env.SEED_PAYMENT_TERMS_DAYS ?? 7);

/** name, code, unit, ₹/day, ₹ replacement, ₹ purchase cost, qty owned */
const ITEMS: Array<[string, string, string, string, string, string, number]> = [
  ['Jack (adjustable prop) 3.0m', 'JCK30', 'nos', '2.00', '450', '380', 600],
  ['Jack (adjustable prop) 3.6m', 'JCK36', 'nos', '2.50', '520', '440', 400],
  ['Span / H-frame 12ft', 'SPN12', 'nos', '4.00', '900', '750', 250],
  ['Span / H-frame 8ft', 'SPN08', 'nos', '3.00', '700', '580', 250],
  ['Centering sheet 3ft x 2ft', 'SHT32', 'nos', '1.00', '260', '210', 2000],
  ['Cup-lock vertical 3.0m', 'CPV30', 'nos', '3.50', '780', '650', 500],
  ['Cup-lock ledger 1.2m', 'CPL12', 'nos', '1.50', '330', '270', 800],
  ['Steel plank 10ft', 'PLK10', 'nos', '3.00', '850', '700', 300],
  ['Base plate', 'BASE', 'nos', '0.50', '150', '120', 700],
  ['Wooden ballie 12ft', 'BAL12', 'nos', '1.50', '300', '240', 400],
];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL (or DATABASE_URL_UNPOOLED) before seeding.');

  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) {
    throw new Error(
      'Set SEED_ADMIN_PASSWORD to at least 10 characters. Refusing to seed a default password.',
    );
  }

  const db = drizzle(neon(url), { schema, casing: 'snake_case' });

  // --- org -----------------------------------------------------------------
  let [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.name, ORG_NAME)).limit(1);

  if (!org) {
    [org] = await db.insert(schema.orgs).values({ name: ORG_NAME }).returning();
    console.log(`Created org "${org.name}"`);
  } else {
    console.log(`Org "${org.name}" already exists`);
  }

  // --- settings ------------------------------------------------------------
  // Billing rules and the invoice counter are written once and then left alone:
  // re-seeding must never reset `next_invoice_no` under issued bills. The yard's
  // own contact details are refreshed every run, so correcting the bill header
  // is an env change rather than a trip to psql.
  await db
    .insert(schema.settings)
    .values({
      orgId: org.id,
      billing: { ...DEFAULT_BILLING_CONFIG, minimum_days: MINIMUM_DAYS },
      invoicePrefix: 'INV',
      nextInvoiceNo: 1,
      termsText: 'Rent is charged per day per unit. Damaged or lost items are charged at replacement rate.',
      paymentTermsDays: PAYMENT_TERMS_DAYS,
      yardAddress: YARD_ADDRESS,
      yardPhone: YARD_PHONE,
    })
    .onConflictDoNothing();

  await db
    .update(schema.settings)
    .set({ yardAddress: YARD_ADDRESS, yardPhone: YARD_PHONE, paymentTermsDays: PAYMENT_TERMS_DAYS })
    .where(eq(schema.settings.orgId, org.id));

  if (!YARD_ADDRESS || !YARD_PHONE) {
    console.warn(
      'Warning: SEED_YARD_ADDRESS / SEED_YARD_PHONE are empty. Bills will print without the yard address and phone.',
    );
  }

  // --- super admin ---------------------------------------------------------
  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, ADMIN_EMAIL))
    .limit(1);

  if (existingUser) {
    console.log(`User ${ADMIN_EMAIL} already exists`);
  } else {
    const created = await auth().api.signUpEmail({
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: ADMIN_NAME, orgId: org.id },
    });

    if (!created?.user?.id) throw new Error('Better Auth did not create the seed user.');

    await db
      .update(schema.users)
      .set({ orgId: org.id, role: 'super_admin', isActive: true, emailVerified: true })
      .where(eq(schema.users.id, created.user.id));

    console.log(`Created super_admin ${ADMIN_EMAIL}`);
  }

  // --- items ---------------------------------------------------------------
  let added = 0;
  for (const [index, row] of ITEMS.entries()) {
    const [name, code, unit, rate, replacement, cost, qtyOwned] = row;

    const result = await db
      .insert(schema.items)
      .values({
        orgId: org.id,
        name,
        code,
        unit,
        ratePerDay: rupeesToPaise(rate),
        replacementRate: rupeesToPaise(replacement),
        purchaseCost: rupeesToPaise(cost),
        qtyOwned,
        sortOrder: index,
      })
      .onConflictDoNothing({ target: [schema.items.orgId, schema.items.code] })
      .returning({ id: schema.items.id });

    added += result.length;
  }

  console.log(`Items: ${added} added, ${ITEMS.length - added} already present`);
  console.log('\nSeed complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
