import { Body, Controller, ForbiddenException, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AvailabilityService } from './availability.service';
@UseGuards(JwtAuthGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}
  @Get('current') current(@CurrentUser('memberId') memberId?: string) { if (!memberId) throw new ForbiddenException('A member profile is required'); return this.availability.currentForMember(memberId); }
  @Put('current') submit(@CurrentUser('memberId') memberId: string | undefined, @Body() body: { meetingIds?: string[] }) { if (!memberId) throw new ForbiddenException('A member profile is required'); return this.availability.submit(memberId, body.meetingIds ?? []); }
}
