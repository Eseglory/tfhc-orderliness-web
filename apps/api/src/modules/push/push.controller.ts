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
    if (!user.memberId) throw new ForbiddenException('A member profile is required');
    // Signature and expiry have already been validated by JwtAuthGuard.
    const payload = decode(request.headers.authorization?.replace(/^Bearer\s+/i, '') || '') as JwtPayload;
    return this.push.subscribe(user.userId, body, new Date((payload?.exp || 0) * 1000));
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
