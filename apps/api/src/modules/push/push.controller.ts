import { Body, Controller, Delete, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { decode, JwtPayload } from 'jsonwebtoken';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}
  @Get('config') configuration() { return this.push.configuration(); }
  @Post('subscriptions')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown, @Req() request: Request) {
    if (!user?.userId) throw new ForbiddenException('Authentication is required');
    const payload = decode(request.headers.authorization?.replace(/^Bearer\s+/i, '') || '') as JwtPayload;
    const tokenExpMs = (payload?.exp || 0) * 1000;
    const defaultExpiry = Date.now() + 30 * 86400000; // 30 days minimum
    const expiresAt = new Date(Math.max(tokenExpMs, defaultExpiry));
    return this.push.subscribe(user.userId, body, expiresAt);
  }
  @Post('status')
  status(@CurrentUser() user: AuthenticatedUser, @Body() body: { endpoint?: string }) {
    return this.push.status(user.userId, body?.endpoint);
  }
  @Delete('subscriptions')
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() body: { endpoint?: string }) {
    return this.push.unsubscribe(user.userId, body?.endpoint);
  }
}
