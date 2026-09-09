# Import datasets

Transcribed from the church spreadsheets (member directory + monthly-dues
matrix). **These are a best-effort transcription from screenshots** — the
authoritative source is the Google Sheet. Re-run the importers with a fresh CSV
export whenever the sheet changes.

- `member-directory.json` — sheet 2 (`FirstName,LastName,Email,PhoneNumber,Birthday,Profession`).
  Each entry becomes a `Member` + `ApprovedMember` (Google login allow-list),
  matched/linked by **normalised email**.
- `dues-matrix-2025.json` — sheet 1 (`NAMES` × `JANUARY…DECEMBER`).
  Rows are matched to members by **name** (order-independent fuzzy match, then
  resolved to the directory email → the real `Member`). A cell with a number
  means that month was **paid** at that amount; a red cell means **unpaid**;
  orange rows are members who joined mid-year (`joinedMonth`).

## How to apply

```sh
# dry run — prints the reconciliation report
node scripts/import-directory-and-dues.cjs

# apply to the DATABASE_URL in apps/api/.env
node scripts/import-directory-and-dues.cjs --apply
```

The API also exposes `POST /members/import` (`members.create`) and
`POST /finance/dues/import` (`dues.create`) taking the same JSON shapes, so an
administrator can run the sync from the app once a UI is wired.

## Fields to verify against the source sheet

- Exact month a "red" (unpaid) block starts for partial-year payers.
- Surname variants where a person appears under a maiden and married name
  (e.g. *Vivian Amadi* / *Vivian Ekwugha*, *Loveth Ubabuike* / *Ukabuike Loveth*).
- Directory rows with truncated emails in the screenshot were completed to
  `@gmail.com`; confirm.
- "Somtochukwu" (directory row 19) has no email in the sheet and is skipped.
