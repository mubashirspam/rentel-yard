/**
 * Test helper: add the owner's supplied item list (docs/flutter/REQUIREMENTS §8).
 * Quantity → owned stock, rate → rupees per unit per day. Skips names that
 * already exist, so it is safe to run twice.
 *
 *   npx tsx --env-file=.env.local scripts/add-owner-items.mts
 */
import { neon } from '@neondatabase/serverless';

const ITEMS: Array<[name: string, qty: number, rupeesPerDay: number]> = [
  ['Span — 8 feet', 30, 7],
  ['Jakki', 100, 5],
  ['Pipe kuth', 100, 4],
  ['KD sheet', 72, 2],
  ['Concrete sheet', 2, 100],
  ['Thoni', 1, 200],
  ['Scaffold', 12, 100],
  ['Urbana', 2, 100],
  ['Paint pipe — 6 metres', 15, 15],
  ['Paint pipe — 3 metres', 15, 10],
  ['Lintel sheet — 8 feet', 50, 10],
  ['Lintel sheet — 4 feet', 40, 5],
  ['Vibrator', 2, 400],
  ['Chatty', 6, 30],
  ['Kotta', 7, 20],
  ['Kolamkori', 2, 30],
  ['Kaikot', 3, 30],
  ['Shovel', 2, 30],
  ['Shu', 2, 50],
  ['Tile cutter', 1, 100],
  ['Barrel', 5, 50],
  ['Idi mutti', 1, 50],
];

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required.');
const sql = neon(url);

const orgs = await sql`SELECT id FROM orgs`;
if (orgs.length !== 1) throw new Error(`Expected one org, found ${orgs.length}.`);
const orgId = orgs[0].id;

let added = 0;
for (const [i, [name, qty, rupees]] of ITEMS.entries()) {
  const rows = await sql`
    INSERT INTO items (org_id, name, unit, rate_per_day, qty_owned, sort_order)
    SELECT ${orgId}, ${name}, 'nos', ${rupees * 100}, ${qty}, ${i + 1}
    WHERE NOT EXISTS (SELECT 1 FROM items WHERE org_id = ${orgId} AND name = ${name})
    RETURNING id`;
  added += rows.length;
}

const [t] = await sql`SELECT count(*) AS items, sum(qty_owned * rate_per_day) AS paise
  FROM items WHERE org_id = ${orgId}`;
console.log(`${new URL(url).host}: added ${added}; now ${t.items} items, qty × rate = ₹${Number(t.paise) / 100}`);
