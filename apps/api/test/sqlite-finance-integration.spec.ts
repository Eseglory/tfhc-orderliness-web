import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapSqlite } from '../src/database-sync/sqlite-bootstrap';

// Run the shared HTTP finance acceptance suite against an isolated
// SQLite authority. No PostgreSQL connections or production data are involved.
let directory: string;
let saved: Record<string, string | undefined>;
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'tfhc-sqlite-finance-'));
  const file = join(directory, 'finance.db');
  await bootstrapSqlite(file);
  const updates = { OPERATIONAL_DATABASE: 'sqlite', SQLITE_DATABASE_PATH: file,
    SQLITE_DURABILITY: 'local', CHAT_SHARED_DB_PATH: join(directory, 'chat.db') };
  saved = Object.fromEntries(Object.keys(updates).map(key => [key, process.env[key]]));
  Object.assign(process.env, updates);
}, 30000);
afterAll(() => {
  for (const [key, value] of Object.entries(saved || {})) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  if (directory) rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});
import './finance.e2e-spec';
