/**
 * Test helper: fix English spellings in the owner's item names. Local yard
 * names (Jakki, Thoni, Chatty, Kotta, …) are kept. Safe to run twice. Phones
 * pick the new names up on their next sync (the server_seq trigger).
 *
 *   npx tsx --env-file=.env.local scripts/rename-items.mts
 *   npx tsx --env-file=.env.production scripts/rename-items.mts
 */
import { neon } from '@neondatabase/serverless';

const RENAMES: Array<[from: string, to: string]> = [
  ['Paip kuth', 'Pipe kuth'],
  ['Paint paip — 6 metres', 'Paint pipe — 6 metres'],
  ['Paint paip — 3 metres', 'Paint pipe — 3 metres'],
  ['Lindil sheet — 8 feet', 'Lintel sheet — 8 feet'],
  ['Lindil sheet — 4 feet', 'Lintel sheet — 4 feet'],
  ['Shavval', 'Shovel'],
];

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required.');
const sql = neon(url);

let renamed = 0;
for (const [from, to] of RENAMES) {
  renamed += (await sql`UPDATE items SET name = ${to} WHERE name = ${from} RETURNING id`).length;
}
console.log(`${new URL(url).host.split('.')[0]}: renamed ${renamed} items`);
