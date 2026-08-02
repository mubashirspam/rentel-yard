# Decisions

Every judgement call made while building, per §00 of the build specification.
Where the spec is silent, the simplest option that does not contradict it was
chosen and recorded here. Where the spec is *wrong*, that is flagged loudly.

---

## M1 — Accrual engine

### D1. §03.5 vector 10 contains an arithmetic error — implemented the correct figure

**Spec says:** `3×15(min) + 3×20 + 4×30 = 90+60+120 = 270 unit-days × ₹2 = ₹540`

`3 × 15` is 45, not 90. The stated components give `45 + 60 + 120 = 225` unit-days,
which at ₹2/day is **₹450**. Every other term in the vector is consistent with the
FIFO algorithm, so the slip is in that one multiplication rather than in the
intent.

`lib/accrual/engine.test.ts` encodes **₹450** and carries a comment pointing at
this entry. **This needs the yard owner's confirmation before any real bill is
issued** — if they actually expect ₹540, the minimum-days rule is not what §03.1
describes and the engine needs rework, not a patched constant.

### D2. Minimum days apply per FIFO *slice*, not per whole lot

`minimum_days_applies: per_issue_lot` (§03.1) does not say what happens when one
lot is returned in several parts. Two readings:

- **Per slice** (chosen): each consumed slice is floored at 15 days independently.
- Per lot: the floor is checked once against the lot's total span.

Vector 5 settles it — 5 units returned on day 10 out of a lot still partly open
are billed 15 days, which only the per-slice reading produces. Vector 10 agrees.

Open lot remainders are floored the same way at `asOf`.

### D3. One rent line per slice, not per lot

`AccrualResult.lines` is described as "one per lot, for the bill" (§03.2). A lot
returned in three parts has three different day counts, so it cannot be one line.
Lines are emitted per consumed slice, plus one per open remainder. A lot returned
in one go still produces exactly one line, so the §09 bill layout is unaffected.

### D4. Damage lines are a separate array

The spec's `AccrualResult` carries `damageTotal` but no damage detail, while the
§09 bill needs to print `Damaged: Jack 3.0m × 4 @ ₹450`. Added `damageLines: DamageLine[]`
alongside `lines`. One entry per RETURN_DAMAGED / LOST movement (not per slice) —
the charge is per unit and does not vary by lot.

### D5. `damage_charge_mode` governs the UI, not the calculation

§03.2 charges `manualCharge ?? replacementSnapshot` unconditionally, while §03.1
presents `damage_charge_mode` as choosing between the two. Followed §03.2: a
supplied `manualCharge` always wins. The config setting decides whether the
damage form *asks* for an amount. Same result under both readings, no branch in
the engine.

### D6. Movements dated after `asOf` are excluded; reversals always apply

Not covered by the spec. `accrue()` drops non-reversal movements whose `movedAt`
is later than the valuation date, so billing a period is a matter of passing
`period_to` rather than pre-filtering at every call site.

Reversals are applied regardless of their own date, because a reversal means the
original movement never happened — vector 7 expects ₹0, not "₹0 only once the
reversal date has passed".

### D7. Same-date ties break ISSUE-first

§03.2 sorts by `(movedAt asc, createdAt asc)` and stops there. When both are
equal, an ISSUE is ordered before a consuming movement, since that is the only
ordering that can succeed. Ties beyond that fall back to `id`, so the sort is
total and the output is byte-stable.

**Risk worth raising:** an issue and a return on the same `movedAt` where the
return has the *earlier* `createdAt` — plausible after an offline sync — will be
rejected as `RETURN_EXCEEDS_OUTSTANDING` under the spec's stated sort. See
"Open questions" below.

### D8. `rounding: 'none'` added alongside `nearest_rupee`

§03.1 gives `nearest_rupee` as the default and names no alternative. Added
`'none'` so the day-counting tests can assert exact paise without a rounding
step in the way. Rounds half away from zero, matching hand-rounding, rather than
`Math.round`'s behaviour on negatives.

### D9. `outstanding` includes items that have gone back to zero

Keys are every item that appears in the (post-reversal) ledger, with `0` for
fully returned items. This makes the §02 "cannot close while anything is out"
check a plain `Object.values(...).every(qty => qty === 0)` — exposed as
`isAccountEmpty()`. An item whose only movement was reversed disappears entirely,
so `outstandingFor()` defaults a missing key to 0.

### D10. `lostByItem` added to the result

§02 says LOST "reduces effective owned stock". The stock view needs that number
per item and cannot get it from `damageTotal`, so the engine returns it.

### D11. Errors live in `/lib/errors.ts`, not inside the engine

§14 wants error codes in one shared enum. `LedgerError` carries `code`, `field`,
and `context`, and has `toEnvelope()` producing the §06 error shape directly —
so route handlers serialise rather than reformat. The module has no imports at
all, keeping the engine's dependency-free guarantee intact.

### D12. Date arithmetic is hand-rolled, anchored on UTC

M1 permits "a date helper". `lib/accrual/dates.ts` is ~90 lines with no
dependencies, so no library was added. Parsing anchors on UTC midnight
(`setUTCFullYear`, not `Date.UTC`, so years under 100 are not remapped into the
1900s) and every date round-trips through validation, which rejects `2026-02-30`.
The strings themselves are Asia/Kolkata calendar days; UTC anchoring only keeps
daylight-saving and local-offset effects out of the subtraction.

### D13. `formatPaise` splits before it divides

§14 says money never touches a float. `formatPaise` takes the rupee and paise
parts as integers and groups only the rupee part through `Intl.NumberFormat('en-IN')`,
so no amount is ever a fractional JS number, even transiently at the render layer.

### D14. `vitest` and `esbuild` builds enabled

`vitest.config.ts` was already committed but `vitest` itself was not installed
and there was no `test` script. Added `vitest` + `@vitest/coverage-v8`, and the
`test` / `test:watch` / `test:coverage` / `typecheck` scripts.
`pnpm-workspace.yaml` still had placeholder `allowBuilds` values; set `esbuild: true`
(vitest needs it) and left `sharp` / `unrs-resolver` off.

---

## M2 — Schema & auth

### D15. The `staff` role is dropped — two roles, not four

Owner's instruction. `super_admin` and `admin` are the only logins; `customer`
is not a role because customers never hold a session (see D20/D21).

This removes §05.2's hardest requirement — "a staff-role response must never
contain a rate or balance field" — and with it a whole serialisation-stripping
layer that would have been easy to get wrong. `admin` now holds the full
operational and money surface; `super_admin` additionally holds `item.manage`,
`user.manage`, and `settings.manage`.

The §13 M2 acceptance criterion was written against the staff role. Its
equivalent is now "an `admin` receives 403 from the super_admin-only surface",
tested in `lib/auth/guard.test.ts`.

### D16. Better Auth's `account` model is renamed `auth_accounts`

A straight collision: Better Auth's `account` table holds credentials, while
§04's `accounts` is the customer khata. Renaming Better Auth's tables
(`auth_sessions`, `auth_accounts`, `auth_verifications`) keeps the domain names
for the domain. §04's `users` is used as-is for Better Auth's `user` model,
absorbing its three required extra columns (`email_verified`, `image`,
`updated_at`).

`advanced.database.generateId: false` so Postgres mints uuids via
`gen_random_uuid()`, rather than Better Auth generating string ids — otherwise
half the tables would have uuid primary keys and four would have text.

`orgId`, `role`, and `isActive` are declared `input: false`, so they cannot be
set through the sign-up payload. `createUser` assigns them afterwards, inside
the `user.manage` guard.

### D17. `server_seq` added now, not at M5

§07.3 mandates a monotonic `server_seq bigint` on every syncable table, but the
offline layer is M5. Added in M2 anyway: it touches seven tables, and doing it
later means a second migration across all of them plus a backfill.

Two details the spec does not spell out:

- **One global sequence** (`sync_seq`) rather than one per table, so the client
  holds a single cursor that orders changes across every table.
- **A `BEFORE UPDATE` trigger bumps it.** A column that only advances on insert
  is worse than none: an edited customer keeps its original sequence, and every
  device that already synced past that number never sees the change. Silent and
  permanent. `movements` needs no such trigger — it is insert-only.

### D18. Append-only and immutability are enforced by the database

§00 rule 1 and §02 are stated as rules for the developer. They are now triggers:

- `movements_append_only` — `DELETE` refused outright; `UPDATE` refused for
  every column that decides what was billed.
- `bills_immutable` — `UPDATE` and `DELETE` both refused.

A rule that lives only in application code is one that a future migration
script or a tired evening at a psql prompt will break. This is the single most
important invariant in the product, so it is worth a trigger.

**One exception, deliberately:** `photo_url` and `signature_url` may be updated
on a movement. §07.1 queues binaries separately from the row, so a gate-pass
photo taken offline genuinely lands after the movement syncs. Nothing that
affects money can move.

### D19. Customer portal — the mobile lookup and its security posture

Owner's instruction: two doors, both landing on the same read-only view.

- **`admin_link`** — §05.4 as written. 32 random bytes, peppered SHA-256 stored,
  validity from `settings.portal_token_days` (default 90).
- **`mobile_lookup`** — the customer types their own number on a public page and
  gets a **24-hour** session, not 90 days.

**Stated plainly, because it should be a conscious choice and not a surprise:
the only thing protecting a customer's outstanding balance behind the lookup
page is knowledge of their mobile number.** Phone numbers are not secrets —
they are on invoices, on vehicles, and in WhatsApp groups. Anyone who knows a
contractor's number can see what that contractor owes and what equipment they
hold.

This was accepted in place of paid OTP (each SMS costs money and India requires
a DLT-registered sender). What the implementation does to bound the cost:

| | |
|---|---|
| Rate limit | 5 attempts per number per 15 min; 20 per address per 15 min |
| Counted in | Postgres (`portal_lookups`) — serverless has no shared memory, so an in-process counter resets on every cold start and is not a limit at all |
| Audit | Every attempt logged, hit or miss |
| Session | 24 hours, versus 90 days for an admin-shared link |
| Blocked customers | Treated exactly as an unknown number |
| Stored numbers | `portal_lookups` holds a peppered hash, not the number, so the audit table is not a harvestable customer list |

At 5 attempts per number per 15 minutes, enumerating even one 10-digit prefix
block would take centuries. The realistic threat is not enumeration — it is
someone who already knows one specific contractor's number. Nothing short of
OTP addresses that.

**If the yard ever wants that closed**, the additive change is small: keep the
lookup page, but instead of returning data, WhatsApp the signed link to the
number on file. The customer proves possession of the phone by receiving it,
and it still costs nothing. Worth raising with the owner.

### D20. Both doors redeem through one function

`resolvePortalToken` is the only way either token is spent, so expiry,
revocation, blocked-customer checks, and `last_used_at` logging cannot be
bypassed by taking one route rather than the other. Unknown, expired, and
revoked all raise the same error with the same message — probing `/s/<guess>`
reveals nothing about whether a token ever existed.

### D21. Issuing a link supersedes the previous one

§05.4 says "reuse the active token rather than minting new ones", but only the
hash is stored, so the raw token cannot be re-shared. `issuePortalLink` instead
revokes any live `admin_link` and mints one replacement. The customer ends up
with exactly one working link, and the admin's Revoke button means something —
rather than a trail of live tokens nobody can enumerate.

### D22. Cross-org rows are 404, not 403

`requireSameOrg` reports "Not found." A 403 would confirm the row exists in
somebody else's org.

### D23. `v_item_stock` written out; LOST reduces owned stock

§04's view sketch contains a literal `sum(...)` placeholder, so it had to be
written properly. The definition adds `qty_lost` and computes:

```
qty_available = qty_owned - qty_lost - qty_out
```

per §02's "LOST … reduces effective owned stock". Reversed movements and the
REVERSAL rows themselves are excluded.

`qty_available` is allowed to go **negative** rather than clamping at zero:
§07.4 says two devices overselling offline should both be accepted because the
equipment really did leave the yard, and an admin needs to see the problem.

### D24. Money is `bigint` read as a JS number

`bigint({ mode: 'number' })` rather than `'bigint'` or `'string'`, so the value
the accrual engine consumes is already a `number` and there is no conversion at
the boundary to get wrong. Safe to ₹90,000,000,000,000 — thirteen orders of
magnitude past this yard.

### D25. Two columns added ahead of their milestone

- `items.purchase_cost` — §10 asks for "this item has recovered 340% of its
  purchase cost", which is impossible without it.
- `settings.show_rates_to_customer` and `settings.portal_token_days` — both
  named in §08.4 and §11 but absent from §04's `settings` DDL.

Cheaper now than a migration at M7.

### D26. Tests run against real Postgres via PGlite

`lib/db/harness.ts` boots Postgres 18 compiled to WASM and applies the
**committed migration files verbatim**. So `lib/db/schema.test.ts` proves the
real migration works — the triggers fire, the check constraints bite, the view
computes — rather than proving a hand-written copy of it works. No Docker, no
service, ~700ms.

One accommodation: PGlite does not ship `pgcrypto`. Since `gen_random_uuid()`
has been core since Postgres 13 and Neon runs 17, the extension is
belt-and-braces, so §04's `CREATE EXTENSION` is wrapped in a `DO` block that
warns and continues. Neon still gets the extension; the harness still runs the
real file.

### D27. No dark mode

§08.5 says light theme throughout, legible in bright sun. The scaffold's
`prefers-color-scheme: dark` block is removed and `color-scheme: light` is
pinned. A dark UI on a mid-range Android screen in Kerala daylight is
unreadable, and supporting both doubles the surface for a user who will never
want one of them. Geist is dropped for the system stack, also per §08.5.

### D28. Env validation is lazy

`serverEnv()` parses on first call, not at module load. `next build` collects
page data without runtime environment, so eager validation fails every build
that is not pointed at a live database. Same reason the auth route builds its
handler on first request.

---

## M3 — Core ledger, online only

### D29. The acceptance criterion is a test, not a walkthrough

§13's M3 criterion — "a full lifecycle … and the numbers match a hand
calculation" — is `lib/movements/lifecycle.test.ts`. It drives the real
services against PGlite applying the committed migrations, so the triggers, the
serialisable transaction, and the engine are all in the path, and the expected
figures are worked out by hand in a comment above the assertion:

```
 60 jacks  01-Jun → 21-Jun   20 days   60 × 20 × ₹2  =  ₹2,400
  4 jacks  01-Jun → 25-Jun   24 days    4 × 24 × ₹2  =    ₹192   (damaged)
 36 jacks  01-Jun → 30-Jun   29 days   36 × 29 × ₹2  =  ₹2,088
 40 spans  15-Jun → 22-Jun    7 → 15   40 × 15 × ₹4  =  ₹2,400   (minimum)
                                            Rent       ₹7,080
 Damaged: Jack 3.0m × 4 @ ₹450               Damages   ₹1,800
                                             Due       ₹8,880
                                             
```

A criterion checked by hand once is checked once. This one runs on every push.

### D30. A mixed return is two gate passes

§08.3's return sheet takes a quantity per item; §02 gives damage and loss their
own movement types, priced differently. So a lorry arriving with 40 good jacks
and 4 broken ones is submitted as **one batch per condition**, in sequence.

The alternative — one batch carrying mixed types — was rejected because a batch
commits atomically (§14): a damaged line rejected by the replay would silently
discard the good return the contractor had just watched being counted. If the
second batch fails, the screen says which one landed and which to record again.

The per-condition gate pass numbers are suffixed `-R`, `-D`, `-L` so the
paperwork and the ledger carry the same reference.

### D31. Reversal is a button, not a long-press

§08.2 asks for long-press to reverse a movement. Implemented as a **Reverse this
entry** button revealed on the row instead. A long-press has no affordance, no
keyboard equivalent, and no way to be discovered by an admin nobody showed it
to — and this is the one action in the product that permanently alters what a
contractor is billed. It should be deliberate and visible.

### D32. `/accounts` exists, though §08.1 does not list it

The route map in §08.1 has `/accounts/[id]` but no index, while §08.5's bottom
tab bar names **Accounts** as one of five destinations. Added the list: open
sites first, largest balance first — the order an admin chases in. `/return`
reuses it as its account picker, filtered to sites with something out.

### D33. "Due today" and "overdue" wait for M4; the dashboard chases what it can

§08.1 wants the dashboard to show *out today, due today, overdue, low stock*.
Two of those are properties of a bill, and bills are M4 — nothing can be overdue
before anything has been invoiced.

Rather than ship an empty panel or invent a due date, the dashboard answers the
same question from the ledger: who is over their agreed credit limit, and what
has been sitting on a site for more than `LONG_HELD_DAYS` (60). Both switch to
bill-driven figures at M4, and the screen says so in a footnote so nobody reads
"nothing overdue" as a fact about invoices.

### D34. List screens replay in bulk, not per row

Every balance on every list is a replay (§00 rule 2), which naively means three
queries per account and Neon charges per round trip. `loadLedgers()` loads
movements, payments, and adjustments for a whole page in three queries and
groups them in memory; `listAccounts` and `rollupByCustomer` build on it, and
`getCustomerDetail` now delegates to `listAccounts` rather than keeping its own
copy of the same loop.

Still O(accounts) replays in CPU, which is right — the replay *is* the
definition of the balance — but O(1) in database round trips.

### D35. The issue screen hides retired items; the return screen never does

`listStock` gained the rate and `is_active` from `items` (the view carries
neither). The issue flow lists active items only, plus any item already in the
draft; every other screen shows everything, because a retired item can still be
out on a site and must stay returnable.

### D36. No manual damage charge in the M3 UI

D5 settled that `damage_charge_mode` governs whether the form *asks* for an
amount. The settings screen is M7, and the default is `replacement_rate`, so the
return sheet charges the replacement rate frozen onto the issue and shows no
amount field. `manualCharge` is already accepted by the API and the engine, so
turning the field on later is a form change, not a data-model change.

### D37. Search screens are plain GET forms

`/customers`, `/accounts` search by submitting a `<form action="…">` with no
JavaScript. Fewer moving parts than a debounced fetch, the URL is shareable and
back-button-able, and it still works when M5's service worker is serving a stale
shell. The pickers *inside* the issue flow do fetch, because they have to create
records as well as find them.

### D38. Screens are server components; only what mutates is a client component

Pages resolve their own data through `/lib` (no internal HTTP hop), and the
interactive pieces — issue flow, return sheet, ledger reversal, item and
customer forms — are client components posting to the §06 routes and calling
`router.refresh()`. `requirePageSession()` is the one place a 401 turns into a
redirect to `/login?next=…`, so no screen forgets the round trip back.

---

## M4 — Money: bills & payments

### D39. No payment collection, by instruction — payments are receipts

Owner's instruction: the yard is not collecting money through this software.
There is no gateway, no UPI intent, no card anything. `POST /api/payments`
records that cash, a UPI transfer, a bank credit, or a cheque **already
happened**, and the schema was built for exactly that (`payments.method`, §04).

The consequences are all in the UI copy: "Record payment", not "Pay"; "money
already received"; and a receipt the admin can send afterwards. Nobody should
be able to open this product and think it will chase money for them.

### D40. A period bill is the difference between two accruals

`accrue()` values a lot from its issue date to `asOf` and has no notion of a
period. Billing July after June has been billed therefore means: value the
account to 31-Jul, value it to 30-Jun, and charge the difference.

```
prior (to 31-May)   100 units × 31 days
current (to 30-Jun)  60 units × 51 days  +  40 units × 60 days
this bill            60 units × 20 days  +  40 units × 29 days
```

`lib/bills/draft.ts` does this per lot, which keeps the property everything
rests on: **each unit is charged for every day it was out, exactly once, across
all the bills that ever mention it.** `draft.test.ts` asserts it directly —
`june.rentTotal + july.rentTotal === accrue(…, '2026-07-31').rentTotal`.

The rejected alternative was teaching the engine about periods. That means
touching the one module the whole product's arithmetic rests on, whose twelve
spec vectors are the only thing standing between the yard and a wrong bill.

### D41. Bill periods must be sequential and may not overlap

`issueBill` refuses a period starting on or before the last bill's `period_to`.
Overlapping periods are the one way the delta scheme can double-charge, and a
constraint is better than a convention. A period with nothing in it is refused
too — an invoice for ₹0 is confusing paperwork, not a record.

### D42. A bill carries what the ledger said at the time, and the next bill checks it

Each bill freezes `accruedToDate` — total rent accrued account-to-date when it
was issued — alongside its lines. The next preview compares that against a fresh
replay of the same span, and shows the difference as `earlierPeriodGap`.

It is non-zero exactly when the ledger changed behind an issued bill: a gate
pass written up late (found in the cab of a lorry, which is an ordinary week in
a yard), or a reversal of something already charged. Neither the old bill
(immutable) nor the new one (its period starts later) can absorb it, so the
screen names the figure and asks for a charge or credit adjustment.

Without this the money silently disappears. It is worth reading the test that
covers it — FIFO means a back-dated issue *and* return do not simply cancel
out, because the return consumes the oldest open lot rather than the lot just
recorded.

The warning clears once any bill is raised after it, so it prompts once, when
it can still be acted on, instead of nagging forever.

### D43. Allocations are derived, and rebuilt wholesale

`payment_allocations` is not authoritative — `allocatePayments` is. Every
payment and every new bill triggers `syncAllocations`, which deletes the
account's allocation rows and recomputes them from scratch inside the same
transaction.

Patching incrementally would drift the moment a payment arrives back-dated, and
"which bill did this ₹5,000 settle" is a question a contractor asks a year
later. Bills are aged by `period_to`, not by when someone got round to issuing
them: a June bill raised late is still older than July's.

Surplus stays unallocated and shows as an advance, settling against the next
bill by itself — proven in `lifecycle.test.ts`, where ₹2,800 of overpayment
lands on the following invoice at the moment it is issued.

### D44. Invoice numbers come from `UPDATE … RETURNING`, inside the transaction

`settings.next_invoice_no` is incremented and read in one statement inside the
bill's own transaction, so two admins tapping *Issue* at the same moment cannot
land on the same number. The settings row is created on demand — a yard that has
never opened the settings screen still has to be able to raise its first bill.

Format is §09's: `INV-2026-0042`, the year taken from the period end.

### D45. Three columns added to `settings`

`payment_terms_days` (default 7) gives `bills.due_on` a default, and without a
due date nothing can be overdue — which would leave the §09 reminder queue with
no definition. `yard_address` and `yard_phone` are the rest of §09's bill
header; §04's schema has only the org name. Migration `0002_billing_settings`.

### D46. PDF determinism is a pinned creation date

§09 wants byte-identical output for the same bill id. react-pdf stamps the
current time by default, so `creationDate` and `modificationDate` are pinned to
the bill's own `issuedAt`. `pdf.test.ts` renders the same bill twice and
compares buffers — the day that stops holding is the day two prints of one
invoice stop matching, which is exactly what a disputed bill cannot survive.

### D47. WhatsApp is composed, never sent

§09 rules out the Business API (it costs money and needs approval).
`lib/messages.ts` builds the text for four situations — statement, invoice,
receipt, reminder — and `WhatsAppComposer` lets the admin edit it and opens
`wa.me`. The message goes from the yard's own number, and a human reads every
one before it reaches a contractor they know personally.

The overdue queue on the dashboard is computed live from bills past `due_on`
with money still owed, rather than by §09's 09:00 IST Vercel Cron. Same list,
no scheduler to deploy or debug, and it is right the moment it is looked at.
The cron is only worth adding if the yard wants a push notification, which is
M7 territory.

### D48. The statement message carries no link yet

§09's sample message ends with a signed portal URL. Portal tokens exist (M2)
but `/s/[token]` does not until M6, so the statement template omits the line
rather than sending contractors to a 404. `statementMessage` already takes a
`portalUrl`; M6 passes it.

---

## M5 — Offline layer

### D51. The per-line carve-out lives here, and only here

D30 made an online gate pass atomic: the contractor signed for the batch, so a
rejected line rejects the whole thing. §07.4 says the opposite for a sync push —
"reject that line only, other lines in the batch still commit" — and it is
right, because the alternative is throwing away work the yard did hours ago
over one line that no longer fits.

Both are now true, in different code paths. `recordMovementBatch` (online) is
all-or-nothing; `applySyncPush` walks the lines, testing each against the ledger
**including the lines already accepted from the same batch**. Two returns of 30
against an outstanding 40 therefore accept the first and refuse the second,
rather than both passing a check taken before either was written.

### D52. A retry is free, and proves it by returning the same ids

Every write the push performs lands on a `(org_id, client_uuid)` unique index,
so a device that loses the response and pushes the whole queue again inserts
nothing and gets the same server ids back. `accounts` gained a `client_uuid`
column for this (migration `0003`) — it was the one syncable table with no
idempotency key, and "open site" pushed twice would otherwise have become two
khatas for one contractor.

Customers merge on `(org_id, mobile)` instead, per §07.4: the number *is* the
identity, so two devices creating the same contractor offline converge on one
row and the second device rewrites its local foreign keys to the id returned.

### D53. A rejection is data, not an HTTP error

`POST /api/sync/push` answers 200 whenever the request was well formed, with a
per-entry verdict inside. A 4xx would tell the device to retry the whole push,
including the entries that did commit. Refusals are written to
`sync_rejections` with the payload that caused them, so "Needs attention"
survives a browser restart and an admin can see it from another device.

### D54. Caches never serve money

The service worker is cache-first for the shell and **network-only for
`/api/*`**. A yard worker looking at a stale outstanding figure and believing it
is worse off than one who cannot see it at all: §07.5 asks for stale data to be
stamped, and the way to keep that promise is to never let a cache answer for the
ledger. What makes the app usable offline is the outbox, not a cached response.

### D55. Offline writes, online reads — stated plainly

This is the honest limit of what landed. §07.2's write path is complete: work is
queued on the device, returns immediately, drains in the background with
exponential backoff, and lands exactly once. `/issue`, `/return`, and
`/payments/new` all queue when there is no signal and say **"Saved on this
phone"** rather than "Recorded".

The *read* path is not converted. Every screen is still a server component, so
with no signal a fresh navigation gets the offline page rather than a
Dexie-rendered account screen. The mirror, the cursor pull, and the bootstrap
endpoint are all built and tested — the data is on the device — but nothing
renders from it yet.

So M5's acceptance criterion is only half met: work recorded **in an already-open
tab** survives a force-quit and lands exactly once, which the server tests prove.
Recording work after a cold start with no signal does not yet work. Finishing it
means client-rendering the issue and return screens from the mirror, which is a
day's work and should not be smuggled in under a milestone that claims to be
done.

### D55a. The read path, closed as far as it honestly can be

D55 said the screens were server-rendered only. That is now half-fixed, and the
remaining half is a genuine limit rather than an oversight.

`lib/sync/queries.ts` returns the **same shapes** the server returns —
`StockRow`, `OutstandingLine` — computed from the mirror by the same pure engine
(`lib/accrual` imports nothing that touches a network or a clock, so it runs
identically on a phone). `IssueForm`, `ReturnSheet`, and both pickers take
server data when there is any and fall back to the mirror when there is not.
One set of components, not an online set and an offline set that drift.

What that buys, concretely: a screen visited once today is in the service
worker's page cache, so opening `/issue` or `/return` with no signal works, and
the item list and outstanding quantities are recomputed locally rather than
being whatever was cached hours ago.

What it does not buy: a *cold* start on a phone that has never opened that
route. Those pages are `force-dynamic`, so there is no HTML to precache.
Fixing that means converting them to static shells that fetch on mount —
a real change to two working screens, and not one to make blind at the end of
a session.

Balances are deliberately **not** shown offline. The mirror carries movements,
not payments and adjustments, so the pickers show a name and a site with the
money columns at zero rather than a figure that might be wrong. A number a
contractor could be quoted must not be a guess.

### D55b. The device duplicates `v_item_stock`, and a test pins the duplicate

Availability cannot travel — it is a database view — so `lib/sync/availability.ts`
recomputes `owned − lost − out` on the phone. That duplication is a real risk:
drift between the two means an admin offline sees one number and the same admin
online sees another, with no way to tell which is wrong.

`availability.test.ts` runs the same movements through both — the function and
`v_item_stock` on a real Postgres — and insists they agree, reversals and all.

### D56. `next build --webpack`

Next 16 defaults to Turbopack, which silently skips `@serwist/next`'s webpack
plugin — the build succeeds and no service worker is emitted, which is the worst
possible failure mode for a PWA. The build script pins webpack until Serwist
ships Turbopack support. Development is unaffected: the worker is disabled there
anyway, because a service worker holding a stale bundle is only ever confusing.

---

## After a week in the owner's hands

### D60. The word is "lend", and the app is Bismi Rental

Third naming pass and the last: the owner lends equipment and takes it back.
`lib/vocabulary.ts` exists precisely so this costs one file; the `ISSUE`
movement type and the `/issue` routes are untouched, because renaming a
movement type rewrites history and renaming a route breaks every link anyone
has saved.

### D61. A lending belongs to the customer; the site is optional

The owner's correction to the model: a transaction is the *person's*. A site is
a refinement they may or may not care to make, and forcing one at the counter
turned a twenty-second lending into a naming exercise.

The schema still wants an account under every movement — it is what a bill is
drawn against — so "no site" resolves to a **General khata**, created on first
use by `defaultAccount()`. It is made idempotent by the same
`(org_id, client_uuid)` unique index the sync push uses, with a deterministic
key per customer, so two phones tapping *skip* at the same moment converge on
one khata rather than racing two into existence. A closed General khata is
quietly reopened: the customer came back.

`default-account.test.ts` covers all three cases against real Postgres.

### D62. Back goes up, never sideways

The loop the owner hit: `/issue` → tap a site → `/issue?account=…` → back →
**`/accounts/…`** → *Lend more* → `/issue?account=…`. Back was pointing at
whatever felt related rather than at the level above, so two screens pointed at
each other.

Every back link now goes up one level *within its own section* — a lending
screen backs out to lending, a return to returns, an account to accounts. The
sideways trips that were genuinely useful (account → customer) became buttons,
which is what they always were.

### D63. The working lists show what is out, not what exists

`/issue` and the home page's active list filter to `qtyOut > 0`. A site that has
returned everything is not a thing to lend more to today; it is history, and it
lives under Accounts → All. Its balance still counts in the totals — the money
is real — but it is off the list a yard works down.

The customer picker opens on who the yard dealt with most recently rather than
alphabetically, because §08.3's twenty-second lending is a repeat customer.

### D64. Damaged and lost are hidden until asked for

Most lorries bring everything back whole. Two permanently-visible zero rows per
item made the common case pay a screen-height tax for the rare one, so each item
shows one **Returned** counter and a "+ Damaged or lost?" link. An item that
already carries a damaged or lost count shows its rows regardless — a recorded
number must never be invisible.

---

## First contact with a real database

Two bugs that every test passed over, found within minutes of pointing the app
at Neon for the first time. Both are the same shape: code that was never
executed against a real Postgres, only reasoned about.

### D49. `disableSignUp` blocked the server too — no staff login could ever be created

`emailAndPassword.disableSignUp: true` was set to satisfy §05.1's "no
self-signup". It does not disable a *route*; it disables the **operation**, so
it equally rejected `auth.api.signUpEmail()` called server-side — which is the
call behind both `createUser` (the `/users` screen, an M2 acceptance item) and
the seed script.

The result: **no user could be created by any means.** The seed failed on its
first run against Neon with `EMAIL_PASSWORD_SIGN_UP_DISABLED`, which is also
what `/api/users` would have returned to a super_admin trying to add staff.

Sign-up is now enabled in the config and the *public path* is closed instead:
`isPublicSignUpAttempt()` (`lib/auth/public-signup.ts`) makes
`POST /api/auth/sign-up/**` a 404 — not a 403, which would confirm the endpoint
exists. Server-side calls never traverse that route, so the one code path that
hashes passwords stays the one that verifies them.

`orgId` had to become `input: true` as a consequence: `users.org_id` is NOT
NULL, so Better Auth's insert cannot omit it and have it patched in afterwards.
`role` and `isActive` stay `input: false`, so even a reachable sign-up could not
mint a super_admin. `createUser` always passes the session's own org, never the
caller's.

### D50. `.partial()` does not strip a Zod default — PATCH was overwriting untouched columns

`updateItemSchema` was `createItemSchema.partial()`. In Zod v4 that makes keys
optional but **leaves `.default()` in place**, so:

```ts
updateItemSchema.parse({ ratePerDay: 500 })
// → { ratePerDay: 500, unit: 'nos', replacementRate: 0, purchaseCost: 0,
//     qtyOwned: 0, sortOrder: 0 }
```

`updateItem` writes every key it is given. So editing one item's rate on
`/items` silently zeroed its replacement rate, its purchase cost, and the
quantity the yard owns, and reset its sort order. `updateCustomerSchema` had the
same defect: correcting a spelling in a contractor's name would have reset their
agreed credit limit to zero.

Both schemas are now built from a `…Fields` base carrying no defaults, with
defaults added only on the create variant. `lib/validation/partial-updates.test.ts`
asserts that a partial parse returns exactly the keys it was given — including
that an explicit `0` still comes through, so retiring stock still works.

**This was found in the data, not in a test.** Two item rows in the first Neon
database came back with a `server_seq` far ahead of their siblings — the bump
trigger from D17, doing precisely the job it was added for. Without that column
the corruption would have been silent and indistinguishable from a bad seed.

The two affected rows are still wrong in that database; the fix stops it
recurring but does not reach back. Correct them on `/items`, or:

```sql
update items set rate_per_day = 200, replacement_rate = 45000,
       purchase_cost = 38000, qty_owned = 600, sort_order = 0 where code = 'JCK30';
update items set rate_per_day = 250, replacement_rate = 52000,
       purchase_cost = 44000, qty_owned = 400, sort_order = 1 where code = 'JCK36';
```

### The lesson, for M5 onward

Both bugs sat behind 196 passing tests, a clean typecheck, and a successful
build. Neither could have been caught by any of them: one needed a real Better
Auth runtime, the other needed a real `UPDATE` against a real row. The PGlite
harness covers the SQL, but not the third-party runtime above it.

Point each milestone at a live database and click through it **before** calling
it done, not after.

---

## Owner's answers

### D57. No minimum rental period — rent follows the days actually held

**Answered by the owner**, which settles open questions 1 and 3 below.

The complaint that prompted it: "if I issue today, don't calculate it for 15
days — based on the days passed, automatically calculate it." Under §03.1's
15-day default, a gate pass written this morning showed a fortnight's rent
before the lorry had left the gate. Correct per the spec, wrong for the yard,
and impossible to explain across a counter.

`DEFAULT_BILLING_CONFIG.minimum_days` is now `0`, and the live database was
updated with `jsonb_set(billing, '{minimum_days}', '0')` so the running app
matches. One issue day is one day of rent; a lot back after five days is
charged five.

Nothing was removed to achieve it. The floor is a config value the engine has
always honoured, so §03.5's twelve vectors still test it — `engine.test.ts` and
the bill-draft tests now state `minimum_days: 15` explicitly, because those
vectors are specified against it. A yard that wants a minimum sets one.

The M3 lifecycle test was re-derived by hand against the new rule: the same
lifecycle now totals **₹5,800 rent + ₹1,800 damages = ₹7,600 due**, where the
15-day floor made it ₹7,080 + ₹1,800. The span line is the visible difference —
seven days out is now billed as seven, not floored to fifteen.

**This changes money.** Any bill already issued keeps its frozen lines (D42);
only future accrual follows the new rule.

### D58. A site with nothing out is *completed*, not closed

Also the owner's choice, from two offered. When the last item comes back the
account shows **✓ Completed** and sinks below the sites that still hold
equipment — but it stays open, so the next load to the same site needs no new
khata, and closing remains the deliberate act §02 describes.

`AccountListRow.isCompleted` is derived (`status === 'open' && qtyOut === 0`),
never stored — same rule as every other figure here (§00 rule 2). The accounts
list sorts *still out → completed → closed*, then by who owes most, because an
admin's day is spent on what is still in a contractor's yard.

Rejected alternative: closing automatically at zero. It reads tidy and is wrong
in practice — a site that empties on Friday often takes another load on Monday,
and an auto-closed account makes that a reopening chore.

### D59. The tab bar's active pill slides

The bar was five flat labels; which one was active read only as a colour. It is
now a filled pill that moves between positions in 150ms — §08.5's stated
ceiling for animation.

Motion here is not decoration. On a 360px screen held one-handed, a moving
object tells a thumb where it came from and where it is now; a colour change
alone does not. The slide is one CSS transform on a single element, positioned
at `index × 20%` because the five tabs are equal width — no measuring, no resize
observer, nothing to break on rotation, and `motion-reduce` turns it off.

---

## Open questions for the yard owner

§14 requires these answered before the first real bill. Two are now settled —
see D57 above.

1. ~~**Vector 10 (D1)** — ₹450 or ₹540?~~ **Moot for this yard:** with no
   minimum-days floor the disputed multiplication does not arise. The vector is
   still tested at 15 days, so the engine's behaviour stays pinned either way.
2. **Day counting** — is the return day billed? (`inclusive_start` vs `inclusive_both`)
3. ~~**Minimum rental period**~~ — **answered: none.** See D57.
4. **Damage pricing** — always the replacement rate, or typed per movement?
5. **Rate visibility** — may customers see per-day rates in the portal?
6. **Mobile lookup (D19)** — is the owner comfortable that anyone knowing a
   contractor's phone number can see that contractor's dues? The zero-cost
   alternative is to WhatsApp the signed link to the number on file instead of
   showing data directly.

## Deferred, with a note on why

- **Same-day issue/return ordering (D7)** — the spec's sort is implemented as
  written. If offline sync turns out to produce same-day out-of-order pairs in
  practice, the fix is to order ISSUE before consuming movements whenever
  `movedAt` matches, regardless of `createdAt`. Deliberately not done yet: it
  deviates from §03.2 and should be a decision, not a silent divergence.
- **`accrual_stops_on_bill`** — carried in the config and validated, but it only
  bites at M4 when bills exist. The engine already honours it implicitly: the
  caller passes `asOf`, so "stop at the bill date" is just a different `asOf`.
- **Photo and signature capture (§08.3 "Proof")** — §13 puts capture and
  client-side compression in M7. `POST /api/movements` already accepts
  `photoUrl` and `signatureUrl`, and D18 leaves those two columns updatable so a
  binary queued offline can land after the row syncs. Nothing to undo later.
- **Share statement as a signed link (§08.2)** — the account screen composes a
  WhatsApp statement, but the `/s/[token]` link it should carry needs M6 (D48).
- **Settings screens (§11)** — `payment_terms_days`, `yard_address`,
  `yard_phone`, `invoice_prefix`, and the billing rules are all editable columns
  with sensible defaults, but nothing in the UI edits them yet; that is M7. Seed
  or `psql` in the meantime.
- **The screens have not been run against a live database.** `pnpm build`,
  `typecheck`, `lint`, and 194 tests pass — including PGlite-backed lifecycle
  tests for both M3 and M4, which exercise the real services against the real
  migrations — but there is no `.env.local` here, so nobody has yet loaded
  `/accounts/[id]` or a bill PDF in a browser against Neon. Do that before M5.
