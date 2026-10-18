import { PrismaClient } from '@prisma/client';
import { ServiceUnavailableException } from '@nestjs/common';
import { SqliteJournal } from './sqlite-journal';
import { SyncConflict } from './sync.types';

/** Small immutable recovery log; does not update PostgreSQL business tables. */
export class RecoveryJournal {
  constructor(private readonly pg: PrismaClient, private readonly sourceId: string, private readonly local: SqliteJournal,
    private readonly fence?: (tx: any) => Promise<void>) {}
  async protectPending() {
    try {
      for (;;) {
        const pending = await this.local.unprotected();
        if (!pending.length) return;
        for (const operation of pending) {
          await this.pg.$transaction(async tx => {
            if (this.fence) await this.fence(tx);
            await tx.$executeRawUnsafe('INSERT INTO public._sqlite_sync_sources(source_id,checkpoint) VALUES($1,0) ON CONFLICT DO NOTHING', this.sourceId);
            await tx.$executeRawUnsafe(`INSERT INTO public._sqlite_recovery_operations(source_id,operation_id,sequence,digest,payload)
              VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,operation_id) DO NOTHING`,
              this.sourceId, operation.operationId, operation.sequence, operation.digest, JSON.stringify(operation));
            const rows = await tx.$queryRawUnsafe<any[]>('SELECT digest,sequence FROM public._sqlite_recovery_operations WHERE source_id=$1 AND operation_id=$2', this.sourceId, operation.operationId);
            if (rows[0]?.digest !== operation.digest || Number(rows[0]?.sequence) !== operation.sequence) throw new SyncConflict();
          }, { timeout: 10000 });
          await this.local.protected(operation);
        }
      }
    } catch {
      // No success is returned for unprotected writes. Local data and the outbox
      // remain intact for recovery; do not expose database messages/credentials.
      throw new ServiceUnavailableException({ code: 'WRITE_CONFIRMATION_PENDING',
        message: 'The change is saved locally but recovery protection is pending. Check its status before submitting it again.' });
    }
  }
}
