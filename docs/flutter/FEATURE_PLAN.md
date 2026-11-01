# Bismi Rental — Flutter feature and delivery plan

31 October 2026 · Proposed plan · [Product requirements](REQUIREMENTS.md)

## 1. Delivery strategy

Build a new mobile-first Flutter client with an adaptive web layout. Preserve proven accounting behavior and data while replacing the counter workflow. Deliver vertical slices that work from screen through API, local persistence and reconciliation. Do not postpone all offline work until the end.

Launch scope includes customers/sites, items/stock, issue, partial returns, 16th-day equipment overdue, accounting, bills/PDFs, payments, sharing, core reports, roles and offline operational capture. Android/web are the proposed first release; iOS uses the same backlog plus device and distribution validation. The app is not production-ready at the first UI demo.

## 2. Existing feature mapping

| Capability | Current repository | Flutter action | Requirement |
|---|---|---|---|
| Customer/site management | Implemented | Reuse services; redesign forms and combined profile | R-01, R-02 |
| Catalogue/rates/minimum days | Implemented | Adaptive editing and historical snapshot protection | R-03 |
| Stock and warnings | Implemented | Fast local search, whereabouts, clearer availability | R-04 |
| Issue | Implemented | Short mobile flow with sticky totals and drafts | R-05 |
| Partial returns/damage/loss | Implemented | Outstanding-only picker and split quantities | R-06 |
| Equipment overdue | Dashboard starts at 60 days, amber and limited | Replace with explicit 16th-day red alerts and complete queue | R-07 |
| FIFO/rent engine | Implemented server-side | Retain authority; fixture-test any local projection | R-08 |
| Invoices/PDFs | Implemented | New preview, sharing and print adapters | R-09 |
| Payments/adjustments | Implemented | Simple receive-money flow and reliable outbox | R-10 |
| Reports | Implemented despite stale README milestone | Add API surface and adaptive reporting UI | R-11 |
| WhatsApp templates | Implemented, manual EN/ML | Platform sharing and equipment-overdue template | R-12 |
| Offline | Partial web implementation | Native local database, explicit web cache strategy, conflict recovery | R-13 |
| Staff/settings | Staff and message settings implemented; broader UI incomplete | Role-safe administration and audited business settings | R-14 |
| Customer portal | Helpers exist; UI incomplete | Later release, not a launch dependency | Later |

Status is based on code inspection, not a live production audit. Existing uncommitted changes are present; implementation must preserve them.

## 3. Phases and exit criteria

### Phase 0 — Business baseline and backend audit

Deliverables:

- Resolve data/rate/day-count/minimum-day decisions in REQUIREMENTS §10 with concrete examples.
- Inventory real endpoints versus services called only from Next.js server pages.
- Document authentication for native and web, permissions, API errors, pagination, idempotency, sync cursors and version compatibility.
- Build sanitized fixtures for original issue lots, partial returns, old/new rates, bills, payments and offline conflicts.
- Capture baseline counts/totals from a staging data copy; no production mutation.

Exit: agreed financial examples, API gap list, data mapping and cutover constraints are reviewable. Backend reuse is accepted or a replacement decision is documented with parity cost.

### Phase 1 — UX prototype and Flutter foundation

Deliverables:

- Design tokens, typography, quantity controls, cards, status labels, searchable lists and accessible form components.
- Phone Home/Issue/Return/Overdue/Customer prototypes; tablet/desktop list-detail versions.
- Flutter Android/iOS/web skeleton, adaptive navigation, authenticated routes, localization foundation and repository interfaces.
- Prove local storage, session persistence, browser direct routes, PDF opening/sharing and web offline shell on target platforms.
- Profile a large synthetic list before committing to package choices.

Exit: yard user can understand the prototype without coaching; layout works at phone/tablet/desktop widths; technical spikes show feasible authentication and persistence. Performance targets have named reference devices.

### Phase 2 — Customers, sites and inventory

Deliver R-01–R-04 and essential R-14 permissions: customer search/edit/create, phone actions, sites/general account, item master, rates/minimum days, availability, stock warnings and whereabouts. Add cached reads, incremental download and freshness labels now.

Exit: multi-site customer totals and stock match server fixtures; changing rates cannot rewrite old issue values; deactivated items remain visible where outstanding; unauthorized mutations fail server-side.

### Phase 3 — Issue, return and operational offline sync

Deliver R-05/R-06 and core R-13: multi-item issue, partial returns, damage/loss, draft persistence, reviews/receipts, outbox, retry, new-customer/site dependencies, per-line conflict handling and audit reversals.

Exit: issue 100 → return 40 → return 60 reconciles correctly online and after offline restarts. Double tap/retry produces one transaction. Two-device conflicts never silently discard a valid entry. Invalid returns retain editable drafts.

### Phase 4 — 16th-day equipment overdue

Deliver R-07 and overdue parts of R-12: complete red overdue queue, Home badge/summary, group/lot details, call/share actions, search, age ordering and follow-up notes.

Exit: day 15 has no alert; day 16 has an alert under the confirmed counting convention. Partial return changes only remaining old quantities. New issues do not refresh old dates. Full return clears the alert. App resume/date rollover recalculates correctly; all overdue entries are reachable, including beyond ten records.

This phase is mandatory before any production pilot, regardless of completion of financial polish.

### Phase 5 — Accounting, bills, payments and reports

Deliver R-08–R-12: server-authoritative balances, configurable validated minimum days, charges/credits, invoice preview/finalization, A4/thermal PDFs, payment entry/allocation/advance, EN/ML share templates and year/month reports. Add payment outbox and audited settings/staff UI.

Exit: server/client projections agree on shared golden cases; paid/partial/overdue states are correct; immutable bills survive rate edits; old periods are not billed twice; queued payments allocate exactly once; PDFs render correctly with long names and multi-page bills.

### Phase 6 — Migration rehearsal, pilot and release

Deliver backups/restore rehearsal, staging import, reconciliation report, performance/accessibility testing, network-loss/restart tests, device/browser matrix, operator training and release checklist. Package Android/web and validate iOS according to rollout decision.

Exit: zero unexplained differences in opening quantities, customer balances, allocations and invoice totals; all critical acceptance scenarios pass; staff complete issue/return tasks within target times; no unresolved critical sync/auth/data-loss bugs. Cutover and rollback steps are executable, not just described.

## 4. Screen backlog

| Screen | Essential content/actions |
|---|---|
| Login/session recovery | Staff credentials, error handling, session expiry, protected cache behavior |
| Home | Issue/Return actions, red equipment-overdue summary, active customers, today, money summary, sync warnings |
| Customers | Search name/mobile; create; active/outstanding filters |
| Customer detail | Contact, combined balance, sites, out equipment, bills/payments/history |
| Site detail | Destination, outstanding lots, issue/return/payment actions, full history |
| Stock | Owned/out/lost/available, low/negative alerts, item holders |
| Item editor | Name/size/unit, quantities, rates, minimum days, active/monitoring flags |
| Issue | Customer/site, item search, quantity, availability, date, total, review |
| Return | Outstanding items, good/damaged/lost quantities, date, review |
| Overdue | Complete aged lots grouped by customer/site, filters, call/share/return |
| Receive payment | Account, amount, method, date, reference, receipt |
| Bill preview/detail | Period, lines, adjustments, due date, finalization, PDF/share |
| Reports | Year/month, billed/received, methods, movements, top customers |
| Sync centre | Pending/accepted/rejected entries, freshness, reasons, retry/recovery |
| Settings/staff | Business/language/terms, roles, active status, audited changes |

## 5. Cross-platform capability contract

| Capability | Native mobile | Web |
|---|---|---|
| Navigation | Back gestures/system back; bottom navigation | Browser history/deep links; rail/sidebar at wide sizes |
| Offline data | Durable local database with authenticated bootstrap | Browser storage plus explicit shell caching; test eviction limitations |
| Sync | Open/resume/reconnect; optional background work | Open/focus/reconnect; background work not guaranteed |
| PDF | Open/share/download through supported platform adapter | Download/open/print |
| WhatsApp/call | Installed-app/share/phone actions | Supported link/copy fallback |
| Alerts at launch | In-app queue and badge | In-app queue and badge |
| Push later | Permission-based delivery; no correctness dependency | Capability/permission checks and fallback |

## 6. Test scenarios required for launch

| ID | Scenario | Expected result |
|---|---|---|
| A01 | Issue-date/day-15/day-16 boundary | Exactly the agreed equipment-age alert behavior |
| A02 | Old and new lots of the same item | Only old remainder overdue; FIFO return mapping |
| A03 | Partial/full return | Accurate stock, remaining rental and alert clearing |
| A04 | Edit rate/minimum days after issue | Old rental keeps snapshots; new rental gets new values |
| A05 | Same-day and month-boundary billing | Matches approved date/minimum examples |
| A06 | Damage/loss and reversal | Correct charge, stock and auditable history |
| A07 | Overpay and issue next bill | Advance applied once to oldest eligible debt |
| A08 | Repeated sync after crash or timeout | No duplicate issue/return/payment |
| A09 | Two devices return the same units | Server rejects excess explicitly; draft recoverable |
| A10 | Offline new customer + site + issue | Dependency order retained; IDs reconciled correctly |
| A11 | Outdated cache or revoked user | Staleness shown; server access denied when revoked |
| A12 | Phone/desktop/large text/Malayalam | Usable content, controls and navigation without clipping |
| A13 | More than ten overdue lots | Full list accessible and summary counts accurate |
| A14 | Data migration | Balances, stock, dates, allocations, frozen bills reconcile |
| A15 | Return then reversal after an alert | Reopened old quantity appears overdue again |
| A16 | Sign-out/update with pending writes | No silent loss; explicit recovery path |

## 7. Later enhancements

After stable launch: customer read-only portal with verified access; opt-in owner push alerts; confirmed delivery-aware automated messaging; CSV exports; barcode/QR scanning; photos/signatures; repair-stock lifecycle; direct Bluetooth printing; multi-yard transfers; advanced profitability reports. Each requires a separate requirement and acceptance gate. None should delay the mandatory overdue/issue/return experience.

## 8. Planning and estimation rules

No calendar completion promise is assigned before Phase 0 and the storage/auth spikes. Estimate each phase using actual API gaps, team capacity, migration volume and platform results. Separate UI complete, server integrated, offline verified, and production accepted in tracking. A screen screenshot is not completion of its feature.

First implementation milestone: one polished, integrated customer → issue → partial return → day-16 overdue slice on Android and web, using staging data and a correct outbox. Extend the established patterns to financial and administrative screens.

## 9. Source evidence

- `lib/dashboard/service.ts`: current long-held threshold 60; only ten lots returned.
- `app/(home)/page.tsx`: amber long-held alerts, only two selected for Home.
- `lib/accrual/config.ts`: new-item minimum default 5; global minimum differs.
- `app/reports/page.tsx`, `lib/reports/service.ts`: existing reports implementation.
- `lib/sync/*`: current mirror/outbox/idempotency foundation.
- `lib/auth/*`, `app/api/*`: authorization and API starting points; native coverage requires audit.
- `scripts/seed.ts`: ten sample inventory entries, not the owner’s supplied 22 rows.
- Existing README progress table is stale in places; current code and verified behavior take priority when mapping parity.
