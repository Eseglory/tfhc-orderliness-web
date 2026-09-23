import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../../prisma/prisma.service';
import { BufferedMessageRecord, ChatBufferRepository } from './chat-buffer.repository';

export interface MigrationSummary {
  startedAt: string;
  completedAt: string;
  totalProcessed: number;
  migratedCount: number;
  failedCount: number;
  duplicatesPrevented: number;
  durationMs: number;
  postgresTotal?: number;
  sqliteTotal?: number;
  status?: 'COMPLETE' | 'PARTIAL' | 'RUNNING';
  importedCount?: number;
  unchangedCount?: number;
}

@Injectable()
export class ChatMigrationJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChatMigrationJob.name);
  private isMigrating = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bufferRepo: ChatBufferRepository,
  ) {}

  async onApplicationBootstrap() {
    try {
      // 1. Initial Legacy Seeding: copy existing Postgres messages into SQLite hot store
      await this.seedFromPrimaryDatabase();

      // 2. Startup recovery: sync any pending buffered messages to Postgres
      const stats = this.bufferRepo.getStats();
      if (stats.pendingCount > 0 || stats.failedCount > 0) {
        this.logger.log(
          `[Startup Recovery] Found ${stats.pendingCount} pending buffered messages in SQLite. Starting synchronization...`,
        );
        await this.runMigration('startup-recovery');
      }
    } catch (err) {
      this.logger.error(`[Startup Bootstrap Error] Failed during chat boot sync: ${(err as Error).message}`);
    }
  }

  /**
   * Seeds all historical messages from the Primary Database into the SQLite hot store.
   * Ensures that existing chat history is completely preserved, unified, and instantly available.
   */
  public async seedFromPrimaryDatabase(): Promise<{ totalDiscovered: number; inserted: number; skipped: number }> {
    try {
      // Seed active member profiles into memory cache for sub-millisecond lookup
      try {
        const members = await this.prisma.member.findMany({
          select: {
            id: true,
            firstName: true,
            lastName: true,
            preferredName: true,
            profilePhotoUrl: true,
          },
        });
        this.bufferRepo.setMemberProfiles(members);
      } catch (err: any) {
        this.logger.warn(`[Profile Seed Failed] ${err?.message}`);
      }

      const checkpoint = this.bufferRepo.getSyncCheckpoint();
      const startedAt = new Date().toISOString();
      let cursor: string | undefined;
      let totalDiscovered = 0, inserted = 0, skipped = 0;
      do {
      const existingMessages = await this.prisma.chatMessage.findMany({
        take: 50,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        ...(checkpoint ? { where: { OR: ['createdAt', 'editedAt', 'deletedAt'].map(field => ({ [field]: { gte: new Date(new Date(checkpoint).getTime() - 60000) } })) } } : {}),
        select: {
          id: true,
          clientOperationId: true,
          roomId: true,
          senderMemberId: true,
          type: true,
          body: true,
          attachmentUrl: true,
          attachmentMeta: true,
          replyToId: true,
          editedAt: true,
          deletedAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (!existingMessages.length) break;
      const formatted = existingMessages.map((m) => ({
        id: m.id,
        clientOperationId: m.clientOperationId,
        roomId: m.roomId,
        senderMemberId: m.senderMemberId,
        type: String(m.type),
        body: m.body,
        attachmentUrl: m.attachmentUrl,
        attachmentMeta: (m.attachmentMeta as Record<string, unknown>) || null,
        replyToId: m.replyToId,
        editedAt: m.editedAt ? m.editedAt.toISOString() : null,
        deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
      }));

      const batch = this.bufferRepo.seedLegacyMessages(formatted);
      inserted += batch.inserted;
      skipped += batch.skipped;
      totalDiscovered += existingMessages.length;
      cursor = existingMessages[existingMessages.length - 1].id;
      if (existingMessages.length < 50) break;
      } while (cursor);
      this.bufferRepo.setSyncCheckpoint(startedAt);
      this.logger.log(`ChatSyncImported records=${totalDiscovered} inserted=${inserted} skipped=${skipped}`);
      return { totalDiscovered, inserted, skipped };
    } catch (err: any) {
      this.logger.error(`[Legacy Seed Failed] Could not seed historical messages from Primary DB: ${err.message}`);
      throw err;
    }
  }

  /**
   * Continuous / Asynchronous Persistence Helper.
   * Immediately persists a newly buffered message to the Primary Database in the background.
   */
  public async persistMessageAsync(messageId: string, verifyPrimary = false): Promise<boolean> {
    const msg = this.bufferRepo.findById(messageId);
    if (!msg) return false;
    if (msg.syncStatus === 'MIGRATED' && !verifyPrimary) return true;

    try {
      if (msg.syncStatus === 'MIGRATED' && await this.matchesPrimary(msg)) return true;
      await this.migrateSingleMessage(msg);
      this.bufferRepo.markMigrated(msg.id, new Date().toISOString(), msg);
      return true;
    } catch (err: any) {
      if (err?.code === 'P2002' && await this.matchesPrimary(msg)) {
        this.bufferRepo.markMigrated(msg.id, new Date().toISOString(), msg);
        return true;
      }
      this.bufferRepo.markFailed(msg.id, err?.message || 'Async persistence failure');
      this.logger.warn(`[Async Persistence] Failed to persist message ${msg.id} immediately: ${err.message}`);
      return false;
    }
  }

  /**
   * 12:00 PM (Noon) Reconciliation Job.
   * Runs at 12:00 PM every day (Africa/Lagos timezone).
   */
  @Cron('0 12 * * *', {
    timeZone: process.env.TFHC_TIMEZONE || 'Africa/Lagos',
    disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true',
  })
  async handleNoonReconciliation() {
    this.logger.log('[Noon Reconciliation] Initiating 12:00 PM scheduled chat synchronization & audit...');
    await this.reconcileWithPrimaryDatabase('noon-cron');
  }

  /**
   * 12:00 AM (Midnight) Full Reconciliation Job.
   * Runs at 00:00 every night (Africa/Lagos timezone).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    timeZone: process.env.TFHC_TIMEZONE || 'Africa/Lagos',
    disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true',
  })
  async handleMidnightMigration() {
    this.logger.log('[Midnight Full Reconciliation] Initiating 12:00 AM full chat buffer audit & migration...');
    await this.reconcileWithPrimaryDatabase('midnight-cron');
  }

  /**
   * Full Bidirectional Reconciliation Engine.
   * Compares datasets, syncs pending/failed messages from SQLite to Postgres,
   * and ensures no messages are missing in either direction.
   */
  public async reconcileWithPrimaryDatabase(trigger = 'manual'): Promise<MigrationSummary> {
    const reconciliationStarted = Date.now();
    // 1. Run migration for any pending records in SQLite
    const migrationResult = await this.runMigration(trigger);

    // 2. Seed any missing records from Postgres into SQLite (e.g. from direct DB updates)
    let imported: { totalDiscovered: number; inserted: number; skipped: number };
    try { imported = await this.seedFromPrimaryDatabase(); }
    catch (error) {
      this.bufferRepo.setSyncSummary({ ...migrationResult, status: 'PARTIAL', importFailed: true,
        completedAt: new Date().toISOString(), durationMs: Date.now() - reconciliationStarted });
      throw error;
    }

    // 3. Audit total counts across both engines
    let postgresTotal = 0;
    try {
      postgresTotal = await this.prisma.chatMessage.count();
    } catch {
      postgresTotal = -1;
    }
    const sqliteTotal = this.bufferRepo.countAll();

    this.logger.log(
      `[Reconciliation Audit] Trigger=${trigger}, Postgres Total=${postgresTotal}, SQLite Hot Store Total=${sqliteTotal}`,
    );

    const summary: MigrationSummary = {
      ...migrationResult, postgresTotal, sqliteTotal,
      completedAt: new Date().toISOString(), durationMs: Date.now() - reconciliationStarted,
      status: migrationResult.failedCount || postgresTotal < 0 ? 'PARTIAL' : 'COMPLETE',
      importedCount: imported.inserted, unchangedCount: imported.skipped,
    };
    this.bufferRepo.setSyncSummary(summary);
    return summary;
  }

  /**
   * Safe, idempotent, batched migration runner.
   */
  public async runMigration(trigger = 'manual'): Promise<MigrationSummary> {
    if (this.isMigrating) {
      this.logger.warn('[Chat Migration] Migration already in progress. Skipping concurrent run.');
      return {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalProcessed: 0,
        migratedCount: 0,
        failedCount: 0,
        duplicatesPrevented: 0,
        durationMs: 0,
        status: 'RUNNING',
      };
    }

    this.isMigrating = true;
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    let totalProcessed = 0;
    let migratedCount = 0;
    let failedCount = 0;
    let duplicatesPrevented = 0;

    try {
      let after: { createdAt: string; id: string } | undefined;
      let batch = this.bufferRepo.getPendingBatch(100);

      while (batch.length > 0) {
        // Mark current batch as PROCESSING in SQLite
        for (const item of batch) {
          this.bufferRepo.markProcessing(item.id);

        }

        // Process batch items
        for (const msg of batch) {
          totalProcessed++;
          try {
            await this.migrateSingleMessage(msg);
            this.bufferRepo.markMigrated(msg.id, new Date().toISOString(), msg);
            migratedCount++;
          } catch (err: any) {
            // Check if failure was due to duplicate message (already in Postgres)
            if (err?.code === 'P2002' && await this.matchesPrimary(msg)) {
              duplicatesPrevented++;
              this.bufferRepo.markMigrated(msg.id, new Date().toISOString(), msg);
              migratedCount++;
              this.logger.log(`[Chat Migration] Prevented duplicate insertion for message ${msg.id}`);
            } else {
              failedCount++;
              this.bufferRepo.markFailed(msg.id, err.message || 'Unknown migration error');
              this.logger.error(`[Chat Migration] Failed to migrate message ${msg.id}: ${err.message}`);
            }
          }
        }

        // Fetch next batch excluding already processed in this run
        const last = batch[batch.length - 1];
        after = { createdAt: last.createdAt, id: last.id };
        batch = this.bufferRepo.getPendingBatch(100, after);
      }

      const durationMs = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      this.logger.log(
        `[Chat Migration Finished] Trigger=${trigger}, Duration=${durationMs}ms, Processed=${totalProcessed}, Migrated=${migratedCount}, DuplicatesPrevented=${duplicatesPrevented}, Failed=${failedCount}`,
      );

      const summary = { startedAt, completedAt, totalProcessed, migratedCount, failedCount, duplicatesPrevented, durationMs };
      this.bufferRepo.setSyncSummary(summary);
      return summary;
    } finally {
      this.isMigrating = false;
    }
  }

  private async matchesPrimary(msg: BufferedMessageRecord): Promise<boolean> {
    const saved = await this.prisma.chatMessage.findUnique({ where: msg.clientOperationId ? { clientOperationId: msg.clientOperationId } : { id: msg.id } });
    return Boolean(saved && saved.roomId === msg.roomId && saved.senderMemberId === msg.senderMemberId && saved.id === msg.id && saved.body === msg.body && saved.attachmentUrl === msg.attachmentUrl && isDeepStrictEqual(saved.attachmentMeta ?? null, msg.attachmentMeta) && (saved.editedAt?.toISOString() || null) === msg.editedAt && (saved.deletedAt?.toISOString() || null) === msg.deletedAt);
  }

  private async migrateSingleMessage(msg: BufferedMessageRecord): Promise<void> {
    const rawType = String(msg.type || 'TEXT').toUpperCase();
    const type = ['TEXT', 'IMAGE', 'AUDIO', 'SYSTEM'].includes(rawType) ? (rawType as any) : 'TEXT';

    const createData: Prisma.ChatMessageCreateInput = {
      id: msg.id,
      clientOperationId: msg.clientOperationId || undefined,
      room: { connect: { id: msg.roomId } },
      type,
      body: msg.body,
      attachmentUrl: msg.attachmentUrl,
      attachmentMeta: msg.attachmentMeta ? (msg.attachmentMeta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(msg.createdAt),
      editedAt: msg.editedAt ? new Date(msg.editedAt) : null,
      deletedAt: msg.deletedAt ? new Date(msg.deletedAt) : null,
      ...(msg.senderMemberId ? { sender: { connect: { id: msg.senderMemberId } } } : {}),
      ...(msg.replyToId ? { replyTo: { connect: { id: msg.replyToId } } } : {}),
    };

    const saved = await this.prisma.chatMessage.upsert({
      where: { id: msg.id }, create: createData, update: {},
    });
    if (saved.roomId && (saved.id !== msg.id || saved.roomId !== msg.roomId || saved.senderMemberId !== msg.senderMemberId)) {
      throw new Error('Sync conflict: immutable message identity differs');
    }
    const remoteVersion = Math.max(saved.editedAt?.getTime() || 0, saved.deletedAt?.getTime() || 0);
    const localVersion = Math.max(msg.editedAt ? Date.parse(msg.editedAt) : 0, msg.deletedAt ? Date.parse(msg.deletedAt) : 0);
    if (localVersion > remoteVersion) {
      // Compare-and-set: another writer cannot be overwritten by an older snapshot.
      const updated = await this.prisma.chatMessage.updateMany({ where: {
        id: msg.id, editedAt: saved.editedAt, deletedAt: saved.deletedAt,
      }, data: {
        body: msg.body, attachmentUrl: msg.attachmentUrl,
        attachmentMeta: msg.attachmentMeta ? msg.attachmentMeta as Prisma.InputJsonValue : Prisma.DbNull,
        editedAt: msg.editedAt ? new Date(msg.editedAt) : null,
        deletedAt: msg.deletedAt ? new Date(msg.deletedAt) : null,
      } });
      if (!updated.count) throw new Error('Message changed during synchronization; retry required');
    } else if (saved.body !== undefined && (saved.body !== msg.body || remoteVersion !== localVersion || saved.attachmentUrl !== msg.attachmentUrl || !isDeepStrictEqual(saved.attachmentMeta ?? null, msg.attachmentMeta))) {
      throw new Error('Sync conflict: primary and local versions differ; both retained for reconciliation');
    }
  }
}
