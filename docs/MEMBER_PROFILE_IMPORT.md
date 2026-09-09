# Member & dues spreadsheet import

Personal details live on `Member`; authentication email remains on `User` and `ApprovedMember`. Profiles support names, phone numbers, address, gender, profession, an optional full date of birth, and a yearless birthday (`MM-DD`). A yearless birthday does not imply a birth year.

Apply database migrations and regenerate Prisma before deploying the API and web changes. Members can edit their personal details at `/member/profile`; email, account roles, approval status, and membership assignments are not self-editable.

## Full sync — directory + monthly dues (`import:data`)

Use this to load the real membership and dues history. It **creates** missing
members (not just profile updates), links them to the Google allow-list by
**normalised email**, and reconciles the monthly-dues matrix by matching **name →
directory alias → email → member**.

```sh
# report only (dry run)
DATABASE_URL=<target> yarn workspace @tfhc/api import:data
# write
DATABASE_URL=<target> yarn workspace @tfhc/api import:data --apply
```

Datasets: `apps/api/prisma/data/member-directory.json` and
`apps/api/prisma/data/dues-matrix-2025.json` (transcribed from the source Google
Sheets — see that folder's `README.md` for the fields to verify). The same shapes
are accepted at `POST /members/import` (`members.create`) and
`POST /finance/dues/import` (`dues.create`), and the admin UI exposes them via the
**Import from spreadsheet** modal on `/admin/finance/dues`.

Matching rules:
- Directory rows link by lower-cased email; an existing `User` with that email is
  attached, otherwise a new `Member` + `ApprovedMember` is created.
- Dues rows resolve to a member via directory `aliases` (order-independent,
  typo-tolerant); rows with no directory entry become members without a login
  (`createUnmatchedMembers`). `newMember` rows are `NEW_MEMBER` with `waivedMonths`.
- A month with a numeric cell → a **CONFIRMED historical `Payment`** at that
  amount; the importer is idempotent (rebuilds a member's imported payments).
- The reconciliation report lists matched / ambiguous / unmatched / created.

Seeding a fresh local DB: `yarn workspace @tfhc/api prisma:seed` (roles, event
types, categories, service schedules, one Super Admin — **no sample members**),
then `import:data --apply`.

## Profile-only update (`import-member-details.cjs`)

Legacy script that **only refreshes profile fields** for members that already
have a linked approved email — it never creates members or accounts.

```sh
node scripts/import-member-details.cjs /path/to/members.csv
node scripts/import-member-details.cjs /path/to/members.csv --apply
```

Required headers: `FirstName,LastName,Email,PhoneNumber,Birthday,Profession`. Birthday values use a day and full English month, such as `14th March`. Blank profession values are saved as empty. The import matches existing approved emails, requires linked member records, and updates profiles in one transaction. It never creates login accounts or changes emails, roles, or approvals. Running it again intentionally replaces the imported fields, including any later member edits. Keep spreadsheet exports outside the repository.

## Profile pictures and account lifecycle

Members can upload, replace, or remove their picture on `/member/profile`. Administrators and leaders can edit personal details, membership status and sub-team assignments, and manage pictures from the directory's **Edit** action. Administrators manage Google approvals separately. Email remains fixed after approval; deactivation preserves records and invalidates member access. Administrator/leader accounts cannot be deactivated using the member-status control.

Photo uploads use multipart field `photo` at `POST /members/me/photo` (self) or `POST /members/:id/photo` (admin/leader); `DELETE` on the same paths removes the photo. The client and API enforce a maximum of 2,097,152 bytes. The API decodes JPEG, PNG and WebP, rejects malformed/animated images and images over 25 megapixels, strips metadata, and produces a WebP thumbnail of at most 512×512. The thumbnail is stored in the existing `profilePhotoUrl` column as a data URL, so no public bucket or persistent disk configuration is needed. Directory responses include the thumbnails; consider separate authenticated image storage if the directory grows substantially.

Validation uses a separate local `tfhc_e2e` database. API tests cover the exact size boundary, excess size, invalid content, ownership, persistence/removal, profile editing and access status. The browser lifecycle test covers admin creation/editing, photo uploads, member self-service, email immutability, deactivation/reactivation and approval revocation/reactivation.

Validation completed for this change: 65 API integration tests, 6 focused profile tests, and 6 desktop/mobile Chromium browser tests passed. API and production web builds completed successfully. Browser Google account provisioning uses a local test fixture; provider claim verification is covered by the API suite with simulated Google responses. Live Google OAuth is not automated.

Browser test command (the smaller connection pool avoids local test-server pool exhaustion):

```sh
TEST_DATABASE_URL='postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e?connection_limit=5&pool_timeout=30' yarn playwright test --project=chromium --project=mobile-web --grep 'user management:|administrator creates and searches a member|admin approves and revokes Google access'
```
