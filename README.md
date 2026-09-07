# TFHC Orderliness Attendance & Participation Tracker

Enterprise-grade attendance accountability, punctuality evaluation, geofencing, dynamic QR code verification, and participation leaderboard platform built with **NestJS**, **Next.js 14**, **PostgreSQL (Prisma ORM)**, and **TypeScript**.

---

## 🌟 Key Features

- **Event-Based Attendance Check-In:** Server-authoritative GPS Haversine distance validation (`Distance <= Radius`) and GPS accuracy threshold checks.
- **Dynamic Signed QR Code Verification:** HMAC-SHA256 time-bound QR code tokens projected at church venues to prevent remote check-in fraud and replay.
- **Automated Time-Based Classification:** Server timestamp evaluation into `EARLY`, `ON_TIME`, `GRACE_PERIOD`, `LATE`, `ABSENT`.
- **Automated Absence Processing:** Idempotent minute-interval Cron job that automatically closes expired meetings, batch-inserts `ABSENT` records for missing active members, and persists an immutable `MeetingSummary`.
- **Participation Leaderboard & Streaks:** Composite rating algorithm `(AttendanceRate * 60%) + (PunctualityRate * 40%) + Points` and streak calculation handling excused absences.
- **Absence Excuses & Corrections:** Member excuse submission workflow with administrative approval and non-erasable `AuditLog` history.
- **Follow-Up Threshold Flags:** Level 1 (2 consecutive absences -> Follow-Up Required), Level 2 (3 overall absences -> Warning), Level 3 (<70% attendance -> Leadership Review) automated scanner.
- **Admin Live Meeting Monitor:** Real-time check-in stats breakdown, live feed, and projected dynamic QR code display screen.
- **Reporting & Excel Export:** One-click Excel `.xlsx` spreadsheet report generation.

---

## 🛠️ Repository Architecture

```text
tfhc-orderliness-web/
├── apps/
│   ├── api/                   # NestJS Backend API (Auth, Members, Meetings, Attendance, Scoring, Jobs)
│   └── web/                   # Next.js 14 mobile-first PWA (Member App & Admin Portal)
├── packages/
│   └── shared/                # Shared Domain Package (Haversine, Classifier, Scoring, Streaks, Enums)
└── docs/                      # Technical Documentation & Production Readiness Quality Reports
```

`apps/web` is the single product surface: an installable, mobile-first PWA
(manifest, icons, service worker, offline fallback) covering both the member
experience and the full admin portal.

> **The native Expo/React Native member app (`apps/member-mobile`) has been
> retired** in favor of this web PWA, which reached full feature parity —
> including the one feature the mobile app had that the web client didn't
> (weekly service availability, now at `/member/availability`) — plus the
> admin portal the mobile app never had. Its Expo push-token registration
> endpoint (`POST /devices/push-token`) was not ported: it only ever
> registered tokens with no code anywhere that sent a push through them, and
> Expo push tokens are meaningless without an Expo client anyway — that
> `apps/api` module is now unused and can be removed in a later pass once
> confirmed nothing still calls it. The removed app's source remains fully
> recoverable from git history (`git log --all -- apps/member-mobile`); see
> [docs/MEMBER_MOBILE_MIGRATION.md](docs/MEMBER_MOBILE_MIGRATION.md) for the
> full history of this decision.

---

## 🚀 Quick Start Instructions

### Prerequisites
- **Node.js**: v22.13+
- **Yarn**: v4.5.3 (via Corepack)
- **PostgreSQL Database**

### Installation

```bash
# 1. Clone repository & install dependencies
corepack enable
yarn install

# 2. Build shared domain package
yarn build:shared

# 3. Setup environment variables & database schema
cp apps/api/.env.example apps/api/.env
yarn db:migrate
yarn db:seed

# 4. Run Development Servers
yarn dev:api   # Runs NestJS API on http://localhost:4000
yarn dev:web   # Runs Next.js Web App on http://localhost:3000
```

### Demo Login Credentials
- **Administrator Email:** `admin@tfhc.org`
- **Password:** `Admin@123456`

---

## ☁️ Deployment (Render)

`render.yaml` at the repo root defines a Blueprint: a managed PostgreSQL
database plus two Docker-runtime web services (`tfhc-orderliness-api`,
`tfhc-orderliness-web`). To deploy:

1. In the Render dashboard, create a new Blueprint from this repository.
2. After the first deploy, note the actual `*.onrender.com` URL Render
   assigned each service. If either differs from the `tfhc-orderliness-api` /
   `tfhc-orderliness-web` names predicted in `render.yaml` (e.g. due to a name
   collision), update `CORS_ORIGIN` on the API service and
   `NEXT_PUBLIC_API_URL` (both the env var and the Docker build arg) on the
   web service, then redeploy the web service so the new value is baked into
   its client bundle.
3. Set `GOOGLE_OAUTH_CLIENT_IDS` on the API service, and
   `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` on the web service (both `sync: false`
   in the blueprint, so both need entering manually in the Render dashboard —
   not something to commit), to the same Web OAuth 2.0 client ID. See
   [docs/GOOGLE_OAUTH_CLIENT_SETUP.md](docs/GOOGLE_OAUTH_CLIENT_SETUP.md) —
   without this, admin login still works but members have no way to sign in.

The web service's `HEALTHCHECK`/`healthCheckPath` and the API's `/health`
endpoint are what both Docker and Render use to confirm each service booted.

---

## 📚 Technical Documentation

- 📋 [Requirements Traceability Matrix](docs/TRACEABILITY.md)
- 🏗️ [Clean Architecture Specification](docs/ARCHITECTURE.md)
- ✅ [Formal Production Readiness Quality Report](docs/PRODUCTION_READINESS.md)

### Automated testing

See [the E2E testing guide](docs/E2E_TESTING.md) for isolated database setup, API integration tests, and desktop/mobile browser tests.
