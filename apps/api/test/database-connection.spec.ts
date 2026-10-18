import { databaseConnectionUrl } from '../src/prisma/database-connection';

describe('server database configuration and test isolation', () => {
  it('uses the existing PostgreSQL endpoint with a bounded pool', () => {
    const url = new URL(databaseConnectionUrl({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:synthetic@db.example.test/app?sslmode=require' })!);
    expect(url.hostname).toBe('db.example.test');
    expect(url.searchParams.get('connection_limit')).toBe('3');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });
  it('preserves explicit connection settings', () => {
    expect(new URL(databaseConnectionUrl({ DATABASE_URL: 'postgresql://localhost/app?connection_limit=1' })!).searchParams.get('connection_limit')).toBe('1');
  });
  it.each([
    'postgresql://user:synthetic@db.example.test/tfhc_e2e',
    'postgresql://localhost/production',
    'postgresql://localhost/tfhc_e2e?host=remote.example.test',
    'postgresql://localhost.evil.test/tfhc_e2e',
  ])('rejects unsafe test URLs before any client can connect', DATABASE_URL => {
    expect(() => databaseConnectionUrl({ NODE_ENV: 'test', DATABASE_URL })).toThrow('TEST_DATABASE_MUST_BE_ISOLATED_LOCAL_DATABASE');
  });
  it('accepts only the dedicated local test database', () => {
    expect(databaseConnectionUrl({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://user:synthetic@127.0.0.1:55498/tfhc_e2e' })).toContain('connection_limit=3');
  });
  it('does not include connection credentials in invalid-configuration errors', () => {
    expect(() => databaseConnectionUrl({ DATABASE_URL: 'invalid-secret-value' })).toThrow(/^INVALID_DATABASE_URL$/);
    expect(() => databaseConnectionUrl({ NODE_ENV: 'test' })).toThrow('TEST_DATABASE_NOT_CONFIGURED');
  });
});
