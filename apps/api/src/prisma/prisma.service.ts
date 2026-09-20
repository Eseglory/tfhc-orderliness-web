import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const raw = process.env.DATABASE_URL;
    let url = raw;
    if (raw) {
      const parsed = new URL(raw);
      // Bound each API process, including overlapping deploy instances, below
      // the hosted session pool limit. Respect explicit operator overrides.
      if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '3');
      url = parsed.toString();
    }
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    const url = process.env.DATABASE_URL || '';
    if (process.env.NODE_ENV === 'test') {
      const isLocal = /^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/(tfhc_e2e|tfhc_orderliness_db)(?:\?|$)/.test(url);
      const isRemoteOrProd = /supabase|aws|pooler|\.com|\.net|\.io/i.test(url);
      if (!isLocal || isRemoteOrProd) {
        const masked = url.replace(/:[^:@]+@/, ':***@');
        throw new Error(
          `[CRITICAL DATABASE ISOLATION SAFEGUARD] PrismaService rejected connection to remote database in test mode: ${masked}. Tests must only connect to local Docker database container.`
        );
      }
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
