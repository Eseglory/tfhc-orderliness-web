import { Inject, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncRunner } from './sync-runner';

export const OPERATIONAL_SYNC_RUNNER = Symbol('OPERATIONAL_SYNC_RUNNER');

/** Bounded twice-daily replay; PostgreSQL-default deployments do not receive a runner. */
@Injectable()
export class DailySyncJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailySyncJob.name);
  private running = false;
  private lastRun: { completedAt: string; applied: number; status: string } | null = null;
  constructor(@Optional() @Inject(OPERATIONAL_SYNC_RUNNER) private readonly runner?: SyncRunner) {}

  onApplicationBootstrap() {
    if (!this.runner || process.env.DISABLE_SCHEDULED_JOBS === 'true') return;
    // A sleeping host may miss cron. Check the durable backlog after startup;
    // do not hold application readiness open while replay runs.
    setImmediate(() => { void this.catchUp().catch(() => this.logger.warn('OperationalSync catchup=FAILED')); });
  }

  async catchUp(now = new Date()) {
    if (!this.runner) return;
    // Lagos is UTC+1: its 03:00/15:00 slots are 02:00/14:00 UTC.
    const slot = new Date(now);
    slot.setUTCHours(now.getUTCHours() >= 14 ? 14 : 2, 0, 0, 0);
    if (now.getUTCHours() < 2) { slot.setUTCDate(slot.getUTCDate() - 1); slot.setUTCHours(14); }
    const backlog = await this.runner.backlog();
    if (backlog.pending > 0 && backlog.oldestPendingAt && Date.parse(backlog.oldestPendingAt) <= slot.getTime()) {
      await this.synchronize();
    }
  }

  status() {
    return { enabled: Boolean(this.runner), schedule: '03:00 and 15:00 daily', timeZone: 'Africa/Lagos',
      running: this.running, lastRun: this.lastRun, activationBlocked: !this.runner };
  }

  @Cron('0 3,15 * * *', { timeZone: 'Africa/Lagos', disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async synchronize() {
    if (!this.runner || this.running) return;
    this.running = true;
    let applied = 0;
    let status = 'DRAINED';
    const deadline = Date.now() + 30 * 60 * 1000;
    try {
      while (Date.now() < deadline) {
        const batch = await this.runner.run(100, 10000);
        applied += batch.applied;
        if (batch.blocked) { status = 'BLOCKED'; break; }
        if (batch.alreadyRunning) { status = 'BUSY'; break; }
        if (!batch.applied) break;
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      if (Date.now() >= deadline) status = 'WINDOW_ENDED';
    } catch { status = 'FAILED'; }
    finally {
      this.running = false;
      this.lastRun = { completedAt: new Date().toISOString(), applied, status };
      // Never log payloads, credentials, SQL, or raw destination error messages.
      const message = `OperationalSync status=${status} applied=${applied}`;
      if (status === 'DRAINED') this.logger.log(message); else this.logger.warn(message);
    }
  }
}
