# Runbook

Everything a human has to do by hand: first-time setup, the two environments,
deploys, and the day-to-day operations the software deliberately does not
automate.

Work top to bottom the first time. After that, jump to the section you need.

---

## 0. What you need before you start

| | |
|---|---|
| Node | 22 (`.nvmrc`) — `nvm use` |
| pnpm | `corepack enable` |
| Accounts | GitHub, [Neon](https://neon.tech), [Vercel](https://vercel.com) — all free tier |
| A phone | To test the yard screens at 360px, which is where they actually live |

Nothing in this project needs Docker, a local Postgres, or a paid service.

---

## 1. Branches

Three git branches, each mapping to one environment:

| Branch | Environment | Database | Who breaks it |
|---|---|---|---|
| `main` | Preview deploys | Neon `dev` branch | You, constantly. That is what it is for. |
| `staging` | staging.yourdomain | Neon `staging` branch | Nobody except a promotion from `main` |
| `production` | The yard's real URL | Neon `production` branch (primary) | Nobody except a promotion from `staging` |

Work happens on `main` (or short-lived branches off it). Nothing is ever
committed directly to `staging` or `production` — code only arrives there by
being merged forward, so what the yard runs is always something that already
survived staging.

```bash
# Promote work to staging
git checkout staging && git merge --ff-only main && git push

# Promote staging to production, once the yard has used it for a day
git checkout production && git merge --ff-only staging && git push
git checkout main
```

`--ff-only` is deliberate: if it refuses, the branches have diverged, which
means somebody committed straight to staging or production. Find out why before
forcing it.

### 1a. Connect the repo to GitHub

The branches exist locally already. To push them:

```bash
gh repo create bismi-rental --private --source=. --remote=origin
git push -u origin main staging production
```

Then in GitHub → Settings → Branches, protect `staging` and `production`:
require the CI check to pass, and disallow force pushes. `.github/workflows/ci.yml`
runs typecheck, lint, 196 tests, and a build on every push and PR.

---

## 2. Neon — three database branches

Create one project, then three branches inside it. Neon branches are copy-on-
write, so this costs nothing extra and staging can be reset from production data
whenever you want a realistic test.

1. **Create the project.** Region: `ap-southeast-1` (Singapore) — the closest to
   Kerala on the free tier.
2. The default branch becomes **`production`** (rename it if Neon called it
   `main`, to match the git branch).
3. Create a child branch **`staging`** from it.
4. Create a child branch **`dev`** from it, for local work and preview deploys.

For each branch, copy **two** connection strings from the Neon dashboard:

| Variable | Which string |
|---|---|
| `DATABASE_URL` | Pooled (`-pooler` in the host) — used by request handlers |
| `DATABASE_URL_UNPOOLED` | Direct — used by `drizzle-kit` and the seed |

Both are needed. The pooled connection cannot hold the interactive transactions
that returns and bills run in; the direct one cannot survive a serverless
request pattern.

---

## 3. Local setup

```bash
nvm use
pnpm install
cp .env.example .env.local
```

Fill in `.env.local` with the **`dev`** branch strings, then generate the two
secrets:

```bash
openssl rand -base64 32   # → BETTER_AUTH_SECRET
openssl rand -base64 32   # → PORTAL_TOKEN_PEPPER
```

> `PORTAL_TOKEN_PEPPER` is mixed into every portal token hash. **Changing it
> invalidates every statement link ever sent.** Generate it once per environment
> and never rotate it casually.

Set the yard's own details in the same file — they print at the top of every
bill:

```
SEED_ORG_NAME=Bismi Scaffolding
SEED_YARD_ADDRESS=Aluva, Ernakulam, Kerala 683101
SEED_YARD_PHONE=+91 98460 00000
SEED_ADMIN_EMAIL=owner@example.com
SEED_ADMIN_PASSWORD=          # 10+ characters; the seed refuses without it
SEED_PAYMENT_TERMS_DAYS=7     # days from issue to a bill's due date
```

Then:

```bash
pnpm db:migrate    # applies the three migrations
pnpm seed          # org, settings, super_admin, ten items at Kerala rates
pnpm dev           # → http://localhost:3000
```

Sign in with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

Re-running `pnpm seed` is safe: it adds nothing twice, and it *does* refresh the
yard address, phone, and payment terms — that is how you correct the bill header
until the settings screen arrives at M7. It never resets the invoice counter.

---

## 4. Vercel — two projects

Simplest reliable arrangement: **one Vercel project per environment**, each
locked to one git branch. One project with three environments also works, but
then a mistake in the env-var scope points the yard's live app at staging data,
and that failure is silent.

For each of the two projects:

1. **New Project** → import the GitHub repo.
2. **Settings → Git → Production Branch**: `staging` for the staging project,
   `production` for the production one.
3. **Settings → Git → Ignored Build Step** on the staging project, so it does
   not also build `production` commits:
   `if [ "$VERCEL_GIT_COMMIT_REF" != "staging" ]; then exit 0; fi`
4. **Settings → Environment Variables** — from that environment's Neon branch:

   ```
   DATABASE_URL              (pooled)
   DATABASE_URL_UNPOOLED     (direct)
   BETTER_AUTH_SECRET        (a fresh one per environment)
   BETTER_AUTH_URL           https://<that environment's URL>
   NEXT_PUBLIC_APP_URL       https://<that environment's URL>
   PORTAL_TOKEN_PEPPER       (a fresh one per environment, then never changed)
   CRON_SECRET               (M7)
   R2_*                      (M7, photo uploads)
   ```

5. Region: **Singapore (`sin1`)**, matching Neon.

Preview deploys from `main` should point at the Neon `dev` branch — set those
variables in the staging project's *Preview* scope.

### Migrations on deploy

Vercel does not run migrations. Apply them yourself, from your machine, against
the environment's **unpooled** URL, *before* promoting the code that needs them:

```bash
DATABASE_URL_UNPOOLED='<staging direct string>' pnpm db:migrate
git checkout staging && git merge --ff-only main && git push
```

Every migration so far is additive (new columns with defaults), so applying
before deploying is safe: the old code ignores the new columns. Keep it that
way — a migration that drops or renames a column needs the two-step dance
(deploy code that tolerates both shapes, then migrate) and should be discussed
before it is written.

---

## 5. Go-live checklist

Do not skip 1 and 2. They are the two that cannot be corrected afterwards.

- [ ] **Answer the six questions** at the end of [`decisions.md`](decisions.md) —
      day counting, the 15-day minimum, whether both the issue and return day
      are billed, damage pricing, rate visibility, and the portal lookup policy.
      Bills are immutable by design, so a wrong convention gets frozen into
      paperwork that cannot be edited.
- [ ] **Check `settings.billing`** matches those answers before the first real
      bill (`select billing from settings;`).
- [ ] Walk one full lifecycle on staging with real figures: open a site, issue,
      part-return, damage a few, bill, print both PDFs, record a payment, close.
      Compare every number against the yard's register by hand, once.
- [ ] Item master matches the yard: names, rates, replacement rates, and
      quantities owned (`/items`).
- [ ] Yard name, address, and phone appear correctly on a bill PDF.
- [ ] Invoice prefix and starting number agree with the existing book, so the
      first software invoice continues the sequence rather than restarting it
      (`update settings set invoice_prefix = 'INV', next_invoice_no = 1043;`).
- [ ] A second admin account exists, so the yard is not locked out if one
      password is lost (`/users`).
- [ ] Test the restore, not just the backup — see below.
- [ ] Open every screen on the actual phone that will be used, in daylight.

---

## 6. Backups

Neon's free tier keeps 24 hours of point-in-time restore. That covers a mistake
noticed today; it does not cover an account problem or a deletion noticed next
week. §12 asks for a nightly `pg_dump` committed to a private repo, kept 30
days — that is M7 work and is **not built yet**.

Until it is, take a manual dump before anything risky (a migration, an import):

```bash
pg_dump "$DATABASE_URL_UNPOOLED" --no-owner --format=custom -f yard-$(date +%F).dump
```

And **test a restore once**, into a scratch Neon branch, before go-live. An
untested backup is not a backup.

---

## 7. What stays manual, by design

These are not gaps. The product is built this way on purpose.

**Money is never collected by the software.** There is no payment gateway. Cash
and UPI change hands in the yard; someone records the receipt at
`/payments/new`. What the software guarantees is the arithmetic — which bill a
payment settles (oldest first), and that no day of rent is charged twice or
missed.

**No message is ever sent automatically.** Statements, invoices, receipts, and
reminders open in the yard's own WhatsApp with the text prepared. A human reads
it and taps send. The overdue queue on the dashboard is a list to work through,
not a campaign.

**Billing is a decision, not a schedule.** Nothing bills monthly on its own. An
admin opens the account, checks the preview, adds any adjustment, and confirms.

**Corrections are entries, never edits.** A wrong movement is reversed with a
reason; a wrong bill is a credit adjustment plus a new bill. The database
enforces both — `movements` refuses `DELETE`, `bills` refuses `UPDATE`.

---

## 8. Routine operations

| Task | Where |
|---|---|
| Equipment leaving | `/issue` — customer → site → date → items |
| Equipment coming back | `/return` — good, damaged, or lost per line |
| Fix a wrong entry | Account screen → the row → **Reverse this entry** (reason required) |
| Bill a period | Account screen → **Generate bill** → preview → issue |
| Record money received | `/payments/new` |
| Chase overdue money | Dashboard → **Overdue bills** → tap through to WhatsApp |
| Add a contractor | `/customers/new`, or inline during an issue |
| Change a rate | `/items` (super admin). Only affects future issues. |
| Add staff | `/users` (super admin). Users are deactivated, never deleted. |

### If the bill preview warns about earlier periods

"Rent from earlier periods was never billed" means a gate pass was written up,
or a movement reversed, *after* the period covering it had already been billed.
The old bill cannot be edited and this one starts later, so the amount would
otherwise vanish. Add the charge (or credit) adjustment it suggests, on this
bill. The warning clears once any bill is raised over it.

---

## 9. Milestones still to come

| | | |
|---|---|---|
| M5 | Offline layer | The app needs signal today. This is the biggest remaining gap for someone standing in a yard with no bars. |
| M6 | Customer portal | Contractors cannot check their own dues yet; you send them a statement. |
| M7 | Reports & polish | Seven reports, settings screens, photo and signature capture, CSV import of existing balances, nightly backups, Sentry. |
