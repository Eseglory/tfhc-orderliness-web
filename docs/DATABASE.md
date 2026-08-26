# Database & PostgreSQL Architecture Guide — TFHC Orderliness Tracker

## 1. Relational Database Engine

The system uses **PostgreSQL 16** with **Prisma ORM** as the core transactional data engine.

The relational design enforces strict transactional integrity, atomic state transitions, and single check-in invariants.

---

## 2. High-Performance Indexing Strategy

To guarantee sub-second response times across large member datasets and historical attendance records, the PostgreSQL schema includes composite performance indexes:

| Table | Index Fields | Purpose / Optimized Use Case |
|---|---|---|
| `attendance_records` | `@@unique([memberId, meetingId])` | Database-level invariant preventing duplicate check-ins |
| `attendance_records` | `@@index([memberId, status])` | Member performance history & streak calculation queries |
| `attendance_records` | `@@index([meetingId, status])` | Live meeting dashboard breakdown & close-out summaries |
| `attendance_records` | `@@index([actualArrivalTime])` | Time-series trends and punctuality reporting |
| `meetings` | `@@index([status, attendanceOpenTime, attendanceCloseTime])` | Rapid lookup for active attendance window |
| `meetings` | `@@index([startTime])` | Scheduled meeting calendar sorting |
| `members` | `@@index([status, subTeamId])` | Leaderboard filtering & active member expected attendance queries |
| `follow_up_flags` | `@@index([isResolved, flagLevel])` | Leadership follow-up dashboard alerts |
| `audit_logs` | `@@index([actorUserId, createdAt])` | Audit trail security reporting |

---

## 3. PostgreSQL Tuning Configuration (docker-compose)

```ini
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
random_page_cost = 1.1
```

---

## 4. Connection Pooling Strategy

- Database connection string uses `connection_limit=20` per NestJS instance.
- Prevents database connection exhaustion during peak attendance check-in windows.
