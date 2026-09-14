import { Body, Controller, Delete, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { decode, JwtPayload } from 'jsonwebtoken';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PwaService } from './pwa.service';
@Controller('pwa')
export class PwaController {
  constructor(private pwa: PwaService) {}
  @Post('session') @UseGuards(JwtAuthGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
  issue(@CurrentUser('userId') userId: string, @Req() request: Request) {
    const payload = decode(request.headers.authorization?.replace(/^Bearer\s+/i, '') || '') as JwtPayload;
    return this.pwa.issue(userId, payload?.iat, payload?.exp);
  }
  @Delete('session')
  revoke(@Headers('x-pwa-grant') grant: string) { return this.pwa.revoke(grant); }
  @Post('sync')
  sync(@Headers('x-pwa-grant') grant: string, @Body() input: { owner?: string; ids?: string[] }) { return this.pwa.read(grant, input); }
  @Post('metrics') @Throttle({ default: { limit: 30, ttl: 60000 } })
  metrics(@Body() body: unknown) { return this.pwa.metrics(body); }
}
