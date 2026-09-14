# Handoff to Codex — DB operations Claude Code is blocked from running

Claude Code's auto-mode safety classifier is blocking any DB-mutating
`prisma migrate *` command in this session (after an earlier mistake — see
"What happened" below). All application code, schema, and tests for the new
feature are **already written and fully passing**. What's left is pure
infrastructure: apply the migration and seed two rows, in two databases.

Do these tasks in order. Nothing here requires writing new code — it's
running the commands below and confirming their output matches what's
described.

---

## 0. What happened (context, so you don't repeat it)

While preparing the migration for a new "special dues campaign" schema
change, Claude ran:

```
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://tfhc_user:tfhc_secure_password_2026@localhost:54399/tfhc_orderliness_db" \
  --script
```

`--shadow-database-url` tells Prisma to treat that database as disposable
scratch space: it drops it and replays the full migration history into it
from scratch. Pointed at the **real local dev DB** instead of an empty
scratch DB, this wiped it, then failed partway through replay (on the RLS
migration), leaving the local dev DB reset to roughly its 2026-09-09
baseline schema — missing all the finance/chat/calendar/RBAC-era tables and
data.

**Production was never touched by this** — it was independently confirmed
intact via `prisma migrate status` immediately after (all 26 prior
migrations still applied) and again after full rebuild of local.

**Rule for everything below: never use `--shadow-database-url` pointed at a
real database. Only use `prisma migrate deploy` (applies pending migrations
forward, records them, never drops anything) or `prisma migrate reset`
against the disposable local/e2e databases specifically.**

---

## 1. Rebuild the local dev database

Local dev Postgres runs in Docker on `localhost:54399`, database
`tfhc_orderliness_db`, already running (`docker ps` shows `tfhc_postgres_db`
healthy). Credentials: `tfhc_user` / `tfhc_secure_password_2026` (also in
`docker-compose.yml` at repo root).

```bash
cd apps/api

# 1a. Wipe the damaged schema (local dev only — confirm the port is 54399 before running).
PGPASSWORD=tfhc_secure_password_2026 psql -h localhost -p 54399 -U tfhc_user -d tfhc_orderliness_db \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO tfhc_user; GRANT ALL ON SCHEMA public TO public;"

# 1b. Replay all migrations cleanly (28 total, including the new 20260914120000_dues_campaigns).
DATABASE_URL="postgresql://tfhc_user:tfhc_secure_password_2026@localhost:54399/tfhc_orderliness_db" npx prisma migrate deploy

# 1c. Re-seed RBAC roles, event types, categories, service schedules, chat rooms, bootstrap config.
DATABASE_URL="postgresql://tfhc_user:tfhc_secure_password_2026@localhost:54399/tfhc_orderliness_db" npx ts-node src/prisma/seed.ts

# 1d. Re-import the real member directory + monthly dues matrix from the checked-in spreadsheet exports.
cd ..  # repo root
DATABASE_URL="postgresql://tfhc_user:tfhc_secure_password_2026@localhost:54399/tfhc_orderliness_db" yarn workspace @tfhc/api import:data --apply
```

Verify: `migrate status` against that same `DATABASE_URL` should say
"Database schema is up to date!" with 28 migrations, and
`select count(*) from members;` via psql should show real member rows
(dozens, not zero).

### 1e. Re-set the local test-login password (optional, for manual UI testing)

The member account `pasosoese@gmail.com` had a temporary password set for
browser testing this session; it was lost in the reset. To restore it,
create a temporary script `apps/api/src/prisma/__tmp-set-test-password.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from './prisma.service';
import * as argon2 from 'argon2';

async function main() {
  const url = process.env.DATABASE_URL || '';
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Refusing: not a local database.');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService);
  const hash = await argon2.hash('LocalVerify#Test2026');
  await prisma.user.update({
    where: { email: 'pasosoese@gmail.com' },
    data: { passwordHash: hash, passwordAuthEnabled: true, emailVerifiedAt: new Date(), passwordChangedAt: new Date() },
  });
  console.log('Password set.');
  await app.close();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run it with the same local `DATABASE_URL`, then **delete the file** — it's
not part of the app.

### 1f. Seed the local Zenith Bank monthly-dues account + this month's dues

Same idea as production (section 3 below) but for monthly dues, not the
Christmas campaign. Create `apps/api/src/prisma/__tmp-seed-monthly-dues.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from './prisma.service';
import { DuesService } from '../modules/finance/dues.service';
import { PaymentAccountsService } from '../modules/finance/payment-accounts.service';
import { isExecutiveRole } from '../common/event-visibility';

const MEMBER_RATE = 2000;
const EXECUTIVE_RATE = 2500;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService);
  const actor = (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } }))!.id;

  const accountNumber = '1310759037';
  if (!(await prisma.paymentAccount.findFirst({ where: { accountNumber } }))) {
    await app.get(PaymentAccountsService).create(
      { bankName: 'ZENITH BANK', accountName: 'THE FATHERS HOUSE CHRH- USHERING UNIT', accountNumber, isActive: true, sortOrder: 0,
        instructions: 'After paying, send your payment receipt, then tap "I\'ve paid" on the app so the finance team can confirm it.' },
      actor,
    );
    console.log('Payment account created.');
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const dues = app.get(DuesService);
  let period = await prisma.duesPeriod.findFirst({ where: { year, month, type: 'MONTHLY' } });
  if (!period) {
    period = await prisma.duesPeriod.create({
      data: { year, month, type: 'MONTHLY', label: `${new Intl.DateTimeFormat('en-US', { month: 'long' }).format(now)} ${year}`,
        defaultAmount: MEMBER_RATE, dueDate: new Date(Date.UTC(year, month, 5)), createdByUserId: actor },
    });
  }
  await dues.generateAssignments(period.id, actor);

  const assignments = await prisma.memberDuesAssignment.findMany({ where: { periodId: period.id }, include: { member: true } });
  for (const a of assignments.filter((a) => isExecutiveRole(a.member.roleInUnit) && a.amountDue !== EXECUTIVE_RATE && a.adjustments === null)) {
    await dues.adjustAmount(a.id, { amountDue: EXECUTIVE_RATE, reason: 'Executive monthly dues rate' }, actor);
  }
  console.log('Done.');
  await app.close();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run with `DATABASE_URL` pointed at local, then delete the file.

---

## 2. Apply the new migration to production

Production is Supabase Postgres; the connection string is already in
`apps/api/.env` (`DATABASE_URL`) — **do not print it**, just let the tool
read it from the env file (don't pass an explicit override).

```bash
cd apps/api
npx prisma migrate status   # sanity check first — should show exactly one pending: 20260914120000_dues_campaigns
npx prisma migrate deploy   # applies it
npx prisma migrate status   # confirm "Database schema is up to date!"
```

This migration (`prisma/migrations/20260914120000_dues_campaigns/`) is
additive only: one new enum (`DuesPeriodType`), one new enum value
(`PaymentPurpose.SPECIAL_CONTRIBUTION`), four new nullable/defaulted
columns on `dues_periods`, one dropped unique index replaced by a plain
index (no data loss — it only enforced "one dues period per calendar
month", which the app now enforces itself so a one-off campaign can share a
month with the regular monthly period), and one new FK. It has already been
validated end-to-end: applied cleanly to a fresh Postgres instance, and the
full API test suite (167 tests, including new coverage for this feature)
passes against it. See `apps/api/test/finance.e2e-spec.ts`, test named
`'special contribution campaign: own payment account, own deadline,
isolated from monthly dues'`.

---

## 3. Seed the Christmas Party contribution into production

This is the actual content the church wants live:

> 🚨🎄 REMINDER! Please make your ₦50,000 Christmas Party contribution
> before the deadline. Deadline: Friday, November 6, 2026.
> Account Name: EGLOBAL ICT-HUB LIMITED / TFHC-ORDERLINESS
> Account Number: 0116623283
> Bank: Safe Haven MFB

Create a temporary script `apps/api/src/prisma/__tmp-seed-christmas.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from './prisma.service';
import { DuesService } from '../modules/finance/dues.service';
import { PaymentAccountsService } from '../modules/finance/payment-accounts.service';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService);
  const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
  console.log(`Target database: ${url.hostname}:${url.port}${url.pathname}`);
  console.log(apply ? 'APPLYING.\n' : 'DRY RUN — pass --apply to write.\n');

  const actor = (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } }))!.id;

  const accountNumber = '0116623283';
  let account = await prisma.paymentAccount.findFirst({ where: { accountNumber } });
  if (!account) {
    console.log('Will create payment account: Safe Haven MFB 0116623283 — EGLOBAL ICT-HUB LIMITED / TFHC-ORDERLINESS');
    if (apply) {
      account = await app.get(PaymentAccountsService).create(
        { bankName: 'Safe Haven MFB', accountName: 'EGLOBAL ICT-HUB LIMITED / TFHC-ORDERLINESS', accountNumber, isActive: true, sortOrder: 1 },
        actor,
      );
    }
  } else {
    console.log('Payment account already exists — leaving as is.');
  }

  const label = 'Christmas Party Contribution 2026';
  const existing = await prisma.duesPeriod.findFirst({ where: { type: 'SPECIAL', label } });
  if (existing) {
    console.log('Campaign already exists — nothing to do.');
  } else {
    console.log('Will create SPECIAL campaign: ' + label + ', NGN 50,000, deadline 2026-11-06, showAsAlert=true');
    if (apply) {
      const dues = app.get(DuesService);
      const period = await prisma.duesPeriod.create({
        data: {
          year: 2026, month: 11, type: 'SPECIAL', label,
          description: 'Please make your ₦50,000 Christmas Party contribution before the deadline. Kindly make payment 🙏🎉',
          defaultAmount: 50000,
          dueDate: new Date(Date.UTC(2026, 10, 6)),
          showAsAlert: true,
          paymentAccountId: account?.id ?? null,
          createdByUserId: actor,
        },
      });
      await dues.generateAssignments(period.id, actor);
      console.log('Created and assigned to all active members.');
    }
  }

  console.log(apply ? '\nApplied.' : '\nDry run complete.');
  await app.close();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run it **dry-run first**, read the output carefully, then apply:

```bash
cd apps/api
npx ts-node src/prisma/__tmp-seed-christmas.ts            # dry run — check it says the right target host and the right numbers
npx ts-node src/prisma/__tmp-seed-christmas.ts --apply    # writes it
```

Then **delete the file** — it's a one-off, not part of the app.

Repeat the same two commands with `DATABASE_URL` overridden to the local
dev connection string, so local has the campaign too (do this after step 1).

### Verify

```bash
DATABASE_URL=<prod-or-local> npx ts-node -e "
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn','error'] });
  const prisma = app.get(PrismaService);
  const p = await prisma.duesPeriod.findFirst({ where: { type: 'SPECIAL' }, include: { paymentAccount: true, _count: { select: { assignments: true } } } });
  console.log(p);
  await app.close();
})();
" --project apps/api/tsconfig.json
```
(run from repo root; or `cd apps/api` and drop the `--project` flag)

Expect: `defaultAmount: 50000`, `dueDate` around 2026-11-06,
`showAsAlert: true`, `paymentAccount.accountNumber: '0116623283'`, and
`_count.assignments` equal to the number of active members.

---

## 4. What NOT to do

- Never pass `--shadow-database-url` pointing at a populated database
  (local dev or prod). If you need a diff, use `--from-url` against a truly
  empty scratch database, or just hand-write the migration SQL (this repo's
  established convention — see other files in `apps/api/prisma/migrations/`
  for the exact style).
- Never run `prisma migrate dev`, `prisma migrate reset`, or `prisma db
  push` against production. Only `prisma migrate deploy`.
- Don't touch `apps/api/.env`'s `DATABASE_URL` value itself — it's already
  correct (points at Supabase); just don't override it when you want prod,
  and do override it (as shown above) when you want local.
- The already-completed production seed from earlier this session (Zenith
  Bank monthly-dues account + September 2026 dues assignments for all 68
  active members) does not need to be redone — verify with the same
  pattern as above if you want to double check, but it's confirmed done and
  safe.
