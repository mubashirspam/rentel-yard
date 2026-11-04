/**
 * Test helper: empty all business data, keep the org, settings and staff
 * logins, and set SEED_ADMIN_EMAIL's password to SEED_ADMIN_PASSWORD.
 *
 *   npx tsx --env-file=.env.local scripts/reset-data.mts
 *
 * TRUNCATE is used because movements and bills refuse row DELETEs by design.
 * Only for databases with no real customers.
 */
import { neon } from '@neondatabase/serverless';
import { hashPassword } from 'better-auth/crypto';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!url || !email || !password) throw new Error('DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD required.');

const sql = neon(url);
const host = new URL(url).host;

await sql`TRUNCATE customers, items, accounts, movements, payments, adjustments, bills,
  payment_allocations, portal_tokens, portal_lookups, sync_rejections, auth_sessions
  RESTART IDENTITY CASCADE`;
await sql`UPDATE settings SET next_invoice_no = 1`;

const hash = await hashPassword(password);
const updated = await sql`
  UPDATE auth_accounts SET password = ${hash}, updated_at = now()
  WHERE provider_id = 'credential' AND user_id = (SELECT id FROM users WHERE email = ${email})
  RETURNING user_id`;

const [counts] = await sql`SELECT
  (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM items) AS items,
  (SELECT count(*) FROM movements) AS movements, (SELECT count(*) FROM users) AS users`;

console.log(`${host}: emptied. left →`, counts, `| password set for ${email}: ${updated.length === 1}`);
