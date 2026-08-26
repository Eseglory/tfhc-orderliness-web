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
│   └── web/                   # Next.js 14 Web Application (Member App & Admin Portal)
├── packages/
│   └── shared/                # Shared Domain Package (Haversine, Classifier, Scoring, Streaks, Enums)
└── docs/                      # Technical Documentation & Production Readiness Quality Reports
```

---

## 🚀 Quick Start Instructions

### Prerequisites
- **Node.js**: v20+
- **pnpm**: v11+ (or npm)
- **PostgreSQL Database**

### Installation

```bash
# 1. Clone repository & install dependencies
pnpm install
pnpm approve-builds --all

# 2. Build shared domain package
pnpm build:shared

# 3. Setup environment variables & database schema
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm db:seed

# 4. Run Development Servers
pnpm dev:api   # Runs NestJS API on http://localhost:4000
pnpm dev:web   # Runs Next.js Web App on http://localhost:3000
```

### Demo Login Credentials
- **Administrator Email:** `admin@tfhc.org`
- **Password:** `Admin@123456`

---

## 📚 Technical Documentation

- 📋 [Requirements Traceability Matrix](docs/TRACEABILITY.md)
- 🏗️ [Clean Architecture Specification](docs/ARCHITECTURE.md)
- ✅ [Formal Production Readiness Quality Report](docs/PRODUCTION_READINESS.md)