import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/** Central fencing prevents two hosts acknowledging writes from independent files. */
export class OperationalLease {
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;
  constructor(private readonly pg: PrismaClient, private readonly sourceId: string) {}
  async acquire() {
    const changed = await this.pg.$executeRawUnsafe(`INSERT INTO public._sqlite_operational_authority(singleton,source_id,owner_id,expires_at)
      VALUES(true,$1,$2,now()+interval '60 seconds') ON CONFLICT(singleton) DO UPDATE
      SET owner_id=EXCLUDED.owner_id,expires_at=EXCLUDED.expires_at
      WHERE _sqlite_operational_authority.source_id=EXCLUDED.source_id
        AND (_sqlite_operational_authority.expires_at<=now() OR _sqlite_operational_authority.owner_id=EXCLUDED.owner_id)`, this.sourceId, this.owner);
    if (changed !== 1) throw new Error('SQLITE_AUTHORITY_ALREADY_ACTIVE');
    this.timer = setInterval(() => {
      // Recovery protection checks the same fence in EVERY acknowledgement
      // transaction. A failed heartbeat can never authorize a stale writer.
      void this.pg.$transaction(tx => this.assertOwner(tx)).catch(() => undefined);
    }, 15000);
    this.timer.unref();
  }
  async assertOwner(tx: any) {
    const changed = await tx.$executeRawUnsafe(`UPDATE public._sqlite_operational_authority SET expires_at=now()+interval '60 seconds'
      WHERE singleton=true AND source_id=$1 AND owner_id=$2 AND expires_at>now()`, this.sourceId, this.owner);
    if (changed !== 1) {
      const renewed = await tx.$executeRawUnsafe(`UPDATE public._sqlite_operational_authority SET expires_at=now()+interval '60 seconds'
        WHERE singleton=true AND source_id=$1 AND owner_id=$2`, this.sourceId, this.owner);
      if (renewed !== 1) throw new Error('SQLITE_AUTHORITY_LEASE_LOST');
    }
  }
  async release() {
    if (this.timer) clearInterval(this.timer);
    // Keep the source identity pinned. Switching authorities requires an offline,
    // reviewed recovery/cutover; restarting this source only needs expiry/release.
    await this.pg.$executeRawUnsafe(`UPDATE public._sqlite_operational_authority SET expires_at=now()
      WHERE singleton=true AND source_id=$1 AND owner_id=$2`, this.sourceId, this.owner);
  }
}
