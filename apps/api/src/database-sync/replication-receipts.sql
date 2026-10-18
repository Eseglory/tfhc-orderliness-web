-- NOT an automatic Prisma migration. Execute only after backup/restore verification
-- and explicit production migration authorization. Contains no application data changes.
BEGIN;
CREATE TABLE public._sqlite_sync_sources (
  source_id text PRIMARY KEY,
  checkpoint bigint NOT NULL DEFAULT 0 CHECK (checkpoint >= 0)
);
CREATE TABLE public._sqlite_sync_receipts (
  source_id text NOT NULL REFERENCES public._sqlite_sync_sources(source_id),
  operation_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  digest text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, operation_id),
  UNIQUE (source_id, sequence)
);
-- No browser/anonymous access. Grant only to the eventual dedicated replication role.
REVOKE ALL ON public._sqlite_sync_sources, public._sqlite_sync_receipts FROM PUBLIC;
ALTER TABLE public._sqlite_sync_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._sqlite_sync_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public._sqlite_recovery_operations (
  source_id text NOT NULL REFERENCES public._sqlite_sync_sources(source_id),
  operation_id text NOT NULL,
  sequence bigint NOT NULL,
  digest text NOT NULL,
  payload text NOT NULL,
  protected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_id,operation_id),
  UNIQUE(source_id,sequence)
);
REVOKE ALL ON public._sqlite_recovery_operations FROM PUBLIC;
ALTER TABLE public._sqlite_recovery_operations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public._sqlite_operational_authority (
  singleton boolean PRIMARY KEY CHECK(singleton), source_id text NOT NULL,
  owner_id text NOT NULL, expires_at timestamptz NOT NULL
);
REVOKE ALL ON public._sqlite_operational_authority FROM PUBLIC;
ALTER TABLE public._sqlite_operational_authority ENABLE ROW LEVEL SECURITY;
COMMIT;
