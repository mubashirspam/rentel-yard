/**
 * The customer hub's arithmetic, against a contractor with two jobs.
 *
 * The redesign put one contractor's whole story on one screen, and the figure
 * that screen turns on is *to bill*: rent that has accrued and is on no
 * invoice. It is derived — the balance less what is still owed on issued bills
 * — because a stored counter would drift (§00 rule 2), and it is derived twice
 * in the codebase: once per account by `getMoneySummary`, and once in bulk
 * here. These tests pin them to each other. If they can disagree, the *To bill*
 * tab and the site screen behind it will show a contractor two different
 * numbers for the same work.
 *
 * The other property under test is the clamp. Unbilled is floored at zero **per
 * site**, so a job billed slightly ahead of its accrual cannot quietly cancel
 * out a second job that genuinely needs an invoice.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openAccount } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { issueBill } from '../bills/service';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { recordMovementBatch } from '../movements/service';
import { addAdjustment, getMoneySummary, recordPayment } from '../payments/service';
import { getCustomerHub } from './hub';

/** ₹2.00 per jack per day. */
const RATE = 200;
const OPENED = '2026-06-01';
const ASOF = '2026-06-30';

let db: TestDatabase;
let session: StaffSession;
let customerId: string;
let billedSite: string;
let unbilledSite: string;

let uuidCounter = 0;
const nextUuid = () => `hub-test-${String((uuidCounter += 1)).padStart(4, '0')}`;

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Hub Yard') returning id`,
  );

  // No minimum days, matching the owner's answer (D57), so the sums below are
  // simply days × rate and a wrong figure is obvious rather than plausible.
  await db.query(
    `insert into settings (org_id, billing, invoice_prefix, next_invoice_no, payment_terms_days)
     values ($1, $2::jsonb, 'INV', 1, 7)`,
    [
      org.id,
      JSON.stringify({
        day_count_mode: 'inclusive_start',
        minimum_days: 0,
        minimum_days_applies: 'per_issue_lot',
        rounding: 'nearest_rupee',
        damage_charge_mode: 'replacement_rate',
        accrual_stops_on_bill: false,
      }),
    ],
  );

  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@hub.test', 'Yard Owner', 'super_admin') returning id`,
    [org.id],
  );

  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Ibrahim', '+919846011111')
     returning id`,
    [org.id],
  );
  customerId = customer.id;

  const [jack] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Jack 3.0m', 'JCK30', $2, 45000, 600) returning id`,
    [org.id, RATE],
  );

  session = {
    userId: user.id,
    orgId: org.id,
    role: 'super_admin',
    email: 'owner@hub.test',
    name: 'Yard Owner',
  };

  const first = await openAccount(session, {
    customerId,
    siteName: 'Kakkanad',
    openedOn: OPENED,
  });
  billedSite = first.id;

  const second = await openAccount(session, {
    customerId,
    siteName: 'Mananthavady',
    openedOn: OPENED,
  });
  unbilledSite = second.id;

  // 10 jacks to each site on 01-Jun, both still out on 30-Jun.
  // inclusive_start over 01→30 Jun is 29 days: 10 × 29 × ₹2 = ₹580 per site.
  for (const accountId of [billedSite, unbilledSite]) {
    await recordMovementBatch(
      session,
      {
        accountId,
        type: 'ISSUE',
        movedAt: OPENED,
        gatePassNo: null,
        lines: [{ itemId: jack.id, qty: 10, clientUuid: nextUuid() }],
      },
      ASOF,
    );
  }

  // Only the first site is invoiced.
  await issueBill(session, { accountId: billedSite, periodFrom: OPENED, periodTo: ASOF }, ASOF);
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

describe('the customer hub', () => {
  it('gathers every site the contractor holds, out first', async () => {
    const hub = await getCustomerHub(session, customerId, ASOF);

    expect(hub.customer.name).toBe('Ibrahim');
    expect(hub.sites).toHaveLength(2);
    expect(hub.totals.siteCount).toBe(2);
    expect(hub.totals.sitesOut).toBe(2);
    expect(hub.totals.qtyOut).toBe(20);
  });

  it('bills nothing on a site whose rent is already on an invoice', async () => {
    const hub = await getCustomerHub(session, customerId, ASOF);
    const site = hub.sites.find((row) => row.accountId === billedSite)!;

    expect(site.billed).toBe(58_000); // ₹580 frozen into the invoice
    expect(site.pendingOnBills).toBe(58_000); // and none of it paid yet
    expect(site.unbilled).toBe(0);
  });

  it('bills the whole accrual on a site that has never been invoiced', async () => {
    const hub = await getCustomerHub(session, customerId, ASOF);
    const site = hub.sites.find((row) => row.accountId === unbilledSite)!;

    expect(site.billed).toBe(0);
    expect(site.bills).toEqual([]);
    expect(site.unbilled).toBe(58_000);
  });

  /*
   * The invariant. `getMoneySummary` is what the site screen and the payment
   * form read; the hub derives the same figure in bulk, and the two must agree
   * for every site or the contractor is shown two answers.
   */
  it('agrees with getMoneySummary on every site', async () => {
    const hub = await getCustomerHub(session, customerId, ASOF);

    for (const site of hub.sites) {
      const summary = await getMoneySummary(session, site.accountId, ASOF);

      expect(site.balance).toBe(summary.balance);
      expect(site.pendingOnBills).toBe(summary.pendingOnBills);
      expect(site.unbilled).toBe(Math.max(0, summary.unbilled));
    }
  });

  it('totals to the sum of its sites', async () => {
    const hub = await getCustomerHub(session, customerId, ASOF);

    expect(hub.totals.unbilled).toBe(58_000); // one site's worth, not two
    expect(hub.totals.balance).toBe(
      hub.sites.reduce((sum, site) => sum + site.balance, 0),
    );
    expect(hub.totals.pendingOnBills).toBe(
      hub.sites.reduce((sum, site) => sum + site.pendingOnBills, 0),
    );
  });

  it('drops a site out of "to bill" once its invoice is settled', async () => {
    await recordPayment(
      session,
      {
        accountId: billedSite,
        amount: 58_000,
        paidOn: ASOF,
        method: 'cash',
        reference: null,
        clientUuid: nextUuid(),
      },
      ASOF,
    );

    const hub = await getCustomerHub(session, customerId, ASOF);
    const site = hub.sites.find((row) => row.accountId === billedSite)!;

    expect(site.pendingOnBills).toBe(0);
    expect(site.balance).toBe(0);
    expect(site.unbilled).toBe(0);
    expect(site.bills[0].status).toBe('paid');
  });

  /*
   * A yard may bill ahead of the accrual — a minimum charge, a manual credit.
   * Clamping per site rather than on the total is what stops one job's
   * over-billing from hiding another job that needs an invoice.
   */
  it('clamps a site billed ahead of its accrual at zero, not below', async () => {
    // A ₹300 credit on the settled site drives its balance negative while
    // nothing is owed on its bills — "minus ₹300 to bill", unclamped.
    await addAdjustment(
      session,
      {
        accountId: billedSite,
        kind: 'credit',
        amount: 30_000,
        reason: 'Goodwill',
        appliedOn: ASOF,
        clientUuid: nextUuid(),
      },
      ASOF,
    );

    const hub = await getCustomerHub(session, customerId, ASOF);
    const overBilled = hub.sites.find((row) => row.accountId === billedSite)!;

    expect(overBilled.balance).toBe(-30_000);
    expect(overBilled.pendingOnBills).toBe(0);
    expect(overBilled.unbilled).toBe(0);

    // And it does not eat into the other site's figure: the contractor still
    // has a full ₹580 of work nobody has invoiced.
    expect(hub.totals.unbilled).toBe(58_000);
  });
});
