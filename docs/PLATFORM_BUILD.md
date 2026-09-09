# TFHC Orderliness → Church Management Platform — Build Log

Living record of the platform expansion. Each phase is built end-to-end
(DB → API → RBAC → UI → tests) and this file is updated with real results only.

## Scope context

The existing product is the **TFHC Orderliness Attendance & Participation Tracker**
(GPS check-in, meetings/recurring services, scoring/leaderboard, absence excuses,
corrections, follow-up flags, weekly availability, member PWA + admin web).

The target is a general **church-management platform**: granular RBAC + admin team,
a general Event system, lookup management, expenses, monthly dues, payments, a
multi-level approval engine, welfare requests, real-time chat, notifications,
email templates, audit logging, analytics.

Sequencing agreed with product: **stabilise first, then RBAC foundation**, then the
larger modules. Work happens directly on `main`. Finance/comms specifics
(dues spreadsheets, payment account, SMS/WhatsApp provider) are pending inputs —
those modules are built configurable and validated against the checklist.

## Environments

| Purpose | URL | Notes |
|---|---|---|
| Local dev DB | `postgresql://tfhc_user:***@localhost:54399/tfhc_orderliness_db` | Docker `tfhc_postgres_db`. Schema up to date. |
| E2E DB | `postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e` | Docker `tfhc-orderliness-e2e-db-1`. Pass as `TEST_DATABASE_URL`. |
| **Prod (Supabase)** | in `apps/api/.env` `DATABASE_URL` | **Never run migrate dev / reset / seed against this.** |

Commands: unit `yarn workspace @tfhc/api test`; integration
`TEST_DATABASE_URL=… DISABLE_SCHEDULED_JOBS=true yarn workspace @tfhc/api test:e2e`;
web `yarn workspace @tfhc/web build`.

---

## Phase 0 — Stabilise (DONE 2026-09-09)

Baseline before any new feature work.

| Check | Result |
|---|---|
| `@tfhc/shared` build | PASS |
| `@tfhc/api` build (tsc) | PASS |
| `@tfhc/api` lint | PASS (fixed 7 pre-existing errors in uncommitted WIP) |
| `@tfhc/api` unit tests | 19/19 PASS (fixed 1 pre-existing failure) |
| `@tfhc/api` integration tests | 71/71 PASS (on a clean e2e DB) |
| `@tfhc/web` build | PASS (26 routes) |
| `@tfhc/web` lint | PASS (warnings only: `<img>` usage ×3, one exhaustive-deps) |

Fixes applied:
- `test/recurring-services.spec.ts` — reminder test mock was missing
  `memberNotification` and `approvedMember.memberId`, so the send path threw and
  the assertion (`{ sent: 1 }`) failed. Mock completed.
- Lint: removed unused `DEFAULT_UNIT_POLICY` imports (alerts/attendance/excuses
  services); `require`-typed `sharp` with a scoped eslint-disable + call-signature
  type (sharp 0.35 is CJS, repo has `esModuleInterop` off); dropped a redundant
  `qrSecret: null` from the recurring-service meeting projection and the matching
  destructure; `let`→`const` in an e2e spec.

Known pre-existing fragilities (not regressions, tracked for later phases):
- The shared e2e DB accumulates data across runs (specs use unique run-ids, never
  truncate). `leaderboard date filters` assertion is order/limit-sensitive under a
  polluted DB. Reset with `prisma migrate reset --skip-seed --force` on the e2e DB.
- e2e specs each boot a full Nest app against one Postgres; on a CPU-saturated
  host (Docker VM + parallel builds) interactive transactions blow their 5s
  budget and cascade failures. Run suites individually, or on a quiet machine.
  A hardening pass on Prisma pool sizing / transaction timeouts is a later task.
- The ~15 gaps in `docs/REQUIREMENTS_AUDIT_2026-09-09.md` (attendance-% policy
  inconsistency across views, follow-up flags not auto-evaluated, no correction
  review UI, export capped at 1000 rows, decorative leaderboard filters, …).

---

## Phase 1 — RBAC foundation + Admin Team (DONE 2026-09-09)

Granular, centrally-enforced permissions; custom roles; admin team management;
audit trail. Everything later builds on this.

### Design — additive RBAC layer

`User.role` (`ADMIN`/`LEADER`/`MEMBER`) stays as the coarse **account type** that
gates member-vs-staff auth flows. A permission layer sits on top:

- **Permission catalogue** — `packages/shared/src/permissions.ts`. ~56 fixed
  permission strings (`members.create`, `expenses.approve`, …) grouped for the UI,
  plus `SYSTEM_ROLE_DEFINITIONS` (the default grants for the 3 system roles) and
  `LEGACY_ROLE_FALLBACK`. Single source of truth; helpers `expandPermissions`
  (resolves `*`), `hasAllPermissions`.
- **Schema** (`20260909130000_rbac_foundation`): `access_roles`,
  `access_role_permissions`, `user_access_roles` (many-to-many, `assignedById`),
  plus staff-lifecycle columns on `users` (`isActive`, `deactivatedAt/ById`,
  `invitedAt/ById`, `inviteTokenHash` unique, `inviteExpiresAt`,
  `inviteAcceptedAt`, `lastLoginAt`). Migration seeds the 3 system roles, grants
  `SUPER_ADMIN` the `*` wildcard, and **backfills** `ADMIN → SUPER_ADMIN`,
  `LEADER → ADMINISTRATION` grants so existing accounts keep working.
- **`RbacService`** (`common/rbac/`, `@Global`): `resolveAccess(userId, legacyRole)`
  → `{ roleKeys, permissions, isSuperAdmin }`, called per-request by the JWT
  strategy (revocation is immediate). `syncSystemRoles()` on boot — SUPER_ADMIN
  is always exactly `*`; ADMINISTRATION/FINANCE get code defaults only on first
  init, then a Super Admin may tailor them. Shared with the seed via
  `common/rbac/sync-system-roles.ts`.
- **Enforcement** — `@RequirePermissions('a','b')` (AND semantics) +
  `PermissionsGuard`, reading `req.user.permissions`. Legacy `@Roles`/`RolesGuard`
  left intact; existing controllers migrate module-by-module as later phases
  touch them. `jwt.strategy` also blocks deactivated staff and pending invites.
- **`AuditService`** (`common/rbac/audit.service.ts`) — `record()` (best-effort,
  logs failures loudly) and `recordWithin(tx)`. `AuditLog.actorUserId` is
  `Restrict` — an admin with history can't be hard-deleted (deactivate instead).

### API

| Method | Route | Permission |
|---|---|---|
| GET | `/access-roles` | `roles.read` |
| GET | `/access-roles/permissions` | `roles.read` |
| POST | `/access-roles` | `roles.create` |
| PATCH | `/access-roles/:id` | `roles.update` (SUPER_ADMIN role rejected) |
| DELETE | `/access-roles/:id` | `roles.delete` (system / still-assigned rejected) |
| GET | `/admin/team` | `users.read` |
| POST | `/admin/team` | `users.create` (invite: creates staff User+Member, one-time token, branded email; returns `inviteUrl` when SMTP down) |
| POST | `/admin/team/:id/resend-invite` | `users.create` |
| PATCH | `/admin/team/:id` | `users.update` (name/phone/roles; last-Super-Admin lock) |
| POST | `/admin/team/:id/deactivate` \| `/reactivate` | `users.deactivate` (self / last-Super-Admin refused) |
| POST | `/auth/accept-invite` | public — token + password → activates, returns JWT |
| GET | `/audit-logs` | `audit.read` (cursor paginated, `entity`/`action`/`actor` filters) |

`/auth/login` and `/auth/me` now return `accessRoles`, `permissions`,
`isSuperAdmin`; login rejects deactivated / invite-pending staff and stamps
`lastLoginAt`.

### Web

- `lib/auth.tsx` — `AuthProvider` + `useAuth()` (`user`, `can(...)`, `canAny(...)`);
  safe outside a provider. Wired via new `(admin)/layout.tsx`.
- `components/ui.tsx` — shared kit: `Button`, `Modal`, `ConfirmDialog`,
  `ToastProvider`/`useToast`, `Field`, `Badge`, `PageHeader`, `EmptyState`,
  `Spinner`. Stitch design tokens (navy/gold, light).
- Pages: `/admin/administration/team`, `/admin/administration/roles` (permission
  matrix editor), `/admin/audit`, `/accept-invite`.
- `Navbar` rewritten data-driven with permission-gated items + an Administration
  dropdown (desktop) / scrollable sub-row (mobile).
- `apps/web/tsconfig.json` `target` `es5 → es2017` (Set/Map iteration in tsc).

### Verification (2026-09-09, local)

| Check | Result |
|---|---|
| `@tfhc/shared` build + test | PASS · 15/15 |
| `@tfhc/api` build + lint | PASS |
| `@tfhc/api` unit tests | 28/28 (added `test/rbac.spec.ts`, +9) |
| `@tfhc/api` integration tests | 80/80 — `application` 70/70, `recurring-services` 1/1, `rbac` 9/9 (new). Green when run per-suite or as a batch on an unloaded machine; the shared e2e Postgres hits `P2024`/`P2028` transaction timeouts when the host CPU is saturated by other work — environmental, not a regression. |
| `@tfhc/web` build + lint | PASS (same 4 pre-existing warnings) |
| Browser smoke (Playwright, super admin) | login → roles (create custom role, permission matrix) → team (invite → fallback link) → accept-invite → audit log; desktop + 390px mobile. PASS |

RBAC e2e covers: system-role sync/defaults, `roles.*` gating (Administration &
Finance both 403 on `/access-roles`), custom role CRUD + unknown-permission
rejection, SUPER_ADMIN role immutable, invite→accept→permission-scoped→deactivate
(session dies immediately)→reactivate, self-deactivation refused, last-Super-Admin
lock, `audit.read` gating.

### Follow-ups deferred

- Invite email is sent inline with an 8s cap + shareable-link fallback; move to
  the async notification queue in the notifications phase.
- Existing controllers still use `@Roles(enum)`; migrate to `@RequirePermissions`
  as each module is reworked (Events done; Finance, …).
- Dark-slate admin pages (dashboard, members, follow-up, reports, live-meeting,
  services, settings) not yet restyled to the Stitch token system.

---

## Phase 2 — Event system

### 2a — Event types, visibility & lookup management (DONE 2026-09-09)

**Recurrence engine** — `packages/shared/src/recurrence.ts`: pure `expandRecurrence`
(DAILY/WEEKLY/MONTHLY/YEARLY, `interval`, `byWeekday`, `byMonthday`, `bySetPos`
nth-weekday, `count`, `until`) working in a single zone's wall-clock time via a
`zoneOffsetMinutes` seam (Lagos = 60, exact). `describeRecurrence` for UI. 12 unit
tests covering every master-prompt scenario. **Wired into series generation in 2b.**

**Schema** (`20260909140000_event_types_visibility`):
- `event_types` — key/name/icon/colour/`defaultCompulsory`/`isSystem`/`active`/`sortOrder`;
  11 defaults seeded (Service, Meeting, Training, Prayer, Bible Study, Special
  Service, Outreach, Wedding, Funeral, Celebration, Other)
- `event_audiences` — `{ meetingId, scope?(ALL_MEMBERS|EXECUTIVES|ADMINS), memberId?, subTeamId? }`
- `event_invitations` — `{ meetingId, memberId, status }` (INVITED/ACCEPTED/DECLINED/TENTATIVE/NO_RESPONSE)
- `meetings` +`eventTypeId`, `visibility` (PUBLIC/RESTRICTED), `allDay`, `address`,
  `organizerName`, `coverImageUrl`, `notes`, `cancelReason`, `archivedAt`, `createdById`
- `meeting_categories`/`sub_teams` +`isSystem`/`active`
- backfills `meetings.eventTypeId` from the legacy category name; marks core rows `isSystem`

**Visibility** — `common/event-visibility.ts`: `canViewEvent()` + `visibilityWhere()`
Prisma fragment. RESTRICTED events are invisible to members outside the audience in
list / detail / calendar / RSVP, and **check-in is refused** (enforced in
`attendance.service`). Staff always see everything. 6 unit tests.

**API**:
| Route | Permission |
|---|---|
| `GET /meetings/event-types` | any authenticated |
| `GET /meetings/calendar?from&to` | any authenticated (visibility-filtered) |
| `GET /meetings` \| `/meetings/:id` | any authenticated (visibility-filtered; `search`, `eventTypeId`, `from`/`to`, `includeArchived`) |
| `POST /meetings` \| `/meetings/recurring` | `events.create` (audiences, event type default-compulsory) |
| `PATCH /meetings/:id` | `events.update` (CLOSED/CANCELLED rejected) |
| `POST /meetings/:id/duplicate` | `events.create` |
| `POST /meetings/:id/cancel` | `events.cancel` |
| `POST` \| `DELETE /meetings/:id/archive` | `events.update` |
| `GET/POST/PATCH/DELETE /lookups/:kind` | `lookups.read` / `lookups.manage` — `event-types`, `meeting-categories`, `sub-teams`; system rows deactivate-only, in-use rows undeletable |

Meetings controller migrated `@Roles` → `@RequirePermissions`. All event mutations
write audit entries.

**Web**:
- `components/EventForm.tsx` — full create/edit modal (type, category, all-day,
  4 time fields, venue+geofence, grace/weight/compulsory, visibility + audience
  picker for scopes/sub-teams/members, organiser, notes)
- `/admin/meetings` rebuilt on the UI kit: filters, event-type colour badges,
  restricted badge, row actions (monitor/open-close/edit/duplicate/cancel/archive)
- `/admin/calendar` — month grid + agenda view, prev/next/today, day/event detail
- `/admin/administration/lookups` — tabbed lookup admin (Event Types / Scoring
  Categories / Sub-teams)
- Navbar: **Events** dropdown (Calendar / All Events / Recurring / Event Types),
  generalised multi-dropdown support

**Verification (2026-09-09, local)**:
| Check | Result |
|---|---|
| shared build + test | PASS · 27/27 (recurrence +12) |
| api build + lint | PASS |
| api unit tests | 34/34 (event-visibility +6) |
| api integration tests | 87/87 (events.e2e +7) — full suite green in one run |
| web build + lint | PASS |
| Browser smoke (Playwright) | login → lookups (create/delete type) → events (create RESTRICTED event w/ audience) → calendar (month + day detail) → cancel + archive. PASS |

`events.e2e` covers: 11 default types, lookup gating + system/in-use protection,
public vs restricted creation (restricted needs an audience), restricted events
hidden from outsiders in list/detail/calendar/RSVP, outsider check-in refused,
update/duplicate/cancel/archive, no editing CLOSED.

### 2b — Generalised recurrence series + occurrence exceptions + event dashboard (NEXT)

Refactor `ServiceSchedule` → `EventSeries` (per-series location/audience/recurrence
using the 2a engine); occurrence exceptions (cancel one / edit this / edit this &
future / edit series); event dashboard with real charts.
