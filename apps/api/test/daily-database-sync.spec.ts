import { DailySyncJob } from '../src/database-sync/daily-sync.job';
import { AppController } from '../src/app.controller';
import { ChatMigrationJob } from '../src/modules/chat/chat-migration.job';

describe('daily operational synchronization and activation visibility', () => {
  it('reports disabled until the operational adapter is supplied', async () => {
    const job = new DailySyncJob();
    await job.synchronize();
    expect(job.status()).toMatchObject({ enabled: false, activationBlocked: true, timeZone: 'Africa/Lagos', schedule: '03:00 and 15:00 daily' });
    expect(new AppController(job).databaseSync()).toEqual({
      operationalDatabase: 'postgresql', sqlitePrimaryReady: false, dailyOperationalSyncEnabled: false,
    });
  });

  it('drains bounded batches and records success', async () => {
    const run = jest.fn().mockResolvedValueOnce({ applied: 100 }).mockResolvedValueOnce({ applied: 5 }).mockResolvedValue({ applied: 0 });
    const job = new DailySyncJob({ run } as any);
    await job.synchronize();
    expect(run).toHaveBeenCalledTimes(3);
    expect(job.status().lastRun).toMatchObject({ applied: 105, status: 'DRAINED' });
  });

  it('stops at conflicts without consuming later batches', async () => {
    const run = jest.fn().mockResolvedValue({ applied: 2, blocked: true });
    const job = new DailySyncJob({ run } as any);
    await job.synchronize();
    expect(run).toHaveBeenCalledTimes(1);
    expect(job.status().lastRun.status).toBe('BLOCKED');
  });

  it('rejects overlapping schedules and reports failures without exposing exception text', async () => {
    let rejectRun: (error: Error) => void;
    const run = jest.fn().mockImplementation(() => new Promise((_, reject) => { rejectRun = reject; }));
    const job = new DailySyncJob({ run } as any);
    const first = job.synchronize();
    await job.synchronize();
    expect(run).toHaveBeenCalledTimes(1);
    rejectRun(new Error('private connection details'));
    await first;
    expect(job.status().lastRun.status).toBe('FAILED');
    expect(JSON.stringify(job.status())).not.toContain('private');
  });

  it('uses the same twice-daily Lagos schedule for both synchronization jobs', () => {
    const metadata = (method: Function) => Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', method);
    expect(metadata(DailySyncJob.prototype.synchronize)).toMatchObject({ cronTime: '0 3,15 * * *', timeZone: 'Africa/Lagos' });
    expect(metadata(ChatMigrationJob.prototype.handleDailyReconciliation)).toMatchObject({ cronTime: '0 3,15 * * *', timeZone: 'Africa/Lagos' });
    expect((ChatMigrationJob.prototype as any).handleNoonReconciliation).toBeUndefined();
  });

  it.each([
    ['2026-10-13T02:01:00Z', '2026-10-13T01:59:00Z', true],
    ['2026-10-13T14:01:00Z', '2026-10-13T13:59:00Z', true],
    ['2026-10-13T01:00:00Z', '2026-10-12T13:59:00Z', true],
    ['2026-10-13T12:00:00Z', '2026-10-13T03:00:00Z', false],
    ['2026-10-13T01:00:00Z', '2026-10-12T15:00:00Z', false],
  ])('recovers missed schedule on restart without replaying a future batch (%s)', async (now, oldestPendingAt, due) => {
    const run = jest.fn().mockResolvedValue({ applied: 0 });
    const backlog = jest.fn().mockResolvedValue({ pending: 1, oldestPendingAt });
    await new DailySyncJob({ run, backlog } as any).catchUp(new Date(now));
    expect(run).toHaveBeenCalledTimes(due ? 1 : 0);
  });
});
