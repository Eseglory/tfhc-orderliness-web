import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { AppointmentStatus, AppointmentMode } from '@prisma/client';

export interface CreateAppointmentDto {
  title: string;
  serviceId?: string;
  memberId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  providerId?: string;
  providerName: string;
  providerEmail?: string;
  startTime: string; // ISO string
  endTime?: string; // ISO string (computed from duration if missing)
  durationMinutes?: number;
  mode?: AppointmentMode;
  location?: string;
  meetingUrl?: string;
  notes?: string;
  intakeNotes?: string;
}

export interface UpdateAppointmentDto extends Partial<CreateAppointmentDto> {
  status?: AppointmentStatus;
  cancellationReason?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly calendarService?: CalendarService,
  ) {}

  private generateReferenceCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const year = new Date().getFullYear();
    return `APP-${year}-${code}`;
  }

  async checkProviderConflict(
    providerId: string | null | undefined,
    startTime: Date,
    endTime: Date,
    excludeAppointmentId?: string,
  ): Promise<boolean> {
    if (!providerId) return false;

    const conflict = await this.prisma.appointment.findFirst({
      where: {
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        providerId,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        OR: [
          {
            startTime: { lte: startTime },
            endTime: { gt: startTime },
          },
          {
            startTime: { lt: endTime },
            endTime: { gte: endTime },
          },
          {
            startTime: { gte: startTime },
            endTime: { lte: endTime },
          },
        ],
      },
    });

    return !!conflict;
  }

  async findAll(params?: {
    search?: string;
    status?: AppointmentStatus;
    serviceId?: string;
    memberId?: string;
    providerId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params?.limit) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params?.status) where.status = params.status;
    if (params?.serviceId) where.serviceId = params.serviceId;
    if (params?.memberId) where.memberId = params.memberId;
    if (params?.providerId) where.providerId = params.providerId;

    if (params?.from || params?.to) {
      where.startTime = {};
      if (params.from) where.startTime.gte = new Date(params.from);
      if (params.to) where.startTime.lte = new Date(params.to);
    }

    if (params?.search) {
      const q = params.search.trim();
      where.OR = [
        { referenceCode: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { clientName: { contains: q, mode: 'insensitive' } },
        { clientEmail: { contains: q, mode: 'insensitive' } },
        { providerName: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ startTime: 'desc' }],
        include: {
          service: {
            select: { id: true, name: true, category: true, durationMinutes: true },
          },
          member: {
            select: { id: true, firstName: true, lastName: true, memberCode: true, phoneNumber: true },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(id: string, viewer?: { role?: string; memberId?: string; permissions?: string[] }) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        service: true,
        member: true,
      },
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment not found`);
    }

    if (viewer && viewer.role === 'MEMBER') {
      const isStaff = viewer.permissions?.some((p) => ['*', 'events.read', 'events.create'].includes(p));
      if (!isStaff && appointment.memberId !== viewer.memberId) {
        throw new ForbiddenException('You can only view your own appointments');
      }
    }

    return appointment;
  }

  async create(dto: CreateAppointmentDto, userId?: string) {
    if (!dto.clientName?.trim()) {
      throw new BadRequestException('Client name is required');
    }
    if (!dto.startTime) {
      throw new BadRequestException('Start time is required');
    }

    const start = new Date(dto.startTime);
    if (isNaN(start.getTime())) {
      throw new BadRequestException('Invalid start time format');
    }

    let duration = dto.durationMinutes ? Number(dto.durationMinutes) : 30;
    if (dto.serviceId) {
      const service = await this.prisma.organizationService.findUnique({
        where: { id: dto.serviceId },
      });
      if (service && !dto.durationMinutes) {
        duration = service.durationMinutes;
      }
    }

    const end = dto.endTime ? new Date(dto.endTime) : new Date(start.getTime() + duration * 60000);
    if (end <= start) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check provider conflict
    if (dto.providerId) {
      const hasConflict = await this.checkProviderConflict(dto.providerId, start, end);
      if (hasConflict) {
        throw new ConflictException(
          `The selected provider already has a confirmed or scheduled appointment during this time window (${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`,
        );
      }
    }

    let referenceCode = this.generateReferenceCode();
    let existingRef = await this.prisma.appointment.findUnique({ where: { referenceCode } });
    while (existingRef) {
      referenceCode = this.generateReferenceCode();
      existingRef = await this.prisma.appointment.findUnique({ where: { referenceCode } });
    }

    // Online meeting link generation if video conference
    let meetingUrl = dto.meetingUrl?.trim() || null;
    if (dto.mode === AppointmentMode.VIDEO_CONFERENCE && !meetingUrl) {
      const meetCode = `meet.google.com/${referenceCode.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)}-${referenceCode.toLowerCase().replace(/[^a-z0-9]/g, '').slice(3, 7)}-${referenceCode.toLowerCase().replace(/[^a-z0-9]/g, '').slice(7, 10) || 'ord'}`;
      meetingUrl = `https://${meetCode}`;
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        referenceCode,
        title: dto.title?.trim() || `Appointment with ${dto.providerName}`,
        serviceId: dto.serviceId || null,
        memberId: dto.memberId || null,
        clientName: dto.clientName.trim(),
        clientEmail: dto.clientEmail?.trim() || null,
        clientPhone: dto.clientPhone?.trim() || null,
        providerId: dto.providerId || null,
        providerName: dto.providerName.trim(),
        providerEmail: dto.providerEmail?.trim() || null,
        startTime: start,
        endTime: end,
        durationMinutes: duration,
        mode: dto.mode || AppointmentMode.IN_PERSON,
        location: dto.location?.trim() || (dto.mode === AppointmentMode.VIDEO_CONFERENCE ? 'Google Meet' : 'Office Suite'),
        meetingUrl,
        status: AppointmentStatus.CONFIRMED,
        notes: dto.notes?.trim() || null,
        intakeNotes: dto.intakeNotes?.trim() || null,
        createdById: userId || null,
      },
      include: {
        service: true,
        member: true,
      },
    });

    if (userId && this.calendarService) {
      this.calendarService.syncAppointmentToGoogle(userId, appointment.id).catch(() => {});
    }

    return appointment;
  }

  async update(id: string, dto: UpdateAppointmentDto, userId?: string) {
    const existing = await this.findById(id);

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.serviceId !== undefined) data.serviceId = dto.serviceId || null;
    if (dto.memberId !== undefined) data.memberId = dto.memberId || null;
    if (dto.clientName !== undefined) data.clientName = dto.clientName.trim();
    if (dto.clientEmail !== undefined) data.clientEmail = dto.clientEmail?.trim() || null;
    if (dto.clientPhone !== undefined) data.clientPhone = dto.clientPhone?.trim() || null;
    if (dto.providerId !== undefined) data.providerId = dto.providerId || null;
    if (dto.providerName !== undefined) data.providerName = dto.providerName.trim();
    if (dto.providerEmail !== undefined) data.providerEmail = dto.providerEmail?.trim() || null;
    if (dto.mode !== undefined) data.mode = dto.mode;
    if (dto.location !== undefined) data.location = dto.location?.trim() || null;
    if (dto.meetingUrl !== undefined) data.meetingUrl = dto.meetingUrl?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.intakeNotes !== undefined) data.intakeNotes = dto.intakeNotes?.trim() || null;
    if (dto.cancellationReason !== undefined) data.cancellationReason = dto.cancellationReason?.trim() || null;

    if (dto.startTime) {
      const start = new Date(dto.startTime);
      const duration = dto.durationMinutes || existing.durationMinutes;
      const end = dto.endTime ? new Date(dto.endTime) : new Date(start.getTime() + duration * 60000);

      const providerId = dto.providerId !== undefined ? dto.providerId : existing.providerId;
      if (providerId) {
        const hasConflict = await this.checkProviderConflict(providerId, start, end, id);
        if (hasConflict) {
          throw new ConflictException(`Provider conflict during requested rescheduled time window.`);
        }
      }

      data.startTime = start;
      data.endTime = end;
      data.durationMinutes = duration;
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data,
      include: {
        service: true,
        member: true,
      },
    });

    if (userId && this.calendarService) {
      this.calendarService.syncAppointmentToGoogle(userId, updated.id).catch(() => {});
    }

    return updated;
  }

  async reschedule(id: string, newStartTime: string, newEndTime?: string, reason?: string, userId?: string) {
    const existing = await this.findById(id);
    const start = new Date(newStartTime);
    if (isNaN(start.getTime())) {
      throw new BadRequestException('Invalid start time');
    }

    const end = newEndTime
      ? new Date(newEndTime)
      : new Date(start.getTime() + existing.durationMinutes * 60000);

    if (existing.providerId) {
      const hasConflict = await this.checkProviderConflict(existing.providerId, start, end, id);
      if (hasConflict) {
        throw new ConflictException('Provider is busy at the new requested time.');
      }
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        startTime: start,
        endTime: end,
        status: AppointmentStatus.SCHEDULED,
        notes: reason ? `${existing.notes ? existing.notes + '\n' : ''}Rescheduled: ${reason}` : existing.notes,
      },
      include: {
        service: true,
        member: true,
      },
    });

    if (userId && this.calendarService) {
      this.calendarService.syncAppointmentToGoogle(userId, updated.id).catch(() => {});
    }

    return updated;
  }

  async updateStatus(id: string, status: AppointmentStatus, cancellationReason?: string) {
    await this.findById(id);
    return this.prisma.appointment.update({
      where: { id },
      data: {
        status,
        cancellationReason: cancellationReason?.trim() || null,
      },
    });
  }

  async getAvailability(dateStr: string, providerId?: string, durationMinutes = 30) {
    const targetDate = new Date(dateStr);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date string');
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(9, 0, 0, 0); // 9:00 AM
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(17, 0, 0, 0); // 5:00 PM

    // Fetch existing appointments on that date
    const booked = await this.prisma.appointment.findMany({
      where: {
        providerId: providerId || undefined,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: { startTime: true, endTime: true, providerId: true, providerName: true },
    });

    const slots: { startTime: string; endTime: string; available: boolean }[] = [];
    let current = new Date(startOfDay);

    while (current.getTime() + durationMinutes * 60000 <= endOfDay.getTime()) {
      const slotStart = new Date(current);
      const slotEnd = new Date(current.getTime() + durationMinutes * 60000);

      const isConflict = booked.some(
        (b) =>
          (b.startTime <= slotStart && b.endTime > slotStart) ||
          (b.startTime < slotEnd && b.endTime >= slotEnd) ||
          (b.startTime >= slotStart && b.endTime <= slotEnd),
      );

      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        available: !isConflict,
      });

      current = new Date(current.getTime() + durationMinutes * 60000);
    }

    return {
      date: dateStr,
      providerId: providerId || null,
      durationMinutes,
      slots,
    };
  }
}
