# Yard Ledger

Rental management for a construction equipment yard — jacks, spans, sheets,
cup-lock. An append-only movement ledger with day-wise rent accrual, an
offline-capable admin surface, and a token-linked customer portal.

| | |
|---|---|
| Stack | Next.js 15 · Neon · Drizzle · Better Auth |
| Client | PWA, offline-first |
| Region | India · INR · Asia/Kolkata |

**[`docs/spec.html`](docs/spec.html) is the single source of truth.** Open it in
a browser. Where it is silent, take the simplest option that does not contradict
it and record the choice in [`docs/decisions.md`](docs/decisions.md).

Setting this up, deploying it, or running the yard on it?
**[`docs/runbook.md`](docs/runbook.md)** is the step-by-step.

## Non-negotiable rules

1. `movements` is **append-only**. Never `UPDATE` or `DELETE` a movement row —
   corrections are reversing entries.
2. Never store a computed balance or stock count as a mutable column. Derive by
   replaying events.
3. All money is integer **paise**. No floats anywhere, including in JSON.
4. All rent dates are calendar `date`s, not timestamps. Never pass a JS `Date`
   into the accrual engine.
5. Every table carries `org_id`.

## Getting started

```bash
pnpm install
cp .env.example .env.local     # then fill it in
pnpm db:migrate                # apply migrations to a Neon branch
pnpm seed                      # one org, one super_admin, ten items
pnpm dev
```

Checks:

```bash
pnpm test        # 225 tests, incl. Postgres-backed schema and lifecycle tests
pnpm typecheck
pnpm lint
```

## Roles

Two logins. Customers never log in.

| | |
|---|---|
| `super_admin` | Everything, plus item rates, users, and billing settings |
| `admin` | Issue, return, payments, bills, adjustments, reversals, reports |

Authorisation lives in exactly one place — `lib/auth/capabilities.ts`. Nothing
else may branch on `role`.

## Customer access

Customers reach their bills two ways, both read-only, both redeemed through the
same `resolvePortalToken`:

- **Signed link** — the admin taps *Share statement* and sends it over WhatsApp.
  Valid 90 days, revocable.
- **Mobile lookup** — the customer types their own number and gets a 24-hour
  session.

> The lookup page is gated only on knowing a mobile number, which is not a
> secret. Rate limits, an audit trail, and a short session bound the exposure —
> see D19 in `docs/decisions.md` for the full posture and the zero-cost way to
> close it if the yard wants that.

## Progress

| Milestone | | |
|---|---|---|
| M1 | Accrual engine | ✅ FIFO lot engine, 12 spec vectors |
| M2 | Schema & auth | ✅ schema, migrations, roles, portal tokens |
| M3 | Core ledger, online only | ✅ CRUD, issue & return flows, account screen, stock |
| M4 | Money — bills & payments | ✅ bills, PDFs, payments, allocation, WhatsApp |
| M5 | Offline layer | ◑ writes queue and land once; reads work on a visited screen |
| M6 | Customer portal | not started |
| M7 | Reports & polish | not started |

Work milestone by milestone through §13. Do not start one until the previous
milestone's acceptance criteria pass.

## Layout

```
/app                routes and route handlers only — thin
/lib/accrual        pure engine, no I/O          ← test heavily
/lib/db             drizzle schema, client, queries
/lib/auth           better-auth config, capabilities, guard
/lib/sync           outbox, dexie schema, drain, cursor
/lib/validation     zod schemas shared client + server
/components/ui      primitives
/components/domain  IssueForm, ReturnSheet, LedgerRow, BalanceCard
/docs/decisions.md  every judgement call made while building
```

## Screens

Five destinations on the bottom bar — Home · Issue · Return · Accounts · More —
and everything else hangs off them.

| | |
|---|---|
| `/` | Out on hire, today's gate passes, over-limit customers, stock alerts |
| `/issue` | Customer → site → date → items, with live availability and a running ₹/day |
| `/return` | Site → outstanding list → qty in, per line good · damaged · lost |
| `/accounts/[id]` | The working screen: balance, what is out, actions, full ledger |
| `/customers` | Search, outstanding per contractor, credit limits |
| `/stock` | Owned · out · lost · available, with low and negative alerts |
| `/items` | The master and its rates (`super_admin`) |
| `/accounts/[id]/bill` | Bill preview: every line, editable adjustments, one commit |
| `/bills/[id]` | The invoice, its PDFs, and the WhatsApp composer |
| `/payments/new` | Record money already received |

A rate change on `/items` never moves a figure on an account that already has
equipment out — every ISSUE carries its own `rate_snapshot` (§02), and
`lib/movements/lifecycle.test.ts` proves it.

## Money

The yard does **not** collect money through this software. There is no payment
gateway: cash and UPI change hands in the yard, and `/payments/new` records that
they did. What the software does is keep the arithmetic straight.

- **Bills freeze.** Lines are written to JSONB at issue and the database refuses
  to update or delete the row. Re-price an item afterwards and the bill does not
  move — `lib/bills/lifecycle.test.ts` is the §13 M4 criterion, as a test.
- **Periods never overlap.** A bill charges the difference between the account
  accrued to the period end and accrued to the day before it started, so each
  unit is charged for every day it was out, exactly once, across every bill.
- **Payments settle oldest bill first**, automatically. Surplus stays as an
  advance and lands on the next invoice by itself.
- **Status per bill and per account**: pending · partial · paid · overdue, with
  the overdue queue on the dashboard.
- **Nothing is sent automatically.** Statements, invoices, receipts, and
  reminders are composed and opened in the admin's own WhatsApp (§09).

## Offline

The PWA installs to the home screen and the shell opens with no signal. What is
built, and what is not, stated plainly:

- **Writes survive.** Issue, return, and payment queue on the phone when there
  is no signal, return immediately, and drain in the background — on reconnect,
  on focus, and every 30 seconds. The receipt says *"Saved on this phone"*, not
  "Recorded", until it lands.
- **They land exactly once.** Every entry carries a device-minted id and every
  write hits a `(org_id, client_uuid)` unique index, so pushing the same queue
  twice changes nothing and returns the same server ids.
- **A refusal is confined.** A return that no longer fits when it reaches the
  yard is rejected on its own; the rest of the gate pass commits, and the
  refusal appears under *Needs attention* on `/sync` with the reason.
- **Nothing stale is passed off as current.** `/api/*` is never served from a
  cache; the status chip and `/sync` say how old the mirror is.
- **Reads come from the device.** Items, availability, open sites, and what a
  site still holds are recomputed on the phone by the same pure engine the
  server uses, so `/issue` and `/return` work with no signal — and a test pins
  the device's availability arithmetic to `v_item_stock` so the two cannot
  drift. Balances are left blank offline rather than guessed.
- **The limit:** those routes are server-rendered, so a screen never visited on
  this phone has no cached shell and reaches the offline page instead. See D55a.

## Ledger integrity

The two invariants the whole product rests on are enforced by database
triggers, not by convention:

- **`movements` is append-only.** `DELETE` is refused; `UPDATE` is refused for
  every column that decides what was billed. Corrections are `REVERSAL` rows.
  (`photo_url` and `signature_url` are the one exception — offline photo uploads
  land after the row syncs.)
- **A bill is immutable once issued.** Corrections are a credit adjustment plus
  a new bill.

`lib/db/schema.test.ts` proves both against a real Postgres — PGlite (Postgres
compiled to WASM) applies the committed migration files verbatim, so the tests
exercise the same SQL that runs on Neon. No Docker needed.

## The accrual engine

`lib/accrual/` is pure and dependency-free — it may not import a database
client, a framework primitive, or anything that reads the clock. A test enforces
that (`purity.test.ts`); breaking it fails the build.

```ts
import { accrue, DEFAULT_BILLING_CONFIG } from '@/lib/accrual';

const result = accrue(movements, DEFAULT_BILLING_CONFIG, '2026-01-31');
// → rentTotal, damageTotal, outstanding, openLots, lines
```

Returns consume issue lots **FIFO** (§03.2). This is mandatory, not an
optimisation: without it a customer who takes 100 jacks in January and 100 more
in June, then returns 100, is billed incorrectly and the error compounds
silently.

> **Before the first real bill**, the yard owner must confirm the five questions
> at the end of `docs/decisions.md` — day counting, minimum rental period,
> whether both the issue and return day are billed, damage pricing, and rate
> visibility. Getting these wrong invalidates every bill the system produces.
