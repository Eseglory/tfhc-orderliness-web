import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private devices: DevicesService) {}
  @Post('push-token') register(@CurrentUser('userId') userId: string, @Body() body: { token: string; platform: string; deviceIdentifier?: string; appVersion?: string }) { return this.devices.registerPushToken(userId, body); }
  @Delete('push-token') remove(@CurrentUser('userId') userId: string, @Body() body: { token: string }) { return this.devices.removePushToken(userId, body.token); }
}
