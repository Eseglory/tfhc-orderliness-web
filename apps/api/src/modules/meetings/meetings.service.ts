import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeetingStatus } from '@tfhc/shared';
import * as crypto from 'crypto';

@Injectable()
export class MeetingsService {
  constructor(private prisma: PrismaService) {}

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

  async findOne(id: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        category: true,
        meetingSummary: true,
        attendanceRecords: {
          include: { member: true },
          orderBy: { actualArrivalTime: 'asc' },
        },
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting with ID ${id} not found`);
    }

    return meeting;
  }

  async createMeeting(dto: {
    title: string;
    categoryId: string;
    meetingDate: Date | string;
    startTime: Date | string;
    expectedArrivalTime: Date | string;
    attendanceOpenTime: Date | string;
    attendanceCloseTime: Date | string;
    endTime?: Date | string;
    locationName: string;
    latitude: number;
    longitude: number;
    geofenceRadiusMeters?: number;
    isCompulsory?: boolean;
    pointWeight?: number;
  }) {
    const qrSecret = crypto.randomBytes(16).toString('hex');

    return this.prisma.meeting.create({
      data: {
        title: dto.title,
        categoryId: dto.categoryId,
        meetingDate: new Date(dto.meetingDate),
        startTime: new Date(dto.startTime),
        expectedArrivalTime: new Date(dto.expectedArrivalTime),
        attendanceOpenTime: new Date(dto.attendanceOpenTime),
        attendanceCloseTime: new Date(dto.attendanceCloseTime),
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
    await this.findOne(id);
    return this.prisma.meeting.update({
      where: { id },
      data: { status },
      include: { category: true },
    });
  }

  async generateDynamicQrCode(id: string) {
    const meeting = await this.findOne(id);
    if (meeting.status !== MeetingStatus.ACTIVE) {
      throw new BadRequestException('Meeting attendance is not currently active');
    }

    const timestamp = Date.now();
    const qrSecret = meeting.qrSecret || 'tfhc-qr-default-secret';
    
    // HMAC signature over meetingId + timestamp
    const signature = crypto
      .createHmac('sha256', qrSecret)
      .update(`${meeting.id}:${timestamp}`)
      .digest('hex');

    const qrPayload = JSON.stringify({
      meetingId: meeting.id,
      timestamp,
      signature,
    });

    return {
      meetingId: meeting.id,
      qrPayload,
      timestamp,
      expiresInSeconds: 60,
    };
  }

  async createRecurringMeetings(dto: {
    title: string;
    categoryId: string;
    startDate: string;
    occurrencesCount: number;
    startTimeOfDay: string; // HH:mm format, e.g. "09:00"
    expectedArrivalOffsetMinutes: number; // e.g. -15 (8:45)
    attendanceOpenOffsetMinutes: number; // e.g. -45 (8:15)
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
