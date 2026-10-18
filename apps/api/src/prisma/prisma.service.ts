import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { assertSupportedDatabaseMode } from '../database-sync/database-mode';
import { SqlitePrismaAdapter } from '../database-sync/sqlite-prisma-adapter';
import { resolve } from 'node:path';
import { RecoveryJournal } from '../database-sync/recovery-journal';
import { verifyProductionActivation } from '../database-sync/activation';
import { OperationalLease } from '../database-sync/operational-lease';
import { databaseConnectionUrl } from './database-connection';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly operationalAdapter?: SqlitePrismaAdapter;
  readonly centralClient?: PrismaClient;
  private operationalLease?: OperationalLease;
  constructor() {
    assertSupportedDatabaseMode();
    const url = databaseConnectionUrl();
    super(url ? { datasources: { db: { url } } } : undefined);
    if (process.env.OPERATIONAL_DATABASE === 'sqlite') {
      if (process.env.NODE_ENV === 'production') verifyProductionActivation(process.env.SQLITE_DATABASE_PATH, process.env.SQLITE_ACTIVATION_MANIFEST);
      this.operationalAdapter = new SqlitePrismaAdapter(resolve(process.env.SQLITE_DATABASE_PATH));
      if (url) this.centralClient = new PrismaClient({ datasources: { db: { url } } });
      if (process.env.NODE_ENV === 'production' && !this.centralClient) throw new Error('SQLITE_RECOVERY_DATABASE_REQUIRED');
      const adapter = this.operationalAdapter;
      return new Proxy(this, { get(target, property, receiver) {
        // All business models and raw/transaction methods route locally. Lifecycle
        // and central-replication configuration remain on the Nest provider.
        const local = adapter.client[property];
        if (local !== undefined) return local;
        return Reflect.get(target, property, receiver);
      } });
    }
  }

  async onModuleInit() {
    if (this.operationalAdapter) {
      await this.operationalAdapter.connect();
      if (process.env.SQLITE_DURABILITY === 'postgres-journal') {
        if (!this.centralClient) throw new Error('SQLITE_RECOVERY_DATABASE_REQUIRED');
        this.operationalLease = new OperationalLease(this.centralClient, this.operationalAdapter.sourceId);
        await this.operationalLease.acquire();
        const recovery = new RecoveryJournal(this.centralClient, this.operationalAdapter.sourceId, this.operationalAdapter.journal,
          tx => this.operationalLease.assertOwner(tx));
        this.operationalAdapter.protectWrites = () => recovery.protectPending();
        await recovery.protectPending();
      }
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    if (this.operationalAdapter) {
      try { await this.operationalAdapter.disconnect(); await this.operationalLease?.release(); }
      finally { await this.centralClient?.$disconnect(); }
      return;
    }
    await this.$disconnect();
  }

  afterCommit(work: () => void) {
    if (this.operationalAdapter) this.operationalAdapter.afterCommit(work);
    else work();
  }
}
