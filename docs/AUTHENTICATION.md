# Authentication

Two account types, three sign-in paths, one allowlist gate.

## Account types (`User.role`)

| Role | Sign in with | Onboarded by |
|---|---|---|
| `ADMIN` / `LEADER` (staff) | email + password | Super Admin invite (`/admin/team` → emailed token → `/accept-invite`) |
| `MEMBER` | Google **or** email + password | self-registration, once approved |

`User.role` is the coarse account type; fine-grained access is the RBAC layer
(`packages/shared/src/permissions.ts`, `RbacService`).

## The allowlist gate

`ApprovedMember` (the "lookup table") is the single gate for member access.
A member can only sign in — by **either** method — if their email is:

1. present in `ApprovedMember` with `status = ACTIVE`, and
2. linked to a `Member` row whose `status = ACTIVE`.

Admins manage the allowlist from `/admin/members` (directory import, or the
"Google access" control). Revoking the `ApprovedMember` row cuts access
immediately — `jwt.strategy` re-checks it on every request for members that
have `googleSubject` or `passwordAuthEnabled`.

## Password lifecycle (`/auth/*`)

| Route | Auth | Notes |
|---|---|---|
| `POST /register` | public | Body `{ email, password, firstName, lastName, phoneNumber }`. 403 `EMAIL_NOT_APPROVED` if not on the allowlist. A Google-only account is upgraded in place. Returns `{ pendingVerification: true }` — **no session**. |
| `POST /verify-email` | public | `{ token }` (24 h TTL). Sets `emailVerifiedAt`, returns `{ user, accessToken }`. |
| `POST /resend-verification` | public | `{ email }` → always `{ ok: true }`. |
| `POST /forgot-password` | public | `{ email }` → always `{ ok: true }`. Link TTL 1 h. |
| `POST /reset-password` | public | `{ token, password }` → sets hash, verifies email, returns a session. |
| `POST /change-password` | bearer | `{ currentPassword, newPassword }` → returns a fresh `accessToken`. |
| `POST /login` | public | 403 `MEMBER_GOOGLE_AUTH_REQUIRED` (Google-only member), `EMAIL_VERIFICATION_PENDING` (unverified), `ACCOUNT_DEACTIVATED`, `INVITE_PENDING`. |
| `POST /logout` | bearer | Stamps `lastLogoutAt`. Sessions are stateless — the client drops the token. |
| `POST /google/member` | public | Google ID token → session (unchanged). |
| `POST /accept-invite` | public | Staff invite token → password → session. |

Passwords: min 12 characters (`MIN_PASSWORD_LENGTH`), argon2id hashed.

## Session invalidation

JWTs are stateless, 7-day expiry. `User.passwordChangedAt` is stamped on every
reset / change; `jwt.strategy` rejects any token whose `iat` (whole seconds)
is older than `floor(passwordChangedAt / 1000)`. Effect: changing your password
signs out every other device; the caller keeps working via the fresh token
returned by `change-password` / `reset-password`.

## Email delivery

`MailService` (SMTP, `apps/api/.env`). When delivery fails **and**
`NODE_ENV !== 'production'`, `register` / `forgot-password` /
`resend-verification` return the link in the response body (`verifyUrl` /
`devUrl`) so local dev and the e2e suite work without a mail server. A stalled
SMTP handshake is capped at 8 s (`common/settle-within.ts`).

## Config

| Var | Purpose |
|---|---|
| `JWT_SECRET` | token signing (required) |
| `APP_WEB_URL` | base URL for links in emails; falls back to first `CORS_ORIGIN`, then `http://localhost:3000` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_PORT` | mail delivery |
| `GOOGLE_OAUTH_CLIENT_IDS` | accepted Google token audiences (comma-separated) |
| `NODE_ENV` | `production` disables the dev link fallback |

## Activeness prompts (web)

`components/activeness/`, mounted by `(member)/layout.tsx` (all three) and
`(admin)/layout.tsx` (idle only):

- **IdleTimeoutModal** — 28 min idle → 2 min countdown modal → sign-out. Test
  seam: `window.__IDLE_WARNING_MS__`.
- **EngagementNudge** — shows when ≥2 of the member's last 5 services are
  `ABSENT`; dismissed for the ISO week (`localStorage`).
- **ProfileCompletionReminder** — shows while phone / DOB / gender / address /
  photo are blank; dismissed for the session (`sessionStorage`).
