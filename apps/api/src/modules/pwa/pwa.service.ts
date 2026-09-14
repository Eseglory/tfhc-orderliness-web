import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { MembersService } from '../members/members.service';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const METRICS = new Set(['registration', 'update', 'offline', 'online', 'sync_success', 'sync_failure', 'storage_failure', 'upload_resume', 'LCP', 'CLS', 'INP']);
@Injectable()
export class PwaService {
  private readonly logger = new Logger(PwaService.name);
  constructor(private prisma: PrismaService, private auth: JwtStrategy, private members: MembersService) {}
  async issue(userId: string, issuedAt: number, expiresAt: number) {
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) throw new UnauthorizedException();
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Math.min(expiresAt * 1000, Date.now() + 7 * 86400000));
    await this.prisma.pwaDeviceSession.create({ data: { userId, tokenHash: hash(token), issuedAt: new Date(issuedAt * 1000), expiresAt: expires } });
    return { grant: token, expiresAt: expires.toISOString() };
  }
  async revoke(token: string) {
    if (token) await this.prisma.pwaDeviceSession.deleteMany({ where: { tokenHash: hash(token) } });
    return { revoked: true };
  }
  async read(token: string, input: { owner?: string; ids?: string[] }) {
    if (!/^[\w-]{43}$/.test(token || '')) throw new UnauthorizedException();
    const device = await this.prisma.pwaDeviceSession.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
    if (!device || device.expiresAt.getTime() <= Date.now() || input?.owner !== device.userId ||
        (device.user.lastLogoutAt && device.user.lastLogoutAt >= device.createdAt)) throw new UnauthorizedException();
    // Same account/revocation rules as the main session, without issuing a new JWT.
    const user = await this.auth.validate({ sub: device.userId, email: device.user.email, role: device.user.role,
      iat: Math.floor(device.issuedAt.getTime() / 1000) });
    if (!user.memberId) throw new UnauthorizedException();
    if (!Array.isArray(input.ids) || !input.ids.length) throw new BadRequestException('Explicit notification IDs required');
    return this.members.readNotifications(user.memberId, input.ids);
  }
  metrics(input: unknown) {
    const body = input as { events?: { name?: string; value?: number; connection?: string }[] };
    if (!Array.isArray(body?.events) || body.events.length > 20) throw new BadRequestException('At most 20 metrics allowed');
    for (const event of body.events) {
      if (!METRICS.has(event?.name) || !Number.isFinite(event.value) || event.value < 0 || event.value > 3600000) throw new BadRequestException('Invalid metric');
    }
    // Deliberately discard URLs, user IDs, labels, payloads and arbitrary fields.
    for (const event of body.events) this.logger.log(JSON.stringify({ metric: event.name, value: event.value,
      connection: ['slow-2g', '2g', '3g', '4g'].includes(event.connection) ? event.connection : 'unknown' }));
    return { accepted: body.events.length };
  }
  @Cron(CronExpression.EVERY_HOUR, { disabled: process.env.DISABLE_SCHEDULED_JOBS === 'true' })
  async cleanup() {
    await this.prisma.pwaDeviceSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.prisma.resumableUpload.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }
}
