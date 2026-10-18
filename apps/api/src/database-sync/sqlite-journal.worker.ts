/** Self-contained: serialized into a worker, so no imports/outer scope references. */
export function sqliteJournalWorker() {
  const { parentPort, workerData } = require('node:worker_threads');
  const { DatabaseSync } = require('node:sqlite');
  const { createHash, randomUUID } = require('node:crypto');
  const fs = require('node:fs');
  let db: any;
  let activeOperation: string | null = null;
  const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
  const literal = (value: string) => "'" + value.replace(/'/g, "''") + "'";
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const transaction = (work: () => any) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const integrity = (connection: any) => {
    const checks = connection.prepare('PRAGMA integrity_check').all();
    if (checks.length !== 1 || checks[0].integrity_check !== 'ok' ||
        connection.prepare('PRAGMA foreign_key_check').all().length) throw new Error('INTEGRITY_FAILED');
  };
  const handlers: Record<string, (args: any) => any> = {
    open: () => {
      // Opening a missing production database must never silently create an empty authority.
      if (!fs.existsSync(workerData.path)) throw new Error('DATABASE_NOT_INITIALIZED');
      db = new DatabaseSync(workerData.path);
      // Avoid the WAL-reset race in the SQLite versions bundled by our engines.
      db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;');
      integrity(db);
      const schemaRows = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_sync\\_%' ESCAPE '\\' ORDER BY type,name").all();
      const schemaDigest = digest(JSON.stringify(schemaRows));
      if (workerData.expectedSchemaSql) {
        const expected = new DatabaseSync(':memory:');
        try {
          expected.exec(workerData.expectedSchemaSql);
          const expectedRows = expected.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
          if (digest(JSON.stringify(expectedRows)) !== schemaDigest) throw new Error('SCHEMA_REVALIDATION_REQUIRED');
        } finally { expected.close(); }
      }
      const initialized = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='_sync_meta'").get();
      if (initialized) {
        const metadata = db.prepare('SELECT * FROM _sync_meta WHERE singleton=1').get();
        if (!metadata || metadata.version !== 3 || metadata.schema_digest !== schemaDigest) throw new Error('SCHEMA_REVALIDATION_REQUIRED');
      } else {
        // Verify a restorable pre-change snapshot BEFORE installing journal tables/triggers.
        // Existing files are never overwritten. This is not an independent offsite backup.
        const backup = handlers.backup({ destination: workerData.path + '.before-journal-' + randomUUID() + '.db' });
        if (!backup.bytes) throw new Error('INTEGRITY_FAILED');
      }
      db.function('sync_operation_id', () => {
        if (!activeOperation) throw new Error('WRITE_REQUIRES_OPERATION');
        return activeOperation;
      });
      // Schema setup is additive, transactional, and does not touch application records.
      transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS _sync_meta (
            singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL,
            source_id TEXT NOT NULL UNIQUE, schema_digest TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS _sync_context(singleton INTEGER PRIMARY KEY CHECK(singleton=1),operation_id TEXT);
          INSERT OR IGNORE INTO _sync_context(singleton,operation_id) VALUES(1,NULL);
          CREATE TABLE IF NOT EXISTS _sync_operations (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL UNIQUE,
            request_digest TEXT NOT NULL, digest TEXT, created_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPLIED','CONFLICT')),
            attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
            error_code TEXT, applied_at TEXT, protected_at TEXT,
            request_key TEXT UNIQUE, request_hash TEXT, request_result BLOB
          );
          CREATE TABLE IF NOT EXISTS _sync_changes (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL
              REFERENCES _sync_operations(operation_id), table_name TEXT NOT NULL,
            before_json TEXT, after_json TEXT
          );
          CREATE INDEX IF NOT EXISTS _sync_changes_operation ON _sync_changes(operation_id, sequence);
          CREATE INDEX IF NOT EXISTS _sync_pending ON _sync_operations(status, sequence);
        `);
        if (!initialized) db.prepare('INSERT INTO _sync_meta(singleton,version,source_id,schema_digest) VALUES(1,3,?,?)').run(randomUUID(), schemaDigest);
        const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_sync\\_%' ESCAPE '\\' ORDER BY name").all();
        if (!tables.length) throw new Error('NO_OPERATIONAL_TABLES');
        for (const { name } of tables) {
          const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all();
          if (!columns.some((column: any) => column.pk)) throw new Error('PRIMARY_KEY_REQUIRED');
          const row = (prefix: string) => 'json_object(' + columns.map((column: any) => {
            const ref = prefix + '.' + quote(column.name);
            return literal(column.name) + `,CASE WHEN typeof(${ref})='blob' THEN json_object('$bytes',hex(${ref})) ELSE ${ref} END`;
          }).join(',') + ')';
          for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
            const trigger = '_sync_capture_' + digest(name).slice(0, 24) + '_' + event;
            db.exec(`CREATE TRIGGER IF NOT EXISTS ${quote(trigger)} AFTER ${event} ON ${quote(name)} BEGIN
              SELECT CASE WHEN (SELECT operation_id FROM _sync_context WHERE singleton=1) IS NULL THEN RAISE(ABORT,'WRITE_REQUIRES_OPERATION') END;
              INSERT INTO _sync_operations(operation_id,request_digest,created_at)
                SELECT operation_id,'prisma-transaction',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM _sync_context WHERE singleton=1
                AND NOT EXISTS(SELECT 1 FROM _sync_operations WHERE operation_id=(SELECT operation_id FROM _sync_context WHERE singleton=1));
              INSERT INTO _sync_changes(operation_id,table_name,before_json,after_json)
              VALUES((SELECT operation_id FROM _sync_context WHERE singleton=1),${literal(name)},${event === 'INSERT' ? 'NULL' : row('OLD')},${event === 'DELETE' ? 'NULL' : row('NEW')}); END;`);
          }
        }
      });
      return { ready: true, sourceId: db.prepare('SELECT source_id FROM _sync_meta WHERE singleton=1').get().source_id };
    },
    commit: ({ operationId, statements }: any) => {
      if (typeof operationId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(operationId) ||
          !Array.isArray(statements) || !statements.length || statements.length > 500) throw new Error('INVALID_OPERATION');
      // Only internal application DML. Deny DDL, transaction control, journal access,
      // and multiple statements. Schema/bootstrap work belongs to a separate offline tool.
      for (const statement of statements) {
        if (typeof statement.sql !== 'string' || !/^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+/i.test(statement.sql) ||
            /;|--|\/\*|_sync_|\bsqlite_/i.test(statement.sql)) throw new Error('INVALID_STATEMENT');
      }
      const requestDigest = digest(JSON.stringify(statements));
      if (Buffer.byteLength(JSON.stringify(statements)) > 16 * 1024 * 1024) throw new Error('OPERATION_TOO_LARGE');
      return transaction(() => {
        const existing = db.prepare('SELECT request_digest,sequence FROM _sync_operations WHERE operation_id=?').get(operationId);
        if (existing) {
          if (existing.request_digest !== requestDigest) throw new Error('OPERATION_ID_REUSED');
          return { sequence: existing.sequence, duplicate: true };
        }
        db.prepare('INSERT INTO _sync_operations(operation_id,request_digest,created_at) VALUES(?,?,?)')
          .run(operationId, requestDigest, new Date().toISOString());
        activeOperation = operationId;
        db.prepare('UPDATE _sync_context SET operation_id=? WHERE singleton=1').run(operationId);
        try {
          for (const statement of statements) {
            const result = db.prepare(statement.sql).run(...(statement.params || []));
            if (statement.expectedChanges !== undefined && Number(result.changes) !== statement.expectedChanges)
              throw new Error('LOCAL_WRITE_CONFLICT');
          }
        } finally { activeOperation = null; db.prepare('UPDATE _sync_context SET operation_id=NULL WHERE singleton=1').run(); }
        const changes = readChanges(operationId);
        if (!changes.length) throw new Error('EMPTY_OPERATION');
        if (changes.length > 10000 || Buffer.byteLength(JSON.stringify(changes)) > 32 * 1024 * 1024) throw new Error('OPERATION_TOO_LARGE');
        db.prepare('UPDATE _sync_operations SET digest=? WHERE operation_id=?').run(digest(JSON.stringify(changes)), operationId);
        return { sequence: db.prepare('SELECT sequence FROM _sync_operations WHERE operation_id=?').get(operationId).sequence, duplicate: false };
      });
    },
    restoreHistory: ({ sourceId, operations }: any) => transaction(() => {
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sourceId) || !Array.isArray(operations) ||
          db.prepare('SELECT count(*) count FROM _sync_operations').get().count) throw new Error('INVALID_OPERATION');
      let sequence = 0;
      for (const operation of operations) {
        if (operation.sequence !== ++sequence || digest(JSON.stringify(operation.changes)) !== operation.digest) throw new Error('CHECKPOINT_MISMATCH');
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO _sync_operations(sequence,operation_id,request_digest,digest,created_at,status,applied_at,protected_at,request_key,request_hash,request_result)
          VALUES(?,?,?,?,?,'APPLIED',?,?,?,?,?)`).run(sequence, operation.operationId, operation.digest, operation.digest, now, now, now,
          operation.request?.key || null, operation.request?.hash || null, operation.request ? Buffer.from(operation.request.result, 'base64') : null);
        for (const change of operation.changes) db.prepare('INSERT INTO _sync_changes(operation_id,table_name,before_json,after_json) VALUES(?,?,?,?)')
          .run(operation.operationId, change.table, change.before === null ? null : JSON.stringify(change.before), change.after === null ? null : JSON.stringify(change.after));
      }
      db.prepare('UPDATE _sync_meta SET source_id=? WHERE singleton=1').run(sourceId);
    }),
    next: ({ now }: any) => {
      // A conflict blocks dependent operations; never skip ahead and break FK/order semantics.
      const row = db.prepare("SELECT * FROM _sync_operations WHERE status!='APPLIED' ORDER BY sequence LIMIT 1").get();
      if (!row || row.status === 'CONFLICT' || row.retry_at > now) return null;
      return asOperation(row);
    },
    unprotected: () => db.prepare('SELECT * FROM _sync_operations WHERE protected_at IS NULL ORDER BY sequence LIMIT 50').all().map(asOperation),
    protected: ({ operationId, digest: expected }: any) => {
      const result = db.prepare('UPDATE _sync_operations SET protected_at=? WHERE operation_id=? AND digest=?').run(new Date().toISOString(), operationId, expected);
      if (!result.changes) throw new Error('CHECKPOINT_MISMATCH');
    },
    applied: ({ operationId, digest: expected }: any) => {
      const existing = db.prepare('SELECT status,digest FROM _sync_operations WHERE operation_id=?').get(operationId);
      if (existing?.status === 'APPLIED' && existing.digest === expected) return;
      const head = db.prepare("SELECT operation_id FROM _sync_operations WHERE status!='APPLIED' ORDER BY sequence LIMIT 1").get();
      if (!head || head.operation_id !== operationId) throw new Error('CHECKPOINT_MISMATCH');
      const result = db.prepare("UPDATE _sync_operations SET status='APPLIED',applied_at=?,error_code=NULL WHERE operation_id=? AND digest=? AND status='PENDING'")
        .run(new Date().toISOString(), operationId, expected);
      if (!result.changes) throw new Error('CHECKPOINT_MISMATCH');
    },
    failed: ({ operationId, conflict, now }: any) => {
      const row = db.prepare("SELECT attempts FROM _sync_operations WHERE operation_id=? AND status='PENDING'").get(operationId);
      if (!row) throw new Error('OPERATION_NOT_PENDING');
      const backoff = Math.min(86400000, 30000 * 2 ** Math.min(row.attempts, 12));
      db.prepare('UPDATE _sync_operations SET status=?,attempts=attempts+1,retry_at=?,error_code=? WHERE operation_id=?')
        .run(conflict ? 'CONFLICT' : 'PENDING', now + backoff, conflict ? 'CONFLICT' : 'DESTINATION_UNAVAILABLE', operationId);
    },
    retry: ({ operationId }: any) => {
      // Does not discard evidence or change payloads. Destination comparison still applies.
      db.prepare("UPDATE _sync_operations SET status='PENDING',retry_at=0 WHERE operation_id=? AND status!='APPLIED'").run(operationId);
    },
    status: () => {
      const row = db.prepare(`SELECT
        COALESCE(SUM(status='PENDING'),0) pending, COALESCE(SUM(status='CONFLICT'),0) conflicts,
        COALESCE(SUM(protected_at IS NULL),0) unprotected,
        COALESCE(MAX(CASE WHEN status='APPLIED' THEN sequence END),0) checkpoint,
        MIN(CASE WHEN status!='APPLIED' THEN created_at END) oldestPendingAt,
        MAX(applied_at) lastSuccessAt FROM _sync_operations`).get();
      return { ...row };
    },
    backup: ({ destination }: any) => {
      if (fs.existsSync(destination)) throw new Error('BACKUP_ALREADY_EXISTS');
      // Reserve an empty private file atomically before any sensitive bytes are
      // written. SQLite permits VACUUM INTO an existing zero-length file.
      const reserved = fs.openSync(destination, 'wx', 0o600);
      fs.closeSync(reserved);
      // VACUUM INTO produces a consistent standalone snapshot, including committed WAL data.
      db.prepare('VACUUM INTO ?').run(destination);
      fs.chmodSync(destination, 0o600);
      const handle = fs.openSync(destination, 'r+');
      try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
      const copy = new DatabaseSync(destination, { readOnly: true });
      try { integrity(copy); } finally { copy.close(); }
      const hash = createHash('sha256');
      const input = fs.openSync(destination, 'r');
      try {
        const chunk = Buffer.alloc(1024 * 1024);
        let count: number;
        while ((count = fs.readSync(input, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, count));
      } finally { fs.closeSync(input); }
      if (process.platform !== 'win32') {
        const directory = fs.openSync(require('node:path').dirname(destination), 'r');
        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      }
      return { sha256: hash.digest('hex'), bytes: fs.statSync(destination).size };
    },
    close: () => { db?.close(); db = null; },
  };
  function readChanges(operationId: string) {
    return db.prepare('SELECT table_name,before_json,after_json FROM _sync_changes WHERE operation_id=? ORDER BY sequence').all(operationId)
      .map((row: any) => ({ table: row.table_name, before: row.before_json === null ? null : JSON.parse(row.before_json),
        after: row.after_json === null ? null : JSON.parse(row.after_json) }));
  }
  function asOperation(row: any) {
    return { sequence: row.sequence, operationId: row.operation_id, digest: row.digest,
      changes: readChanges(row.operation_id), attempts: row.attempts,
      ...(row.request_key ? { request: { key: row.request_key, hash: row.request_hash, result: Buffer.from(row.request_result).toString('base64') } } : {}) };
  }
  parentPort.on('message', ({ id, method, args }: any) => {
    try {
      if (!Object.prototype.hasOwnProperty.call(handlers, method)) throw new Error('INVALID_METHOD');
      parentPort.postMessage({ id, result: handlers[method](args) });
    } catch (error: any) {
      // SQLite exceptions may contain private record values; only return known safe codes.
      const safe = /^(DATABASE_NOT_INITIALIZED|INTEGRITY_FAILED|SCHEMA_REVALIDATION_REQUIRED|OPERATION_TOO_LARGE|NO_OPERATIONAL_TABLES|PRIMARY_KEY_REQUIRED|INVALID_OPERATION|INVALID_STATEMENT|OPERATION_ID_REUSED|LOCAL_WRITE_CONFLICT|EMPTY_OPERATION|CHECKPOINT_MISMATCH|OPERATION_NOT_PENDING|BACKUP_ALREADY_EXISTS|INVALID_METHOD)$/;
      parentPort.postMessage({ id, error: safe.test(error.message) ? error.message : 'SQLITE_OPERATION_FAILED' });
    }
  });
}
