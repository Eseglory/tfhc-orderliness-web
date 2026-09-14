import { PrismaService } from '../src/prisma/prisma.service';

describe('Test Database Isolation Safeguards', () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalTestDbUrl = process.env.TEST_DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.DATABASE_URL = originalDbUrl;
    process.env.TEST_DATABASE_URL = originalTestDbUrl;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should ensure the test environment is running in NODE_ENV=test and using local Docker DB', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DATABASE_URL).toBeDefined();

    const isLocal = /^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/(tfhc_e2e|tfhc_orderliness_db)(?:\?|$)/.test(
      process.env.DATABASE_URL!
    );
    expect(isLocal).toBe(true);

    const isRemote = /supabase|aws|pooler|\.com|\.net|\.io/i.test(process.env.DATABASE_URL!);
    expect(isRemote).toBe(false);
  });

  it('PrismaService must throw a fatal error if initialized with a Supabase or remote URL in test mode', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres.xxx:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

    const prismaService = new PrismaService();
    await expect(prismaService.onModuleInit()).rejects.toThrow(
      /CRITICAL DATABASE ISOLATION SAFEGUARD/
    );
  });

  it('PrismaService must throw a fatal error if DATABASE_URL is empty in test mode', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = '';

    const prismaService = new PrismaService();
    await expect(prismaService.onModuleInit()).rejects.toThrow(
      /CRITICAL DATABASE ISOLATION SAFEGUARD/
    );
  });
});
