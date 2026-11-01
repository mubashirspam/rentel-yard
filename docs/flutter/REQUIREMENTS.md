# Bismi Rental — Flutter product requirements

Version: 1.0 · 31 October 2026 · Status: proposed implementation baseline

Companion: [Feature and delivery plan](FEATURE_PLAN.md).

## 1. Product goal and scope

Build a fast, easy-to-use construction-equipment rental application in Flutter, with native mobile apps and an adaptive web app. The main users work at a rental counter or yard: they need to issue goods, accept returns, check availability, find customers, collect money, and identify unreturned equipment with minimal typing.

This is a new client experience, not a visual copy of the current Next.js screens. Reuse reliable backend business logic where practical. Flutter alone does not guarantee speed: local reads, short task flows, responsive feedback, and measured performance are release requirements.

Target Android, iOS, and web from one Flutter project. Proposed rollout: Android and web first, iOS after the same feature acceptance checks and device validation. Platform order is a planning assumption, not an owner decision. No separate Windows/macOS desktop app in this scope.

The user requested planning documents now. This document does not authorize deployment, production data migration, or changing existing billing rules.

## 2. Confirmed requirements versus assumptions

Confirmed by the owner:

- In the supplied item list, the left number is quantity and the right number is the per-item rate in rupees.
- Record customer name, phone number, and the place where equipment is taken.
- Show stock for each item.
- Equipment not returned after 15 days must appear as overdue from day 16, using red and/or a separate section.
- Replace the current experience with a Flutter application supporting mobile and web.

Proposed defaults requiring business validation before importing data or issuing real bills:

- Supplied quantities are opening owned stock; they might instead describe one rental transaction.
- Supplied rates are daily rates, matching the existing application. The owner has confirmed per-item rates but not the charging period.
- Issue date counts as day 1 for equipment-age alerts; 1 November issue becomes overdue on 16 November. See R-07.
- Apply the 15-day rule to all rentable items initially; the Malayalam reference to main items may mean selected items only. Add an item-level enable/disable flag without changing historical dates.
- English and Malayalam interface support; English is the initial UI language and item names may be entered in either language.
- Preserve existing per-item minimum billing days during migration. Current new-item default is 5 days; this is separate from the 15-day overdue rule and must not be silently changed.

## 3. Roles and permissions

| Role | Access |
|---|---|
| Admin | Customers, sites, issue/return, payments, bills, charges/credits, reversals with reasons, operational reports, overdue follow-up |
| Super Admin / owner | All Admin capabilities plus item rates and stock setup, minimum days, users, business settings, exports and migration tools |
| Customer | No staff login in launch scope; customer portal is a later feature |

Permissions must be enforced by the server, including organization isolation. Hiding a button is not authorization. Deactivated accounts must stop accessing server data; local sessions and cached data need a defined expiry and sign-out cleanup policy.

## 4. Mobile and web experience

### Navigation and visual rules

- Phone: five destinations — Home, Customers, Stock, Overdue, More. Issue and Return are prominent Home actions and remain available from customer/site context.
- Tablet and desktop web: navigation rail/sidebar, searchable lists, and list/detail panels. Do not stretch phone cards across a desktop screen.
- Suggested layout ranges: compact below 600 logical pixels; medium 600–1023; expanded 1024 and above. Adapt by available width, including browser resizing.
- Use clear labels: Total stock, Available, Out on rent, Returned, Rental overdue, Payment overdue. Avoid exposing internal terminology such as movements or accrual to counter staff.
- Touch targets at least 48 logical pixels; readable typography; strong contrast outdoors; support large text and screen-reader labels.
- Status uses text/icon as well as color. Red means overdue/action required; amber means warning; green means settled/synced.
- Quantity controls support direct numeric entry and plus/minus. Show item size and unit explicitly. Keep primary actions above the keyboard or safely reachable.
- Retain drafts when navigating back. Warn before discarding unsaved work. Prevent repeated taps from creating duplicate transactions.
- Every screen needs loading, empty, error, offline/stale, and permission-denied behavior. Errors preserve entered values and say how to recover.
- Web supports direct URLs, refresh, browser back/forward, keyboard focus, and shareable authenticated detail routes.

### Primary task flows

1. Issue: select/search customer → choose/add optional site → select items and quantities → review date/rates/total → save → receipt with share action.
2. Return: find customer/site → show only outstanding items → enter good/damaged/lost quantities → review → save → updated remaining quantities and balance.
3. Payment: open customer/site → enter received amount/method/date → save → receipt and remaining balance.
4. Overdue follow-up: open Overdue → inspect customer/site/items/age → call or prepare WhatsApp message → record follow-up note or start return.

An existing-customer issue with three items should be achievable within 45 seconds in a timed usability exercise. A simple return should take under 30 seconds. These are design targets to validate with yard staff.

## 5. Functional requirements

### R-01 — Customers

Create/edit/search customers by name or phone. Required: name and mobile. Optional: alternate mobile, address, notes, credit limit. Warn about matching numbers and offer the existing customer rather than silently duplicating. Customer detail combines contact actions, sites, outstanding equipment, money owed, bills, payments, and history. Blocking must have an explicit scope; preserve existing records and allow returns/payments.

Acceptance: customer information entered during an issue is reused without retyping; one customer with multiple sites has both site-level and combined totals.

### R-02 — Sites and rental accounts

Record site/place name, optional address, customer, opening date, and status. Allow a default general account when no site is supplied. Capture the actual destination clearly at issue. Closed accounts remain searchable; closing with outstanding items is refused. Closing an equipment account must not erase unpaid money.

Acceptance: identical item names rented to two sites stay separate, including returns and balances.

### R-03 — Equipment catalogue

Fields: ID, display name, optional Malayalam name, size/variant, code, unit, daily rate, replacement rate, owned quantity, minimum hire days, active flag, overdue-monitoring flag. Owner can create/edit/deactivate items. Deactivated items remain returnable and appear in historical bills.

Each issue snapshots rate and minimum hire days. New prices affect subsequent issues only. Item names and units must be present on printed documents, not just codes.

Acceptance: changing the master rate cannot alter an existing rental or finalized invoice.

### R-04 — Stock

Show owned, out, lost, and available quantities per item. Preserve existing stock semantics initially: available = owned − lost − out. Damaged returns must be visibly identified; deciding whether they enter a separate repair/unavailable pool is a business decision before implementing that extension.

Show low-stock and negative-stock warnings. Show which customers/sites hold each item. All adjustments to owned quantity require an actor, timestamp, reason, and audit record. Never hide negative stock by clamping it to zero.

Acceptance: issue 10 from 100 → available 90; return 4 good → available 94, still out 6. Recording 2 of the remaining units lost → owned 100, lost 2, out 4, available 94.

### R-05 — Issue equipment

Search existing customers, create one inline, choose destination, select multiple items and quantities, and enter issue date and optional gate-pass number/notes. Show current availability and freshness, per-unit daily rate, daily total, and any minimum-hire charge before saving. Validate positive whole quantities and dates. Warn about insufficient stock with an explicit authorized override and reason, consistent with the existing yard workflow.

Save all lines with one client transaction ID and show server-confirmed versus saved-on-device status. A retry must return the original transaction rather than create another.

### R-06 — Returns, damage and loss

Support partial returns over many dates, split by good/damaged/lost. Never allow a total greater than outstanding after server reconciliation. Consume older outstanding issue lots first (FIFO) within the same account/item. Display remaining quantities before and after saving. Damage/loss charge uses the agreed replacement or explicitly entered charge and records the reason.

Acceptance: customer takes 100, returns 40, and later returns 60 → outstanding 60 then zero. Returning 101 is rejected without losing the draft. Correct a mistaken return through a reversal, retaining the audit trail.

### R-07 — Equipment overdue: mandatory launch feature

Keep equipment overdue separate from unpaid-invoice overdue and from minimum rental days.

Proposed precise rule, to validate with the owner:

```text
held_days = calendar_difference(today_in_Asia_Kolkata, issue_date) + 1
is_overdue = monitoring_enabled AND remaining_quantity > 0 AND held_days > 15
days_overdue = max(0, held_days - 15)
```

An issue on 1 November is not overdue on 15 November and is overdue on 16 November. Use calendar dates, not 24-hour durations. Do not reuse billing-day calculations if their inclusivity differs.

- Dedicated Overdue destination with a badge counting affected customer/site groups; separately display overdue units. Never confuse units, lots, and customers in counts.
- Home has a red summary linking to the complete list; no hidden top-two/top-ten limit on the full list.
- Show customer, phone/call action, site, item/size, outstanding quantity, original issue date, days held, and days overdue.
- Group by customer and site; expand to individual issue lots. Sort oldest first; filter/search by customer, site, and item.
- Partial returns remove only returned quantities. A newer issue never resets the age of an older unreturned lot.
- Fully returned/reversed lots leave the overdue list after recalculation. New issues create new aging periods.
- Recompute on app open/resume, local date change, sync, return, or reversal. Offline results show the last sync time.
- In-app alerts are launch scope. OS push and web push are later enhancements; denial of notification permission cannot disable the list.

Acceptance examples: 10 units issued 1 November, 4 returned 10 November → 6 overdue on 16 November. Another 5 issued 14 November remain non-overdue on 16 November. Return the old 6 → old alert clears and newer 5 remain out without an overdue warning.

### R-08 — Rental accounting

Retain FIFO calculation, integer paise, calendar-date accounting, issue-time rate/minimum snapshots, and append-only history. Separate rent, damage/loss, extra charges, credits, payments, and outstanding balance. Preserve existing configured billing date rules until explicitly validated; same-day returns and period boundaries need golden test cases.

Do not treat a 15-day return alert as a 15-day minimum charge. When showing a minimum, label both actual days held and charged days. Historical invoice totals must remain unchanged through migration.

### R-09 — Bills and PDFs

Preview a bill for a selected account and date range, with line quantities, rates, days, damage/loss charges, adjustments, total, due date, and payment status. Prevent overlapping/double charging. Finalized invoices are immutable; corrections use documented credits/new invoices. Include business name/address/phone and invoice number. Provide A4 and thermal-layout PDFs, download/share, and web printing.

Launch scope uses server-generated PDFs. Direct Bluetooth-printer support is a separate later integration and must be tested with named hardware.

### R-10 — Payments and adjustments

Record money already received: amount, date, cash/UPI/bank/cheque/other, optional reference and notes. Allocate oldest bills first; retain surplus as advance. Show pending/partial/paid/payment-overdue states. Add transport/loading/labour/penalty charges and discounts/credits with reasons. No online payment collection or payment gateway in launch scope.

### R-11 — Dashboard and reports

Home prioritizes Issue, Return, equipment overdue, and customers with active rentals. Secondary summaries: today’s activity, billed, received, unpaid invoices, unbilled rent, low stock, credit-limit warnings, sync attention.

Reports include monthly/yearly billed versus received, payment-method totals, rent versus damage, quantities issued/returned/damaged/lost, and top customers. Preserve access to all existing financial information. Exports are owner-only and should use explicit date ranges and clear labels. CSV export is a planned improvement rather than an existing verified feature.

### R-12 — Sharing and communication

Call customer directly on mobile; provide usable phone links/copy action on web. Prepare English/Malayalam WhatsApp statements, invoices, receipts, and overdue-equipment reminders. User reviews and sends using the platform share/WhatsApp flow. No automatic customer messaging in launch scope. Record manual follow-up notes independently from delivery status; opening WhatsApp is not proof a message was sent.

### R-13 — Offline and synchronization

After initial authenticated download, native mobile can browse cached customers/items/sites/stock/outstanding equipment/overdue and queue issue/return/payment transactions. Web aims for the same cached workflows after successful installation/bootstrap; offline launch and storage persistence must be proven on supported browsers.

- Locally persisted outbox, stable client IDs, server idempotency, dependency ordering for new customers/sites and their transactions.
- Status labels: Saved on device, Syncing, Synced, Needs attention. Never describe unconfirmed money as server-confirmed.
- Retry on open/resume/reconnect; background execution is best-effort and platform-dependent. Correctness must not depend on background execution.
- Server validates permissions, available quantities, returns, and financial rules. Conflicts are explicit and recoverable; drafts are retained. Do not silently overwrite another device’s work.
- Group responses identify accepted/rejected lines; retries must not resubmit already accepted lines as new events.
- Finalizing bills, changing permissions, and administrative stock/rate changes require connectivity in launch scope. Drafts may be prepared offline.
- Cached balances show timestamp and provisional status, or remain unavailable until parity is proven. Never invent a balance from incomplete history.
- Signing out with unsynced data must present a recovery choice. Browser storage clearing/eviction is a documented limitation; do not promise guaranteed survival.

### R-14 — Settings and staff

Business profile, language, payment terms, per-item minimum hire days, overdue monitoring controls, and role-based user management. Owner changes to financial settings are audited and effective prospectively. The launch overdue threshold is 15; general threshold editing can follow later if needed.

## 6. Technical direction

Recommended: keep the existing database and TypeScript rental engine as the initial source of truth; add/complete authenticated API contracts consumed by Flutter. Existing Next.js pages currently call services directly, so do not assume every dashboard/customer/report operation already has a usable mobile API.

Flutter layers: adaptive UI → feature view models/controllers → repositories → local database and authenticated API clients. Keep platform-specific storage, sharing, printing, notifications, and secure-session handling behind interfaces. Select packages only after Android/iOS/web proof-of-concept testing; pin supported versions at implementation time.

Native authentication needs a reviewed session/token flow; existing browser cookies cannot simply be assumed to work on a phone. Web authentication requires correct cookie/CORS/CSRF handling. No database credentials or privileged keys in Flutter builds.

The server remains authoritative for bills, stock validation and rent. Any Dart offline projection must be checked against shared golden fixtures from the existing engine, including rate changes, multiple lots, partial returns, minimum days, reversals and bill boundaries. Expose sync/version metadata and cursor-based incremental updates.

Entities: Organization, User, Customer, Site/Account, Item, Issue/Return/Loss/Reversal event, Bill and frozen lines, Payment and allocation, Adjustment, Settings, Audit event, device Outbox; optionally Follow-up note. Preserve existing IDs and transaction links during migration.

Official design references: [Flutter adaptive design](https://docs.flutter.dev/ui/adaptive-responsive), [architecture recommendations](https://docs.flutter.dev/app-architecture/recommendations), [offline-first guidance](https://docs.flutter.dev/app-architecture/design-patterns/offline-first), [web platform FAQ](https://docs.flutter.dev/platform-integration/web/faq). These inform architecture; the business rules above come from the owner and repository review.

## 7. Quality and performance gates

Proposed acceptance targets, measured in profile/release builds on an agreed mid-range Android phone, supported iPhone, and desktop browser:

| Measure | Target |
|---|---|
| Tap acknowledgement | Within 100 ms without waiting for network |
| Cached list/search response | p95 within 200 ms at 5,000 customers / 500 items |
| Cached detail navigation | p95 within 300 ms |
| Native cold start to usable cached Home | p95 within 2 seconds |
| Web warm start to usable Home | p95 within 2 seconds |
| Web first load | Target within 5 seconds on agreed 10 Mbps / 100 ms RTT profile; measure payload and actual result |
| Scrolling | Target 60 fps on reference devices; profile long lists and avoid sustained jank |
| Transaction reliability | No lost acknowledged local writes or duplicate server entries in retry/restart tests |

Use paginated/virtualized lists and incremental sync. Validate 360-pixel phone width through large desktop, landscape, large text, keyboard navigation, and Malayalam rendering. Error monitoring must avoid leaking customer phone numbers or financial content. Backups and restore rehearsal are required before cutover.

## 8. Initial equipment data — owner-supplied, not yet import-ready

Preserve these names until spelling/meaning is confirmed. Quantity purpose and daily-rate basis remain unconfirmed. Continuation-line sizes and “Tile cutter” are interpretations.

| Item | Supplied quantity | Unit rate ₹ |
|---|---:|---:|
| Span 8 feet | 30 | 7 |
| Jakki | 100 | 5 |
| Paip kuth | 100 | 4 |
| KD sheet | 72 | 2 |
| Concrete sheet | 2 | 100 |
| Thoni | 1 | 200 |
| Scaffold | 12 | 100 |
| Urbana | 2 | 100 |
| Paint paip 6 metres | 15 | 15 |
| Paint paip 3 metres — interpreted | 15 | 10 |
| Lindil sheet 8 feet | 50 | 10 |
| Lindil sheet 4 feet — interpreted | 40 | 5 |
| Vibrator | 2 | 400 |
| Chatty | 6 | 30 |
| Kotta | 7 | 20 |
| Kolamkori | 2 | 30 |
| Kaikot | 3 | 30 |
| Shavval | 2 | 30 |
| Shu | 2 | 50 |
| Tile cutter — supplied as Tail cutter | 1 | 100 |
| Barrel | 5 | 50 |
| Idi mutti | 1 | 50 |

Quantity × unit-rate sum is ₹5,959. This is not an invoice or confirmed daily revenue. No audio transcription was available; the table is based on the owner’s typed list.

## 9. Migration and release constraints

Audit actual production data before choosing an import path. Seed data contains ten sample items and cannot prove production inventory. Preserve customer/site IDs, open lots and their original dates, rate/minimum snapshots, stock, payments/allocations, invoices and numbers. Do not replace historical lots with one opening balance: that destroys aging and FIFO.

Reconcile old/new item availability, customer balances, open quantities, and frozen bills before cutover. Pilot with real counter staff using a staging copy. Prevent uncontrolled concurrent entry during cutover; require an explicit write-ownership window and reconciliation of device outboxes. Keep rollback and backups available. No production overwrite in the planning phase.

## 10. Decisions to settle before affected implementation

1. Are the supplied quantities total stock or one customer’s rental? Are rates daily?
2. Confirm item spellings, the two continuation sizes, and “Tail cutter”.
3. Confirm day-1 counting and whether all items or selected main items need overdue alerts.
4. Confirm minimum rental days, issue/return-day charging, and damage/loss pricing. Existing code is evidence of behavior, not proof of the owner’s intended policy.
5. Confirm Android/iOS launch order, Malayalam UI priority, and target devices/browsers.
6. Confirm whether damaged stock must be unavailable pending repair.
7. Confirm existing backend reuse after API/auth audit and production-data inspection.

These questions do not block UX prototypes, architecture exploration or fixture-based testing. They do block silently importing assumptions as business facts.
