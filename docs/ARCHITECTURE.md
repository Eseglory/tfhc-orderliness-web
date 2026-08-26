# Architecture Documentation — TFHC Orderliness Tracker

## 1. Clean Architecture & Layer Separation

The application adheres strictly to Clean Architecture principles, establishing clear boundary directions:

```text
┌─────────────────────────────────────────────────────────┐
│                      PRESENTATION                       │
│     (Next.js Web Pages, NestJS Controllers, DTOs)       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                      APPLICATION                        │
│         (Use Cases, Services, Cron Jobs, Auth)          │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                         DOMAIN                          │
│     (Haversine Geofence, Time Classifier, Scoring,      │
│      Percentages, Leaderboard Formula, Streaks)         │
└────────────────────────────▲────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────┐
│                      INFRASTRUCTURE                     │
│    (PostgreSQL Database, Prisma ORM, JWT, Argon2)       │
└─────────────────────────────────────────────────────────┘
```

### Domain Layer (`packages/shared`)
The domain layer owns all pure business rules:
- **`haversine.ts`**: Great-circle geographic distance calculation (`Distance <= Radius`) and GPS accuracy threshold verification.
- **`classification.ts`**: Pure function evaluating server-authoritative timestamps into `EARLY`, `ON_TIME`, `GRACE_PERIOD`, `LATE`, `ABSENT`.
- **`scoring.ts`**: Calculation of point rubrics, meeting weight multipliers, Attendance Rate %, Punctuality Rate %, Composite Leaderboard Score `(AttendanceRate * 60%) + (PunctualityRate * 40%) + Points`, and Streak algorithm handling excused absences.

### Application Layer (`apps/api/src/modules` & `jobs`)
The application layer coordinates workflows:
- `CheckInMember`: Validates member status, active meeting window, Haversine geofence, dynamic HMAC QR token, calculates authoritative status/points, and persists attendance atomically.
- `AbsenceProcessingJob`: Automated cron worker executing minute-interval atomic meeting close-out, batch absence creation for missing active members, and immutable summary generation.
- `ReviewExcuse` / `ReviewCorrection`: Workflow coordinating administrative approval, attendance state updates, and append-only audit trail logging.

### Infrastructure Layer (`apps/api/src/prisma`)
- Prisma ORM accessing PostgreSQL database.
- Enforces `@@unique([memberId, meetingId])` database constraint to guarantee single check-in invariant.
- Argon2 password hashing and HMAC-SHA256 signature generation.

---

## 2. SOLID & DRY Enforcement

- **Single Responsibility Principle (SRP):** Each module (`auth`, `members`, `meetings`, `attendance`, `scoring`, `excuses`, `alerts`, `reports`) owns one distinct domain concept.
- **Open/Closed Principle (OCP):** Scoring rubrics and meeting weight multipliers are versionable and configurable without code modification.
- **Dependency Inversion (DIP):** Shared domain logic is decoupled from HTTP controllers and database engines.
- **Don't Repeat Yourself (DRY):** All time classification rules, distance formulas, and scoring metrics are centralized in `@tfhc/shared`.
