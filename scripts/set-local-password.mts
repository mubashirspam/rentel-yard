/**
 * Dev helper: set SEED_ADMIN_EMAIL's password to SEED_ADMIN_PASSWORD on the
 * database in the env file you pass. The seed script never changes the
 * password of a user that already exists.
 *
 *   npx tsx --env-file=.env.local scripts/set-local-password.mts
 *
 * Never run it with .env.production.
 */
import { neon } from '@neondatabase/serverless';
import { hashPassword } from 'better-auth/crypto';

const url = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!url || !email || !password) throw new Error('DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required.');

const sql = neon(url);
const hash = await hashPassword(password);
const rows = await sql`
  update auth_accounts set password = ${hash}, updated_at = now()
  where provider_id = 'credential'
    and user_id = (select id from users where email = ${email})
  returning user_id`;

console.log(rows.length === 1 ? `Password updated for ${email}` : `No credential account found for ${email} — run npm run seed first.`);
