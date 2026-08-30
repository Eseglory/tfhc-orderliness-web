import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}
  async registerPushToken(userId: string, input: { token: string; platform: string; deviceIdentifier?: string; appVersion?: string }) {
    if (!ExponentPushTokenPattern.test(input.token)) throw new BadRequestException('Invalid Expo push token');
    if (!['ios', 'android'].includes(input.platform)) throw new BadRequestException('Invalid device platform');
    return this.prisma.pushDevice.upsert({
      where: { token: input.token },
      update: { userId, platform: input.platform, deviceIdentifier: input.deviceIdentifier, appVersion: input.appVersion, lastSeenAt: new Date(), isActive: true },
      create: { userId, token: input.token, platform: input.platform, deviceIdentifier: input.deviceIdentifier, appVersion: input.appVersion },
    });
  }
  async removePushToken(userId: string, token: string) { return this.prisma.pushDevice.updateMany({ where: { userId, token }, data: { isActive: false } }); }
}
const ExponentPushTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;
