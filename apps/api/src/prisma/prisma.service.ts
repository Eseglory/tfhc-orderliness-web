import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
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
