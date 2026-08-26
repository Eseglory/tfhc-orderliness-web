# Requirements Traceability Matrix — TFHC Orderliness Tracker

| Requirement ID | Module | User Role | Priority | Implementation Location | Test Location | Status |
|---|---|---|---|---|---|---|
| **REQ-AUTH-01** | Authentication | Member / Admin | High | `apps/api/src/modules/auth` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-MEM-01** | Member Profile | Admin | High | `apps/api/src/modules/members` | Tested via API integration | VERIFIED (PASS) |
| **REQ-MTG-01** | Meeting Management | Admin | High | `apps/api/src/modules/meetings` | Tested via API integration | VERIFIED (PASS) |
| **REQ-MTG-02** | Meeting Categories | Admin | High | `apps/api/src/modules/meetings` | Tested via API integration | VERIFIED (PASS) |
| **REQ-MTG-03** | Recurring Meetings | Admin | High | `apps/api/src/modules/meetings` | Tested via API integration | VERIFIED (PASS) |
| **REQ-CHK-01** | Check-In Engine | Member | High | `apps/api/src/modules/attendance` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-GEO-01** | Geofence Validation | Backend | High | `packages/shared/src/haversine.ts` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-QR-01** | Dynamic QR Token | Member / Admin | High | `apps/api/src/modules/meetings` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-CLS-01** | Status Classification | Engine | High | `packages/shared/src/classification.ts` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-ABS-01** | Automated Absences | Background Cron | High | `apps/api/src/jobs/absence-processing.job.ts` | Tested via Job integration | VERIFIED (PASS) |
| **REQ-SCR-01** | Scoring Engine | Engine / Admin | High | `packages/shared/src/scoring.ts` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-MET-01** | Attendance % | Engine | High | `packages/shared/src/scoring.ts` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-MET-02** | Punctuality % | Engine | High | `packages/shared/src/scoring.ts` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-LDB-01** | Leaderboard | Member / Admin | High | `apps/api/src/modules/scoring` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-STR-01** | Attendance Streaks | Engine | High | `packages/shared/src/scoring.ts` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-FLW-01** | Threshold Flags | Admin / Engine | High | `apps/api/src/modules/alerts` | Tested via API integration | VERIFIED (PASS) |
| **REQ-EXC-01** | Absence Excuses | Member / Admin | High | `apps/api/src/modules/excuses` | Tested via API integration | VERIFIED (PASS) |
| **REQ-MAN-01** | Manual Attendance | Admin | High | `apps/api/src/modules/attendance` | Tested via API integration | VERIFIED (PASS) |
| **REQ-COR-01** | Corrections | Member / Admin | High | `apps/api/src/modules/excuses` | Tested via API integration | VERIFIED (PASS) |
| **REQ-LVE-01** | Live Dashboard | Admin | High | `apps/web/src/app/(admin)/admin/live-meeting/[id]` | Tested via Web build | VERIFIED (PASS) |
| **REQ-CLS-02** | Meeting Close-Out | Engine / Admin | High | `apps/api/src/jobs/absence-processing.job.ts` | Tested via Job integration | VERIFIED (PASS) |
| **REQ-REP-01** | Unit Reporting | Admin | High | `apps/api/src/modules/reports` | Tested via API integration | VERIFIED (PASS) |
| **REQ-EXP-01** | Excel Export | Admin | High | `apps/api/src/modules/reports` | Tested via API integration | VERIFIED (PASS) |
| **REQ-AUD-01** | Audit Trail | System / Admin | High | `apps/api/prisma/schema.prisma` | Tested via API integration | VERIFIED (PASS) |
| **REQ-SEC-01** | Fraud Prevention | Engine / API | High | `apps/api/src/modules/attendance` | `packages/shared/src/__tests__/shared.test.ts` | VERIFIED (PASS) |
| **REQ-CFG-01** | System Config | Admin | High | `apps/api/prisma/schema.prisma` | Tested via API integration | VERIFIED (PASS) |
