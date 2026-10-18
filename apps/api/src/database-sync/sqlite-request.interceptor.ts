import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** Runs after authentication/permission guards. PostgreSQL-mode behavior is unchanged. */
@Injectable()
export class SqliteRequestInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    if (!this.prisma.operationalAdapter || context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next.handle();
    // Multipart routes install this interceptor AFTER FileInterceptor as well;
    // wait for parsed bytes before fingerprinting or opening a write transaction.
    if (request.headers['content-type']?.startsWith('multipart/') && !request.file) return next.handle();
    const key = request.headers['idempotency-key'];
    if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(key))) throw new BadRequestException('Invalid Idempotency-Key');
    // Never persist authentication responses/tokens in the HTTP replay cache.
    const cacheKey = request.path?.startsWith('/auth/') || request.url?.startsWith('/auth/') ? undefined : key;
    const hash = createHash('sha256').update(JSON.stringify({
      actor: request.user?.userId || request.user?.id || null, method: request.method,
      url: request.originalUrl || request.url, body: request.body,
      file: request.file ? createHash('sha256').update(request.file.buffer).digest('hex') : undefined,
    })).digest('hex');
    return from(this.prisma.operationalAdapter.request(() => lastValueFrom(next.handle()), cacheKey, hash));
  }
}
