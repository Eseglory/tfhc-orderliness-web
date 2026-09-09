import { AbsenceProcessingJob } from '../../jobs/absence-processing.job';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/rbac/audit.service';
import { MeetingStatus } from '@tfhc/shared';
import { canViewEvent, visibilityWhere, EventViewer } from '../../common/event-visibility';

interface AudienceInput {
  scope?: 'ALL_MEMBERS' | 'EXECUTIVES' | 'ADMINS' | null;
  memberId?: string | null;
  subTeamId?: string | null;
}

interface CreateMeetingDto {
  title: string;
  description?: string;
  categoryId: string;
  eventTypeId?: string;
  meetingDate: Date | string;
  startTime: Date | string;
  expectedArrivalTime: Date | string;
  attendanceOpenTime: Date | string;
  gracePeriodMinutes?: number;
  attendanceCloseTime: Date | string;
  endTime?: Date | string;
  allDay?: boolean;
  locationName: string;
  address?: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters?: number;
  isCompulsory?: boolean;
  pointWeight?: number;
  visibility?: 'PUBLIC' | 'RESTRICTED';
  organizerName?: string;
  coverImageUrl?: string;
  notes?: string;
  audiences?: AudienceInput[];
}

const EDITABLE_STATUSES: MeetingStatus[] = [MeetingStatus.SCHEDULED, MeetingStatus.ACTIVE];

@Injectable()
export class MeetingsService {
  constructor(
    private prisma: PrismaService,
    private absenceProcessing: AbsenceProcessingJob,
    private audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Viewer resolution
  // -------------------------------------------------------------------------

  private async viewerFor(isStaff: boolean, memberId?: string): Promise<EventViewer> {
    if (isStaff) return { isStaff: true };
    if (!memberId) return {};
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, subTeamId: true, roleInUnit: true },
    });
    return { memberId, subTeamId: member?.subTeamId ?? null, roleInUnit: member?.roleInUnit ?? null, isStaff: false };
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  getCategories() {
    return this.prisma.meetingCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  getEventTypes() {
    return this.prisma.eventType.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  createCategory(dto: { name: string; description?: string; basePoints?: number; pointWeight?: number }) {
    return this.prisma.meetingCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        basePoints: dto.basePoints ?? 10,
        pointWeight: dto.pointWeight ?? 1.0,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Member RSVP
  // -------------------------------------------------------------------------

  async respond(id: string, memberId: string | undefined, attending: unknown) {
    if (!memberId) throw new ForbiddenException('A member profile is required');
    if (typeof attending !== 'boolean') throw new BadRequestException('Choose attending or not attending');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM meetings WHERE id = ${id} FOR UPDATE`;
      const meeting = await tx.meeting.findUnique({ where: { id }, include: { audiences: true } });
      if (!meeting) throw new NotFoundException('Event not found');
      if (!['SCHEDULED', 'ACTIVE'].includes(meeting.status) || meeting.startTime <= new Date())
        throw new BadRequestException('Responses close when the event starts');
      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member || member.status !== 'ACTIVE') throw new ForbiddenException('Only active members can respond');
      if (
        !canViewEvent(meeting.visibility, meeting.audiences, {
          memberId,
          subTeamId: member.subTeamId,
          roleInUnit: member.roleInUnit,
        })
      ) {
        throw new ForbiddenException('This event is not available to you');
      }
      const response = await tx.eventResponse.upsert({
        where: { memberId_meetingId: { memberId, meetingId: id } },
        create: { memberId, meetingId: id, attending },
        update: { attending },
      });
      // Keep the richer invitation status in step where one exists.
      await tx.eventInvitation.updateMany({
        where: { meetingId: id, memberId },
        data: { status: attending ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
      });
      return response;
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async findAll(
    query: { status?: MeetingStatus; categoryId?: string; eventTypeId?: string; from?: string; to?: string; search?: string; includeArchived?: boolean } = {},
    isStaff = true,
    memberId?: string,
  ) {
    const viewer = await this.viewerFor(isStaff, memberId);
    const and: Prisma.MeetingWhereInput[] = [visibilityWhere(viewer)];
    if (query.status) and.push({ status: query.status });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.eventTypeId) and.push({ eventTypeId: query.eventTypeId });
    if (!query.includeArchived) and.push({ archivedAt: null });
    if (query.from) and.push({ startTime: { gte: new Date(query.from) } });
    if (query.to) and.push({ startTime: { lte: new Date(query.to) } });
    if (query.search?.trim())
      and.push({
        OR: [
          { title: { contains: query.search.trim(), mode: 'insensitive' } },
          { locationName: { contains: query.search.trim(), mode: 'insensitive' } },
        ],
      });

    return this.prisma.meeting.findMany({
      where: { AND: and },
      include: {
        category: true,
        eventType: true,
        _count: { select: { attendanceRecords: true, invitations: true } },
        ...(isStaff ? { audiences: { include: { member: { select: { firstName: true, lastName: true } }, subTeam: true } } } : {}),
      },
      orderBy: { startTime: 'desc' },
    });
  }

  async calendar(from: string, to: string, isStaff = true, memberId?: string) {
    const start = new Date(from);
    const end = new Date(to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
      throw new BadRequestException('Provide a valid from/to range');
    if (end.getTime() - start.getTime() > 400 * 86400000) throw new BadRequestException('Range too large (max ~13 months)');
    const viewer = await this.viewerFor(isStaff, memberId);

    const meetings = await this.prisma.meeting.findMany({
      where: {
        AND: [visibilityWhere(viewer), { archivedAt: null }, { startTime: { gte: start, lte: end } }],
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        allDay: true,
        status: true,
        locationName: true,
        isCompulsory: true,
        visibility: true,
        eventType: { select: { key: true, name: true, color: true, icon: true } },
        category: { select: { name: true } },
      },
      orderBy: { startTime: 'asc' },
    });
    return meetings;
  }

  async findOne(id: string, includeAttendance = true, memberId?: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        category: true,
        eventType: true,
        meetingSummary: true,
        audiences: includeAttendance
          ? { include: { member: { select: { firstName: true, lastName: true } }, subTeam: true } }
          : true,
        invitations: includeAttendance
          ? { include: { member: { select: { firstName: true, lastName: true } } } }
          : false,
        eventResponses: includeAttendance
          ? { include: { member: { select: { firstName: true, lastName: true } } } }
          : { where: { memberId: memberId ?? '' } },
        attendanceRecords: includeAttendance ? { include: { member: true }, orderBy: { actualArrivalTime: 'asc' } } : false,
      },
    });

    if (!meeting) throw new NotFoundException(`Meeting with ID ${id} not found`);

    if (!includeAttendance) {
      // Member view — enforce visibility.
      const member = memberId
        ? await this.prisma.member.findUnique({ where: { id: memberId }, select: { subTeamId: true, roleInUnit: true } })
        : null;
      if (
        !canViewEvent(meeting.visibility, meeting.audiences, {
          memberId,
          subTeamId: member?.subTeamId ?? null,
          roleInUnit: member?.roleInUnit ?? null,
        })
      ) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }
      return meeting;
    }

    const expectedCount = await this.prisma.member.count({
      where: {
        status: 'ACTIVE',
        ...(meeting.isCompulsory
          ? {}
          : {
              OR: [
                { eventResponses: { some: { meetingId: id, attending: true } } },
                {
                  AND: [
                    { eventResponses: { none: { meetingId: id } } },
                    { serviceCommitments: { some: { meetingId: id, status: 'COMMITTED' } } },
                  ],
                },
                { attendanceRecords: { some: { meetingId: id } } },
              ],
            }),
      },
    });
    return { ...meeting, expectedCount };
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  private validateTimes(dto: {
    meetingDate: Date | string;
    expectedArrivalTime: Date | string;
    attendanceOpenTime: Date | string;
    startTime: Date | string;
    attendanceCloseTime: Date | string;
    endTime?: Date | string;
    latitude: number;
    longitude: number;
    geofenceRadiusMeters?: number;
    gracePeriodMinutes: number;
  }) {
    const dates = [
      dto.meetingDate,
      dto.expectedArrivalTime,
      dto.attendanceOpenTime,
      dto.startTime,
      dto.attendanceCloseTime,
      ...(dto.endTime ? [dto.endTime] : []),
    ];
    if (dates.some((value) => !Number.isFinite(new Date(value).getTime())))
      throw new BadRequestException('Valid event dates are required');
    if (!Number.isFinite(dto.latitude) || Math.abs(dto.latitude) > 90 || !Number.isFinite(dto.longitude) || Math.abs(dto.longitude) > 180)
      throw new BadRequestException('Valid venue coordinates are required');
    if (dto.geofenceRadiusMeters !== undefined && (!Number.isFinite(dto.geofenceRadiusMeters) || dto.geofenceRadiusMeters <= 0))
      throw new BadRequestException('Geofence radius must be positive');
    if (!Number.isInteger(dto.gracePeriodMinutes) || dto.gracePeriodMinutes < 0)
      throw new BadRequestException('Grace period must be a non-negative whole number of minutes');
    if (new Date(dto.attendanceOpenTime) > new Date(dto.startTime) || new Date(dto.startTime) > new Date(dto.attendanceCloseTime))
      throw new BadRequestException('Event times must satisfy attendance open ≤ start ≤ attendance close');
  }

  private async resolveAudiences(audiences: AudienceInput[] | undefined, visibility: 'PUBLIC' | 'RESTRICTED') {
    if (visibility !== 'RESTRICTED') return [];
    const rows = (audiences ?? []).filter((a) => a && (a.scope || a.memberId || a.subTeamId));
    if (rows.length === 0) throw new BadRequestException('A restricted event needs at least one audience (member, sub-team or group)');
    const memberIds = [...new Set(rows.filter((r) => r.memberId).map((r) => r.memberId!))];
    const subTeamIds = [...new Set(rows.filter((r) => r.subTeamId).map((r) => r.subTeamId!))];
    if (memberIds.length) {
      const found = await this.prisma.member.count({ where: { id: { in: memberIds } } });
      if (found !== memberIds.length) throw new BadRequestException('One or more selected members do not exist');
    }
    if (subTeamIds.length) {
      const found = await this.prisma.subTeam.count({ where: { id: { in: subTeamIds } } });
      if (found !== subTeamIds.length) throw new BadRequestException('One or more selected sub-teams do not exist');
    }
    return rows.map((r) => ({
      scope: r.scope ?? null,
      memberId: r.memberId ?? null,
      subTeamId: r.subTeamId ?? null,
    }));
  }

  async createMeeting(dto: CreateMeetingDto, actorUserId?: string) {
    const gracePeriodMinutes = dto.gracePeriodMinutes ?? 10;
    this.validateTimes({ ...dto, gracePeriodMinutes });

    const category = await this.prisma.meetingCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Unknown event category');

    const eventTypeId = dto.eventTypeId ?? null;
    let compulsoryDefault = dto.isCompulsory;
    if (eventTypeId) {
      const type = await this.prisma.eventType.findUnique({ where: { id: eventTypeId } });
      if (!type || !type.active) throw new BadRequestException('Unknown or inactive event type');
      if (compulsoryDefault === undefined) compulsoryDefault = type.defaultCompulsory;
    }

    const visibility = dto.visibility === 'RESTRICTED' ? 'RESTRICTED' : 'PUBLIC';
    const audiences = await this.resolveAudiences(dto.audiences, visibility);

    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        categoryId: dto.categoryId,
        eventTypeId,
        meetingDate: new Date(dto.meetingDate),
        startTime: new Date(dto.startTime),
        expectedArrivalTime: new Date(dto.expectedArrivalTime),
        attendanceOpenTime: new Date(dto.attendanceOpenTime),
        gracePeriodMinutes,
        attendanceCloseTime: new Date(dto.attendanceCloseTime),
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        allDay: Boolean(dto.allDay),
        locationName: dto.locationName,
        address: dto.address || null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofenceRadiusMeters: dto.geofenceRadiusMeters ?? 100.0,
        isCompulsory: compulsoryDefault ?? true,
        pointWeight: dto.pointWeight ?? 1.0,
        visibility,
        organizerName: dto.organizerName || null,
        coverImageUrl: dto.coverImageUrl || null,
        notes: dto.notes || null,
        status: MeetingStatus.SCHEDULED,
        qrSecret: null,
        createdById: actorUserId ?? null,
        audiences: audiences.length ? { create: audiences } : undefined,
      },
      include: { category: true, eventType: true, audiences: true },
    });

    if (actorUserId)
      await this.audit.record({
        actorUserId,
        action: 'EVENT_CREATED',
        entity: 'Meeting',
        entityId: meeting.id,
        newData: { title: meeting.title, startTime: meeting.startTime, visibility, eventTypeId },
      });
    return meeting;
  }

  async updateMeeting(id: string, dto: Partial<CreateMeetingDto> & { status?: never }, actorUserId: string) {
    const existing = await this.prisma.meeting.findUnique({ where: { id }, include: { audiences: true } });
    if (!existing) throw new NotFoundException('Event not found');
    if (!EDITABLE_STATUSES.includes(existing.status as MeetingStatus))
      throw new BadRequestException(`A ${existing.status.toLowerCase()} event can no longer be edited`);

    const merged = {
      meetingDate: dto.meetingDate ?? existing.meetingDate,
      expectedArrivalTime: dto.expectedArrivalTime ?? existing.expectedArrivalTime,
      attendanceOpenTime: dto.attendanceOpenTime ?? existing.attendanceOpenTime,
      startTime: dto.startTime ?? existing.startTime,
      attendanceCloseTime: dto.attendanceCloseTime ?? existing.attendanceCloseTime,
      endTime: dto.endTime ?? existing.endTime ?? undefined,
      latitude: dto.latitude ?? existing.latitude,
      longitude: dto.longitude ?? existing.longitude,
      geofenceRadiusMeters: dto.geofenceRadiusMeters ?? existing.geofenceRadiusMeters,
      gracePeriodMinutes: dto.gracePeriodMinutes ?? existing.gracePeriodMinutes,
    };
    this.validateTimes(merged);

    if (dto.eventTypeId) {
      const type = await this.prisma.eventType.findUnique({ where: { id: dto.eventTypeId } });
      if (!type || !type.active) throw new BadRequestException('Unknown or inactive event type');
    }

    const visibility = (dto.visibility ?? existing.visibility) as 'PUBLIC' | 'RESTRICTED';
    const audienceChange = dto.audiences !== undefined || dto.visibility !== undefined;
    const audiences = audienceChange ? await this.resolveAudiences(dto.audiences ?? existing.audiences, visibility) : null;

    const data: Prisma.MeetingUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      ...(dto.categoryId ? { category: { connect: { id: dto.categoryId } } } : {}),
      ...(dto.eventTypeId ? { eventType: { connect: { id: dto.eventTypeId } } } : {}),
      ...(dto.meetingDate ? { meetingDate: new Date(dto.meetingDate) } : {}),
      ...(dto.startTime ? { startTime: new Date(dto.startTime) } : {}),
      ...(dto.expectedArrivalTime ? { expectedArrivalTime: new Date(dto.expectedArrivalTime) } : {}),
      ...(dto.attendanceOpenTime ? { attendanceOpenTime: new Date(dto.attendanceOpenTime) } : {}),
      ...(dto.attendanceCloseTime ? { attendanceCloseTime: new Date(dto.attendanceCloseTime) } : {}),
      ...(dto.endTime !== undefined ? { endTime: dto.endTime ? new Date(dto.endTime) : null } : {}),
      ...(dto.allDay !== undefined ? { allDay: Boolean(dto.allDay) } : {}),
      ...(dto.gracePeriodMinutes !== undefined ? { gracePeriodMinutes: dto.gracePeriodMinutes } : {}),
      ...(dto.locationName !== undefined ? { locationName: dto.locationName } : {}),
      ...(dto.address !== undefined ? { address: dto.address || null } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.geofenceRadiusMeters !== undefined ? { geofenceRadiusMeters: dto.geofenceRadiusMeters } : {}),
      ...(dto.isCompulsory !== undefined ? { isCompulsory: Boolean(dto.isCompulsory) } : {}),
      ...(dto.pointWeight !== undefined ? { pointWeight: dto.pointWeight } : {}),
      ...(dto.visibility !== undefined ? { visibility } : {}),
      ...(dto.organizerName !== undefined ? { organizerName: dto.organizerName || null } : {}),
      ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl || null } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (audiences) {
        await tx.eventAudience.deleteMany({ where: { meetingId: id } });
        if (audiences.length) await tx.eventAudience.createMany({ data: audiences.map((a) => ({ ...a, meetingId: id })) });
      }
      return tx.meeting.update({ where: { id }, data, include: { category: true, eventType: true, audiences: true } });
    });

    await this.audit.record({
      actorUserId,
      action: 'EVENT_UPDATED',
      entity: 'Meeting',
      entityId: id,
      previousData: { title: existing.title, startTime: existing.startTime, visibility: existing.visibility },
      newData: { title: updated.title, startTime: updated.startTime, visibility: updated.visibility },
    });
    return updated;
  }

  async duplicateMeeting(id: string, overrides: { startTime?: string; title?: string }, actorUserId: string) {
    const src = await this.prisma.meeting.findUnique({ where: { id }, include: { audiences: true } });
    if (!src) throw new NotFoundException('Event not found');

    const shift = overrides.startTime
      ? new Date(overrides.startTime).getTime() - src.startTime.getTime()
      : 7 * 86400000;
    const move = (d: Date | null) => (d ? new Date(d.getTime() + shift) : null);

    const copy = await this.prisma.meeting.create({
      data: {
        title: overrides.title?.trim() || `${src.title} (copy)`,
        description: src.description,
        categoryId: src.categoryId,
        eventTypeId: src.eventTypeId,
        meetingDate: move(src.meetingDate)!,
        startTime: move(src.startTime)!,
        expectedArrivalTime: move(src.expectedArrivalTime)!,
        attendanceOpenTime: move(src.attendanceOpenTime)!,
        gracePeriodMinutes: src.gracePeriodMinutes,
        attendanceCloseTime: move(src.attendanceCloseTime)!,
        endTime: move(src.endTime),
        allDay: src.allDay,
        locationName: src.locationName,
        address: src.address,
        latitude: src.latitude,
        longitude: src.longitude,
        geofenceRadiusMeters: src.geofenceRadiusMeters,
        isCompulsory: src.isCompulsory,
        pointWeight: src.pointWeight,
        visibility: src.visibility,
        organizerName: src.organizerName,
        notes: src.notes,
        status: MeetingStatus.SCHEDULED,
        createdById: actorUserId,
        audiences: src.audiences.length
          ? { create: src.audiences.map((a) => ({ scope: a.scope, memberId: a.memberId, subTeamId: a.subTeamId })) }
          : undefined,
      },
      include: { category: true, eventType: true },
    });
    await this.audit.record({
      actorUserId,
      action: 'EVENT_DUPLICATED',
      entity: 'Meeting',
      entityId: copy.id,
      newData: { from: id, title: copy.title },
    });
    return copy;
  }

  async cancelMeeting(id: string, reason: string | undefined, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Event not found');
    if (meeting.status === MeetingStatus.CLOSED) throw new BadRequestException('A closed event cannot be cancelled');
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: MeetingStatus.CANCELLED, cancelReason: reason?.trim() || null },
      include: { category: true, eventType: true },
    });
    await this.audit.record({
      actorUserId,
      action: 'EVENT_CANCELLED',
      entity: 'Meeting',
      entityId: id,
      reason: reason?.trim() || null,
    });
    return updated;
  }

  async setArchived(id: string, archived: boolean, actorUserId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Event not found');
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      include: { category: true, eventType: true },
    });
    await this.audit.record({
      actorUserId,
      action: archived ? 'EVENT_ARCHIVED' : 'EVENT_RESTORED',
      entity: 'Meeting',
      entityId: id,
    });
    return updated;
  }

  async findOpenAttendanceMeetings() {
    const now = new Date();
    return this.prisma.meeting.findMany({
      where: { status: MeetingStatus.ACTIVE, attendanceOpenTime: { lte: now }, attendanceCloseTime: { gte: now } },
      include: { category: true, eventType: true },
      orderBy: { startTime: 'asc' },
    });
  }

  async findActiveMeeting() {
    const now = new Date();
    return this.prisma.meeting.findFirst({
      where: { status: MeetingStatus.ACTIVE, attendanceOpenTime: { lte: now }, attendanceCloseTime: { gte: now } },
      include: { category: true, eventType: true, meetingSummary: true },
    });
  }

  async updateStatus(id: string, status: MeetingStatus, actorUserId?: string) {
    if (!Object.values(MeetingStatus).includes(status)) throw new BadRequestException('Invalid meeting status');
    const meeting = await this.findOne(id);
    if (meeting.status === MeetingStatus.CLOSED && status !== MeetingStatus.CLOSED)
      throw new BadRequestException('Closed meetings cannot be reopened');
    if (status === MeetingStatus.CLOSED) {
      if (meeting.status !== MeetingStatus.ACTIVE && meeting.status !== MeetingStatus.CLOSED)
        throw new BadRequestException('Only active meetings can be closed');
      await this.absenceProcessing.closeMeetingAndProcessAbsences(id);
      return this.findOne(id);
    }
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status },
      include: { category: true, eventType: true },
    });
    if (actorUserId)
      await this.audit.record({
        actorUserId,
        action: 'EVENT_STATUS_CHANGED',
        entity: 'Meeting',
        entityId: id,
        previousData: { status: meeting.status },
        newData: { status },
      });
    return updated;
  }

  async createRecurringMeetings(dto: {
    title: string;
    categoryId: string;
    eventTypeId?: string;
    startDate: string;
    occurrencesCount: number;
    startTimeOfDay: string;
    expectedArrivalOffsetMinutes: number;
    attendanceOpenOffsetMinutes: number;
    gracePeriodMinutes?: number;
    attendanceCloseOffsetMinutes: number;
    locationName: string;
    latitude: number;
    longitude: number;
    geofenceRadiusMeters?: number;
    frequency: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
    visibility?: 'PUBLIC' | 'RESTRICTED';
    audiences?: AudienceInput[];
  }, actorUserId?: string) {
    if (!Number.isInteger(dto.occurrencesCount) || dto.occurrencesCount < 1 || dto.occurrencesCount > 104)
      throw new BadRequestException('Occurrences must be between 1 and 104');
    const createdMeetings = [];
    const baseDate = new Date(dto.startDate);

    for (let i = 0; i < dto.occurrencesCount; i++) {
      const currentDate = new Date(baseDate);
      if (dto.frequency === 'WEEKLY') currentDate.setDate(baseDate.getDate() + i * 7);
      else if (dto.frequency === 'FORTNIGHTLY') currentDate.setDate(baseDate.getDate() + i * 14);
      else if (dto.frequency === 'MONTHLY') currentDate.setMonth(baseDate.getMonth() + i);

      const [hours, minutes] = dto.startTimeOfDay.split(':').map(Number);
      const startTime = new Date(currentDate);
      startTime.setHours(hours, minutes, 0, 0);

      const meeting = await this.createMeeting(
        {
          title: `${dto.title} #${i + 1}`,
          categoryId: dto.categoryId,
          eventTypeId: dto.eventTypeId,
          meetingDate: currentDate,
          startTime,
          expectedArrivalTime: new Date(startTime.getTime() + dto.expectedArrivalOffsetMinutes * 60000),
          attendanceOpenTime: new Date(startTime.getTime() + dto.attendanceOpenOffsetMinutes * 60000),
          gracePeriodMinutes: dto.gracePeriodMinutes,
          attendanceCloseTime: new Date(startTime.getTime() + dto.attendanceCloseOffsetMinutes * 60000),
          locationName: dto.locationName,
          latitude: dto.latitude,
          longitude: dto.longitude,
          geofenceRadiusMeters: dto.geofenceRadiusMeters,
          visibility: dto.visibility,
          audiences: dto.audiences,
        },
        actorUserId,
      );
      createdMeetings.push(meeting);
    }
    return createdMeetings;
  }
}
