/**
 * Correcting mistakes: editing an issue, and deleting a site or customer
 * added by mistake. Real services against PGlite, like the lifecycle test.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deleteAccount,
  getAccountDetail,
  listAccounts,
  openAccount,
  updateAccount,
} from "../accounts/service";
import type { StaffSession } from "../auth/guard";
import {
  createCustomer,
  deleteCustomer,
  searchCustomers,
  updateCustomer,
} from "../customers/service";
import { __setTestDatabase } from "../db/client";
import { createTestDatabase, type TestDatabase } from "../db/harness";
import { isLedgerError } from "../errors";
import { amendIssue, recordMovementBatch } from "./service";

const TODAY = "2026-06-30";

let db: TestDatabase;
let session: StaffSession;
let orgId: string;
let jackId: string;
let spanId: string;
let counter = 0;
const key = () => `amend-test-${String(++counter).padStart(4, "0")}`;

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Amend Yard') returning id`,
  );
  orgId = org.id;
  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@amend.test', 'Owner', 'super_admin') returning id`,
    [org.id],
  );
  const [jack] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, qty_owned, minimum_days)
     values ($1, 'Jack', 'JCK', 200, 500, 1) returning id`,
    [org.id],
  );
  jackId = jack.id;
  const [span] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, qty_owned, minimum_days)
     values ($1, 'Span', 'SPN', 400, 500, 1) returning id`,
    [org.id],
  );
  spanId = span.id;

  session = {
    userId: user.id,
    orgId: org.id,
    role: "super_admin",
    email: "owner@amend.test",
    name: "Owner",
  };
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

let mobileSeq = 0;
async function newSite() {
  mobileSeq += 1;
  const customer = await createCustomer(session, {
    name: `Contractor ${mobileSeq}`,
    mobile: `+91984600${String(mobileSeq).padStart(4, "0")}`,
    creditLimit: 0,
  });
  const site = await openAccount(session, {
    customerId: customer.id,
    siteName: "Kakkanad",
    openedOn: "2026-06-01",
  });
  return { customerId: customer.id, accountId: site.id };
}

async function issue(
  accountId: string,
  movedAt: string,
  lines: Array<[string, number]>,
) {
  const result = await recordMovementBatch(
    session,
    {
      accountId,
      type: "ISSUE",
      movedAt,
      lines: lines.map(([itemId, qty]) => ({ itemId, qty, clientUuid: key() })),
      gatePassNo: "GP-1",
    },
    TODAY,
  );
  return result.movements.map((m) => m.id);
}

async function outstanding(accountId: string) {
  const detail = await getAccountDetail(session, accountId, TODAY);
  return Object.fromEntries(
    detail.outstanding.map((line) => [line.itemId, line.qtyOut]),
  );
}

async function rejection(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    if (isLedgerError(error)) return error.message;
    throw error;
  }
  throw new Error("Expected a rejection");
}

describe("amendIssue", () => {
  it("changes a quantity and removes a line, keeping the original rate", async () => {
    const { accountId } = await newSite();
    const [jackLine, spanLine] = await issue(accountId, "2026-06-10", [
      [jackId, 100],
      [spanId, 40],
    ]);

    // The master rate moves after the issue; the correction must not reprice.
    await db.query(`update items set rate_per_day = 999 where id = $1`, [
      jackId,
    ]);

    const result = await amendIssue(
      session,
      {
        accountId,
        movementIds: [jackLine, spanLine],
        lines: [{ movementId: jackLine, qty: 80 }],
        movedAt: "2026-06-10",
        gatePassNo: "GP-1",
        reason: "Typed 100, sent 80",
        clientUuid: key(),
      },
      TODAY,
    );
    await db.query(`update items set rate_per_day = 200 where id = $1`, [
      jackId,
    ]);

    expect(result.changed).toBe(true);
    expect(result.reversalIds).toHaveLength(2);
    expect(result.movementIds).toHaveLength(1);
    expect(await outstanding(accountId)).toEqual({ [jackId]: 80 });

    const [row] = await db.query<{ rate_snapshot: number }>(
      `select rate_snapshot from movements where id = $1`,
      [result.movementIds[0]],
    );
    expect(Number(row.rate_snapshot)).toBe(200);
  });

  it("moves the date and billing start for every line", async () => {
    const { accountId } = await newSite();
    const ids = await issue(accountId, "2026-06-10", [[jackId, 10]]);

    const result = await amendIssue(
      session,
      {
        accountId,
        movementIds: ids,
        lines: [{ movementId: ids[0], qty: 10 }],
        movedAt: "2026-06-12",
        billFrom: "2026-06-13",
        reason: "Wrong day",
        clientUuid: key(),
      },
      TODAY,
    );

    const [row] = await db.query<{
      moved_at: string;
      bill_from: string;
      gate_pass_no: string | null;
    }>(
      `select moved_at::text, bill_from::text, gate_pass_no from movements where id = $1`,
      [result.movementIds[0]],
    );
    expect(row).toEqual({
      moved_at: "2026-06-12",
      bill_from: "2026-06-13",
      gate_pass_no: null,
    });
  });

  it("does nothing when nothing differs", async () => {
    const { accountId } = await newSite();
    const ids = await issue(accountId, "2026-06-10", [[jackId, 10]]);
    const result = await amendIssue(
      session,
      {
        accountId,
        movementIds: ids,
        lines: [{ movementId: ids[0], qty: 10 }],
        movedAt: "2026-06-10",
        gatePassNo: "GP-1",
        reason: "No change",
        clientUuid: key(),
      },
      TODAY,
    );
    expect(result).toEqual({
      changed: false,
      reversalIds: [],
      movementIds: [],
    });
  });

  it("is safe to send twice", async () => {
    const { accountId } = await newSite();
    const ids = await issue(accountId, "2026-06-10", [[jackId, 10]]);
    const input = {
      accountId,
      movementIds: ids,
      lines: [{ movementId: ids[0], qty: 7 }],
      movedAt: "2026-06-10",
      gatePassNo: "GP-1",
      reason: "Sent seven",
      clientUuid: key(),
    };
    const first = await amendIssue(session, input, TODAY);
    const second = await amendIssue(session, input, TODAY);
    expect(second.movementIds).toEqual(first.movementIds);
    expect(await outstanding(accountId)).toEqual({ [jackId]: 7 });
  });

  it("refuses once something has been returned", async () => {
    const { accountId } = await newSite();
    const ids = await issue(accountId, "2026-06-10", [[jackId, 10]]);
    await recordMovementBatch(
      session,
      {
        accountId,
        type: "RETURN",
        movedAt: "2026-06-15",
        lines: [{ itemId: jackId, qty: 2, clientUuid: key() }],
      },
      TODAY,
    );

    const message = await rejection(
      amendIssue(
        session,
        {
          accountId,
          movementIds: ids,
          lines: [{ movementId: ids[0], qty: 12 }],
          movedAt: "2026-06-10",
          reason: "More went",
          clientUuid: key(),
        },
        TODAY,
      ),
    );
    expect(message).toMatch(/already been returned/);
  });

  it("refuses once a bill covers it", async () => {
    const { accountId } = await newSite();
    const ids = await issue(accountId, "2026-06-10", [[jackId, 10]]);
    await db.query(
      `insert into bills (org_id, account_id, invoice_no, period_from, period_to, rent_total, grand_total, lines)
       values ($1, $2, 'INV-0042', '2026-06-01', '2026-06-20', 0, 0, '[]'::jsonb)`,
      [orgId, accountId],
    );

    const message = await rejection(
      amendIssue(
        session,
        {
          accountId,
          movementIds: ids,
          lines: [],
          movedAt: "2026-06-10",
          reason: "Never went",
          clientUuid: key(),
        },
        TODAY,
      ),
    );
    expect(message).toMatch(/INV-0042/);
  });
});

describe("editing and deleting customers and sites", () => {
  it("renames a site", async () => {
    const { accountId } = await newSite();
    const site = await updateAccount(session, accountId, {
      siteName: "Edappally",
    });
    expect(site.siteName).toBe("Edappally");
  });

  it("says who already has a mobile number", async () => {
    const a = await newSite();
    await newSite();
    const message = await rejection(
      updateCustomer(session, a.customerId, {
        mobile: `+91984600${String(mobileSeq).padStart(4, "0")}`,
      }),
    );
    expect(message).toMatch(/already registered/);
  });

  it("deletes a site only once its issues are gone", async () => {
    const { customerId, accountId } = await newSite();
    const ids = await issue(accountId, "2026-06-10", [[jackId, 5]]);

    expect(await rejection(deleteAccount(session, accountId))).toMatch(
      /equipment entries/,
    );

    await amendIssue(
      session,
      {
        accountId,
        movementIds: ids,
        lines: [],
        movedAt: "2026-06-10",
        reason: "Wrong site",
        clientUuid: key(),
      },
      TODAY,
    );
    await deleteAccount(session, accountId);

    const sites = await listAccounts(
      session,
      { customerId, status: "all" },
      TODAY,
    );
    expect(sites).toHaveLength(0);
  });

  it("refuses to delete a site with a payment", async () => {
    const { accountId } = await newSite();
    await db.query(
      `insert into payments (org_id, account_id, amount, method, paid_on, client_uuid)
       values ($1, $2, 10000, 'cash', '2026-06-20', $3)`,
      [orgId, accountId, key()],
    );
    expect(await rejection(deleteAccount(session, accountId))).toMatch(
      /payment/,
    );
  });

  it("deletes a customer and frees their number", async () => {
    const { customerId } = await newSite();
    const [{ mobile }] = await db.query<{ mobile: string }>(
      `select mobile from customers where id = $1`,
      [customerId],
    );

    const result = await deleteCustomer(session, customerId);
    expect(result.deletedSites).toHaveLength(1);

    const found = await searchCustomers(session, mobile, 10, TODAY);
    expect(found).toHaveLength(0);

    const again = await createCustomer(session, {
      name: "Same Number",
      mobile,
      creditLimit: 0,
    });
    expect(again.id).not.toBe(customerId);
  });
});
