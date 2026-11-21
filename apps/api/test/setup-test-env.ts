import * as fs from 'fs';
import * as path from 'path';

// 1. Force NODE_ENV to test
process.env.NODE_ENV = 'test';

// 2. Load dedicated test environment files first with override
function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[k] = v;
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../../.env.test'));
loadEnvFile(path.resolve(__dirname, '../.env.test'));

// 3. Guarantee local Docker test database URL
const LOCAL_TEST_DB = 'postgresql://postgres:tfhc_e2e_only@127.0.0.1:55498/tfhc_e2e';
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || LOCAL_TEST_DB;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// 4. Strict Production Safeguard
const resolvedUrl = process.env.DATABASE_URL || '';
const isLocal = /^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/(tfhc_e2e|tfhc_orderliness_db)(?:\?|$)/.test(resolvedUrl);
const isRemoteOrProd = /supabase|aws|pooler|\.com|\.net|\.io/i.test(resolvedUrl);

if (!isLocal || isRemoteOrProd) {
  const masked = resolvedUrl.replace(/:[^:@]+@/, ':***@');
  throw new Error(
    `[FATAL TEST ENVIRONMENT SECURITY VIOLATION] ` +
    `Automated tests are strictly forbidden from connecting to remote or production databases!\n` +
    `Attempted database connection: ${masked}\n` +
    `Tests must run against local Docker database (127.0.0.1:55498/tfhc_e2e or localhost:54399/tfhc_orderliness_db).`
  );
}

// 5. Test execution safety flags
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.DISABLE_SCHEDULED_JOBS = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-local-only-jwt-secret-key-2026';
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
  process.env[key] = '';
}
