import { SqliteJournal } from './sqlite-journal';
import { SyncConflict, SyncDestination } from './sync.types';

/** Ordered, bounded replay. A failed operation blocks later dependent operations. */
export class SyncRunner {
  private running = false;
  constructor(private readonly journal: SqliteJournal, private readonly destination: SyncDestination) {}

  backlog() { return this.journal.status(); }

  async run(limit = 100, budgetMs = 30000) {
    if (this.running) return { applied: 0, blocked: false, alreadyRunning: true };
    this.running = true;
    let applied = 0;
    let paused = false;
    const deadline = Date.now() + budgetMs;
    try {
      while (applied < limit && Date.now() < deadline) {
        const operation = await this.journal.next();
        if (!operation) { paused = true; break; }
        try {
          await this.destination.apply(operation);
        } catch (error) {
          await this.journal.failed(operation, error instanceof SyncConflict);
          return { applied, blocked: true, alreadyRunning: false };
        }
        // Crash here is safe: destination receipt makes re-delivery a no-op.
        await this.journal.applied(operation);
        applied++;
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      const status = await this.journal.status();
      return { applied, blocked: status.conflicts > 0 || (paused && status.pending > 0), alreadyRunning: false };
    } finally { this.running = false; }
  }
}
