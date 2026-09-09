import { AbsenceProcessingJob } from '../../jobs/absence-processing.job';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeetingStatus } from '@tfhc/shared';

@Injectable()
export class MeetingsService {
  constructor(private prisma: PrismaService, private absenceProcessing: AbsenceProcessingJob) {}

  async respond(id: string, memberId: string | undefined, attending: unknown) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    if (typeof attending !== 'boolean') throw new BadRequestException('Choose attending or not attending');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM meetings WHERE id = ${id} FOR UPDATE`;
      const meeting = await tx.meeting.findUnique({ where: { id } });
      if (!meeting) throw new NotFoundException('Event not found');
      if (!['SCHEDULED', 'ACTIVE'].includes(meeting.status) || meeting.startTime <= new Date()) throw new BadRequestException('Responses close when the event starts');
      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can respond');
      return tx.eventResponse.upsert({ where: { memberId_meetingId: { memberId, meetingId: id } }, create: { memberId, meetingId: id, attending }, update: { attending } });
    });
  }

  async getCategories() {
    return this.prisma.meetingCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: {
    name: string;
    description?: string;
    basePoints?: number;
    pointWeight?: number;
  }) {
    return this.prisma.meetingCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        basePoints: dto.basePoints ?? 10,
        pointWeight: dto.pointWeight ?? 1.0,
      },
    });
  }

  async findAll(query?: { status?: MeetingStatus; categoryId?: string }) {
    const where: any = {};
    if (query?.status) where.status = query.status;
    if (query?.categoryId) where.categoryId = query.categoryId;

    return this.prisma.meeting.findMany({
      where,
      include: {
        category: true,
        _count: { select: { attendanceRecords: true } },
      },
      orderBy: { startTime: 'desc' },
    });
  }

  async findOpenAttendanceMeetings() {
    const now = new Date();
    return this.prisma.meeting.findMany({ where: { status: MeetingStatus.ACTIVE, attendanceOpenTime: { lte: now }, attendanceCloseTime: { gte: now } }, include: { category: true }, orderBy: { startTime: 'asc' } });
  }

  async findActiveMeeting() {
    const now = new Date();
    // Return currently active meeting or meeting within attendance window
    return this.prisma.meeting.findFirst({
      where: {
        status: MeetingStatus.ACTIVE,
        attendanceOpenTime: { lte: now },
        attendanceCloseTime: { gte: now },
      },
      include: { category: true, meetingSummary: true },
    });
  }

  async findOne(id: string, includeAttendance = true, memberId?: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        category: true,
        meetingSummary: true,
        eventResponses: includeAttendance ? { include: { member: { select: { firstName: true, lastName: true } } } } : { where: { memberId: memberId ?? '' } },
        attendanceRecords: includeAttendance ? {
          include: { member: true },
          orderBy: { actualArrivalTime: 'asc' },
        } : false,
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting with ID ${id} not found`);
    }

    if (includeAttendance) {
      const expectedCount = await this.prisma.member.count({where:{status:'ACTIVE',...(meeting.isCompulsory ? {} : {OR:[{eventResponses:{some:{meetingId:id,attending:true}}},{AND:[{eventResponses:{none:{meetingId:id}}},{serviceCommitments:{some:{meetingId:id,status:'COMMITTED'}}}]},{attendanceRecords:{some:{meetingId:id}}}]})}});
      return {...meeting,expectedCount};
    }
    return meeting;
  }

  async createMeeting(dto: {
    description?: string;
    title: string;
    categoryId: string;
    meetingDate: Date | string;
    startTime: Date | string;
    expectedArrivalTime: Date | string;
    attendanceOpenTime: Date | string;
    gracePeriodMinutes?: number;
    attendanceCloseTime: Date | string;
    endTime?: Date | string;
    locationName: string;
    latitude: number;
    longitude: number;
    geofenceRadiusMeters?: number;
    isCompulsory?: boolean;
    pointWeight?: number;
  }) {
    const qrSecret = null;
    const attendanceOpenTime = new Date(dto.attendanceOpenTime);
    const startTime = new Date(dto.startTime);
    const attendanceCloseTime = new Date(dto.attendanceCloseTime);
    const gracePeriodMinutes = dto.gracePeriodMinutes ?? 10;
    const dates = [dto.meetingDate, dto.expectedArrivalTime, dto.attendanceOpenTime, dto.startTime, dto.attendanceCloseTime, ...(dto.endTime ? [dto.endTime] : [])];
    if (dates.some(value => !Number.isFinite(new Date(value).getTime()))) throw new BadRequestException('Valid meeting dates are required');
    if (!Number.isFinite(dto.latitude) || Math.abs(dto.latitude) > 90 || !Number.isFinite(dto.longitude) || Math.abs(dto.longitude) > 180) throw new BadRequestException('Valid venue coordinates are required');
    if (dto.geofenceRadiusMeters !== undefined && (!Number.isFinite(dto.geofenceRadiusMeters) || dto.geofenceRadiusMeters <= 0)) throw new BadRequestException('Geofence radius must be positive');

    if (!Number.isInteger(gracePeriodMinutes) || gracePeriodMinutes < 0) {
      throw new BadRequestException('Grace period must be a non-negative whole number of minutes');
    }
    if (attendanceOpenTime > startTime || startTime > attendanceCloseTime) {
      throw new BadRequestException('Meeting times must satisfy attendance open ≤ start ≤ attendance close');
    }

    return this.prisma.meeting.create({
      data: {
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        meetingDate: new Date(dto.meetingDate),
        startTime,
        expectedArrivalTime: new Date(dto.expectedArrivalTime),
        attendanceOpenTime,
        gracePeriodMinutes,
        attendanceCloseTime,
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        locationName: dto.locationName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofenceRadiusMeters: dto.geofenceRadiusMeters ?? 100.0,
        isCompulsory: dto.isCompulsory ?? true,
        pointWeight: dto.pointWeight ?? 1.0,
        status: MeetingStatus.SCHEDULED,
        qrSecret,
      },
      include: { category: true },
    });
  }

  async updateStatus(id: string, status: MeetingStatus) {
    if (!Object.values(MeetingStatus).includes(status)) throw new BadRequestException('Invalid meeting status');
    const meeting = await this.findOne(id);
    if (meeting.status === MeetingStatus.CLOSED && status !== MeetingStatus.CLOSED) throw new BadRequestException('Closed meetings cannot be reopened');
    if (status === MeetingStatus.CLOSED) {
      if (meeting.status !== MeetingStatus.ACTIVE && meeting.status !== MeetingStatus.CLOSED) throw new BadRequestException('Only active meetings can be closed');
      await this.absenceProcessing.closeMeetingAndProcessAbsences(id);
      return this.findOne(id);
    }
    return this.prisma.meeting.update({
      where: { id },
      data: { status },
      include: { category: true },
    });
  }

  async createRecurringMeetings(dto: {
    title: string;
    categoryId: string;
    startDate: string;
    occurrencesCount: number;
    startTimeOfDay: string; // HH:mm format, e.g. "09:00"
    expectedArrivalOffsetMinutes: number; // e.g. -15 (8:45)
      attendanceOpenOffsetMinutes: number; // e.g. -45 (8:15)
    gracePeriodMinutes?: number;
    attendanceCloseOffsetMinutes: number; // e.g. 60 (10:00)
    locationName: string;
    latitude: number;
    longitude: number;
    geofenceRadiusMeters?: number;
    frequency: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
  }) {
    const createdMeetings = [];
    const baseDate = new Date(dto.startDate);

    for (let i = 0; i < dto.occurrencesCount; i++) {
      const currentDate = new Date(baseDate);

      if (dto.frequency === 'WEEKLY') {
        currentDate.setDate(baseDate.getDate() + i * 7);
      } else if (dto.frequency === 'FORTNIGHTLY') {
        currentDate.setDate(baseDate.getDate() + i * 14);
      } else if (dto.frequency === 'MONTHLY') {
        currentDate.setMonth(baseDate.getMonth() + i);
      }

      const [hours, minutes] = dto.startTimeOfDay.split(':').map(Number);
      const startTime = new Date(currentDate);
      startTime.setHours(hours, minutes, 0, 0);

      const expectedArrivalTime = new Date(
        startTime.getTime() + dto.expectedArrivalOffsetMinutes * 60000
      );
      const attendanceOpenTime = new Date(
        startTime.getTime() + dto.attendanceOpenOffsetMinutes * 60000
      );
      const attendanceCloseTime = new Date(
        startTime.getTime() + dto.attendanceCloseOffsetMinutes * 60000
      );

      const meeting = await this.createMeeting({
        title: `${dto.title} #${i + 1}`,
        categoryId: dto.categoryId,
        meetingDate: currentDate,
        startTime,
        expectedArrivalTime,
        attendanceOpenTime,
        gracePeriodMinutes: dto.gracePeriodMinutes,
        attendanceCloseTime,
        locationName: dto.locationName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofenceRadiusMeters: dto.geofenceRadiusMeters,
      });

      createdMeetings.push(meeting);
    }

    return createdMeetings;
  }
}
