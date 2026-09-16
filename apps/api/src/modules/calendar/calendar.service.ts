import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { CalendarEventPayload } from './providers/calendar-provider.interface';
import { google } from 'googleapis';
import { CalendarSyncStatus } from '@prisma/client';
import { visibilityWhere, EventViewer } from '../../common/event-visibility';

export interface UnifiedCalendarItem {
  id: string;
  originalId: string;
  domainType: 'EVENT' | 'MEETING' | 'APPOINTMENT' | 'OPERATIONS';
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date | null;
  locationName: string;
  meetingUrl?: string | null;
  status: string;
  isCompulsory?: boolean;
  visibility?: string;
  isRecurring: boolean;
  categoryName: string;
  eventTypeName?: string;
  eventTypeKey?: string;
  clientName?: string;
  providerName?: string;
  color: string;
  googleSynced?: boolean;
  googleHtmlLink?: string | null;
  attendeesCount?: number;
  raw: any;
}

export interface ConflictCheckItem {
  hasConflict: boolean;
  conflictingItems: {
    id: string;
    title: string;
    domainType: string;
    startTime: Date;
    endTime: Date;
  }[];
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private googleProvider: GoogleCalendarProvider,
    private cache: CacheService,
  ) {}

  private getOAuth2Client() {
    const clientId =
      this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ||
      (this.config.get<string>('GOOGLE_OAUTH_CLIENT_IDS') || '').split(',')[0].trim();
    const clientSecret = this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') || 'GOCSPX-dummy-secret-if-implicit';
    const baseUrl =
      this.config.get<string>('APP_WEB_URL') ||
      (this.config.get<string>('CORS_ORIGIN') || '').split(',')[0].trim() ||
      'https://tfhc-orderliness-web.vercel.app';
    const redirectUri =
      this.config.get<string>('GOOGLE_CALENDAR_REDIRECT_URI') ||
      `${baseUrl.replace(/\/+$/, '')}/admin/settings?tab=integrations&google_calendar=callback`;

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  // ---------------------------------------------------------------------------
  // Google OAuth 2.0 Integration Management
  // ---------------------------------------------------------------------------

  getAuthUrl(userId: string, statePrefix?: string) {
    const oauth2Client = this.getOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const state = JSON.stringify({
      userId,
      nonce: Math.random().toString(36).substring(2),
      prefix: statePrefix || 'admin',
    });

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state: Buffer.from(state).toString('base64'),
    });
  }

  async connectAccount(userId: string, code: string) {
    const oauth2Client = this.getOAuth2Client();
    let tokens;
    try {
      const response = await oauth2Client.getToken(code);
      tokens = response.tokens;
    } catch (err: any) {
      this.logger.error(`Failed to exchange Google OAuth code: ${err?.message || err}`);
      throw new BadRequestException('Failed to authenticate with Google. The authorization code may have expired.');
    }

    if (!tokens.access_token) {
      throw new BadRequestException('Google did not return a valid access token.');
    }

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get().catch(() => null);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const googleEmail = userInfo?.data?.email || user?.email || 'authenticated-user';

    const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

    const integration = await this.prisma.googleCalendarIntegration.upsert({
      where: { userId },
      create: {
        userId,
        googleEmail,
        calendarId: 'primary',
        calendarSummary: `${googleEmail} (Primary)`,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        tokenExpiresAt: expiresAt,
        scope: tokens.scope || 'https://www.googleapis.com/auth/calendar',
        syncStatus: CalendarSyncStatus.SYNCED,
        lastSyncedAt: new Date(),
      },
      update: {
        googleEmail,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        tokenExpiresAt: expiresAt,
        syncStatus: CalendarSyncStatus.SYNCED,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    return {
      connected: true,
      googleEmail: integration.googleEmail,
      calendarId: integration.calendarId,
      lastSyncedAt: integration.lastSyncedAt,
      syncStatus: integration.syncStatus,
    };
  }

  async getIntegrationStatus(userId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { userId },
      include: {
        _count: { select: { eventMappings: true } },
      },
    });

    if (!integration) {
      return {
        connected: false,
        syncStatus: 'NOT_CONNECTED',
      };
    }

    return {
      connected: true,
      id: integration.id,
      googleEmail: integration.googleEmail,
      calendarId: integration.calendarId,
      calendarSummary: integration.calendarSummary,
      syncStatus: integration.syncStatus,
      lastSyncedAt: integration.lastSyncedAt,
      lastError: integration.lastError,
      autoSyncMeetings: integration.autoSyncMeetings,
      autoSyncEvents: integration.autoSyncEvents,
      autoSyncAppointments: integration.autoSyncAppointments,
      syncedEventsCount: integration._count.eventMappings,
    };
  }

  async disconnect(userId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({ where: { userId } });
    if (!integration) return { success: true };

    // Revoke token with Google if possible
    if (integration.accessToken) {
      try {
        const oauth2Client = this.getOAuth2Client();
        await oauth2Client.revokeToken(integration.accessToken);
      } catch (err) {
        this.logger.warn(`Could not revoke token with Google for user ${userId}: ${err}`);
      }
    }

    await this.prisma.googleCalendarIntegration.delete({ where: { userId } });
    return { success: true, message: 'Google Calendar disconnected. Internal records have been preserved.' };
  }

  async getValidAccessToken(integrationId: string): Promise<string> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: integrationId },
    });
    if (!integration) throw new NotFoundException('Google integration not found');

    if (integration.tokenExpiresAt.getTime() > Date.now() + 60000) {
      return integration.accessToken;
    }

    if (!integration.refreshToken) {
      throw new UnauthorizedException('Google Calendar session expired. Please re-authorize Google Calendar.');
    }

    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: integration.refreshToken });

    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      const newTokens = refreshed.credentials;
      const newExpiresAt = new Date(newTokens.expiry_date || Date.now() + 3600 * 1000);

      await this.prisma.googleCalendarIntegration.update({
        where: { id: integrationId },
        data: {
          accessToken: newTokens.access_token!,
          tokenExpiresAt: newExpiresAt,
          lastSyncedAt: new Date(),
        },
      });

      return newTokens.access_token!;
    } catch (err: any) {
      await this.prisma.googleCalendarIntegration.update({
        where: { id: integrationId },
        data: {
          syncStatus: CalendarSyncStatus.FAILED,
          lastError: 'Token refresh failed: ' + (err?.message || err),
        },
      });
      throw new UnauthorizedException('Google Calendar refresh token revoked or expired.');
    }
  }

  // ---------------------------------------------------------------------------
  // Sync Internal Entities to Google Calendar
  // ---------------------------------------------------------------------------

  async syncMeetingToGoogle(userId: string, meetingId: string): Promise<any> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });
    if (!integration) return null;

    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        category: true,
        eventType: true,
        invitations: {
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                user: { select: { email: true } },
                approvedMember: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const accessToken = await this.getValidAccessToken(integration.id);

    // Build attendees
    const attendees = (meeting.invitations || [])
      .map((inv) => {
        const email = inv.member?.user?.email || inv.member?.approvedMember?.email;
        if (!email) return null;
        return {
          email,
          displayName: `${inv.member.firstName} ${inv.member.lastName}`.trim(),
          responseStatus: (inv.status === 'ACCEPTED' ? 'accepted' : inv.status === 'DECLINED' ? 'declined' : 'needsAction') as any,
        };
      })
      .filter((a): a is { email: string; displayName: string; responseStatus: any } => Boolean(a));

    const isOnline = meeting.locationName?.toLowerCase().includes('google meet') || meeting.locationName?.toLowerCase().includes('online');

    const payload: CalendarEventPayload = {
      title: meeting.title,
      description: meeting.description || undefined,
      startTime: meeting.startTime,
      endTime: meeting.endTime || new Date(meeting.startTime.getTime() + 60 * 60000),
      location: meeting.locationName,
      isOnline,
      conferenceType: isOnline ? 'GOOGLE_MEET' : undefined,
      attendees,
    };

    const existingMapping = await this.prisma.externalCalendarEventMapping.findUnique({
      where: {
        integrationId_entityType_entityId: {
          integrationId: integration.id,
          entityType: 'MEETING',
          entityId: meetingId,
        },
      },
    });

    let syncResult;
    if (existingMapping) {
      syncResult = await this.googleProvider.updateEvent(
        { accessToken, calendarId: integration.calendarId },
        existingMapping.externalEventId,
        payload,
      );
      await this.prisma.externalCalendarEventMapping.update({
        where: { id: existingMapping.id },
        data: {
          meetingUrl: syncResult.meetingUrl || existingMapping.meetingUrl,
          externalHtmlLink: syncResult.externalHtmlLink || existingMapping.externalHtmlLink,
          etag: syncResult.etag,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      syncResult = await this.googleProvider.createEvent(
        { accessToken, calendarId: integration.calendarId },
        payload,
      );
      await this.prisma.externalCalendarEventMapping.create({
        data: {
          integrationId: integration.id,
          entityType: 'MEETING',
          entityId: meetingId,
          externalEventId: syncResult.externalEventId,
          externalHtmlLink: syncResult.externalHtmlLink,
          meetingUrl: syncResult.meetingUrl,
          etag: syncResult.etag,
        },
      });
    }

    return syncResult;
  }

  async syncAppointmentToGoogle(userId: string, appointmentId: string): Promise<any> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({ where: { userId } });
    if (!integration) return null;

    const app = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true },
    });
    if (!app) throw new NotFoundException('Appointment not found');

    const accessToken = await this.getValidAccessToken(integration.id);

    const attendees = [];
    if (app.clientEmail) {
      attendees.push({ email: app.clientEmail, displayName: app.clientName });
    }
    if (app.providerEmail) {
      attendees.push({ email: app.providerEmail, displayName: app.providerName });
    }

    const isOnline = app.mode === 'VIDEO_CONFERENCE';

    const payload: CalendarEventPayload = {
      title: `${app.title} - ${app.clientName}`,
      description: `Service: ${app.service?.name || 'Appointment'}\nReference: ${app.referenceCode}\nNotes: ${app.notes || 'None'}`,
      startTime: app.startTime,
      endTime: app.endTime,
      location: app.location || (isOnline ? 'Google Meet' : 'Office'),
      isOnline,
      conferenceType: isOnline ? 'GOOGLE_MEET' : undefined,
      attendees,
    };

    const existingMapping = await this.prisma.externalCalendarEventMapping.findUnique({
      where: {
        integrationId_entityType_entityId: {
          integrationId: integration.id,
          entityType: 'APPOINTMENT',
          entityId: appointmentId,
        },
      },
    });

    let syncResult;
    if (existingMapping) {
      syncResult = await this.googleProvider.updateEvent(
        { accessToken, calendarId: integration.calendarId },
        existingMapping.externalEventId,
        payload,
      );
      await this.prisma.externalCalendarEventMapping.update({
        where: { id: existingMapping.id },
        data: {
          meetingUrl: syncResult.meetingUrl || existingMapping.meetingUrl,
          externalHtmlLink: syncResult.externalHtmlLink || existingMapping.externalHtmlLink,
          etag: syncResult.etag,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      syncResult = await this.googleProvider.createEvent(
        { accessToken, calendarId: integration.calendarId },
        payload,
      );
      await this.prisma.externalCalendarEventMapping.create({
        data: {
          integrationId: integration.id,
          entityType: 'APPOINTMENT',
          entityId: appointmentId,
          externalEventId: syncResult.externalEventId,
          externalHtmlLink: syncResult.externalHtmlLink,
          meetingUrl: syncResult.meetingUrl,
          etag: syncResult.etag,
        },
      });
    }

    if (syncResult.meetingUrl && !app.meetingUrl) {
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { meetingUrl: syncResult.meetingUrl },
      });
    }

    return syncResult;
  }

  // ---------------------------------------------------------------------------
  // Conflict Detection Engine
  // ---------------------------------------------------------------------------

  async checkConflicts(query: {
    startTime: string | Date;
    endTime: string | Date;
    excludeId?: string;
    providerId?: string;
    memberId?: string;
  }): Promise<ConflictCheckItem> {
    const start = new Date(query.startTime);
    const end = new Date(query.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end time for conflict check');
    }

    const [overlappingMeetings, overlappingAppointments] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          id: query.excludeId ? { not: query.excludeId } : undefined,
          startTime: { lt: end },
          OR: [
            { endTime: { gt: start } },
            { endTime: null, startTime: { gte: new Date(start.getTime() - 60 * 60000) } },
          ],
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          eventType: { select: { key: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          id: query.excludeId ? { not: query.excludeId } : undefined,
          startTime: { lt: end },
          endTime: { gt: start },
          ...(query.providerId ? { providerId: query.providerId } : {}),
          ...(query.memberId ? { memberId: query.memberId } : {}),
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          clientName: true,
          providerName: true,
        },
      }),
    ]);

    const conflictingItems = [
      ...overlappingMeetings.map((m) => ({
        id: m.id,
        title: m.title,
        domainType: m.eventType?.key ? 'EVENT' : 'MEETING',
        startTime: m.startTime,
        endTime: m.endTime || new Date(m.startTime.getTime() + 60 * 60000),
      })),
      ...overlappingAppointments.map((a) => ({
        id: a.id,
        title: `${a.title} (${a.clientName})`,
        domainType: 'APPOINTMENT',
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    ];

    return {
      hasConflict: conflictingItems.length > 0,
      conflictingItems,
    };
  }

  // ---------------------------------------------------------------------------
  // Universal Reschedule (Drag-and-Drop / Form Reschedule)
  // ---------------------------------------------------------------------------

  async rescheduleEntity(
    userId: string,
    dto: {
      entityType: 'MEETING' | 'EVENT' | 'APPOINTMENT';
      entityId: string;
      newStartTime: string | Date;
      newEndTime?: string | Date;
      reason?: string;
    },
  ) {
    const start = new Date(dto.newStartTime);
    if (isNaN(start.getTime())) throw new BadRequestException('Invalid new start time');

    if (dto.entityType === 'APPOINTMENT') {
      const app = await this.prisma.appointment.findUnique({ where: { id: dto.entityId } });
      if (!app) throw new NotFoundException('Appointment not found');

      const durationMs = app.durationMinutes * 60000;
      const end = dto.newEndTime ? new Date(dto.newEndTime) : new Date(start.getTime() + durationMs);

      // Check conflict for provider
      if (app.providerId) {
        const conflict = await this.checkConflicts({
          startTime: start,
          endTime: end,
          excludeId: app.id,
          providerId: app.providerId,
        });
        if (conflict.hasConflict) {
          throw new BadRequestException(`Provider is already booked during this time: ${conflict.conflictingItems[0].title}`);
        }
      }

      const updated = await this.prisma.appointment.update({
        where: { id: dto.entityId },
        data: {
          startTime: start,
          endTime: end,
          notes: dto.reason ? `${app.notes || ''}\nRescheduled: ${dto.reason}`.trim() : app.notes,
        },
      });

      // Sync to Google
      await this.syncAppointmentToGoogle(userId, app.id).catch((err) =>
        this.logger.warn(`Could not sync rescheduled appointment ${app.id} to Google: ${err}`),
      );

      return updated;
    } else {
      // MEETING or EVENT
      const meeting = await this.prisma.meeting.findUnique({ where: { id: dto.entityId } });
      if (!meeting) throw new NotFoundException('Meeting or event not found');

      const originalDurationMs =
        meeting.endTime && meeting.startTime
          ? meeting.endTime.getTime() - meeting.startTime.getTime()
          : 60 * 60000;
      const end = dto.newEndTime ? new Date(dto.newEndTime) : new Date(start.getTime() + originalDurationMs);

      const updated = await this.prisma.meeting.update({
        where: { id: dto.entityId },
        data: {
          startTime: start,
          endTime: end,
          meetingDate: start,
          attendanceOpenTime: new Date(start.getTime() - 15 * 60000),
          expectedArrivalTime: start,
          attendanceCloseTime: end,
        },
      });

      // Sync to Google
      await this.syncMeetingToGoogle(userId, meeting.id).catch((err) =>
        this.logger.warn(`Could not sync rescheduled meeting ${meeting.id} to Google: ${err}`),
      );

      this.cache.invalidateTags(['calendar', 'meetings']);
      return updated;
    }
  }

  // ---------------------------------------------------------------------------
  // Unified Calendar Feed Aggregator
  // ---------------------------------------------------------------------------

  async getUnifiedFeed(
    from: string | Date,
    to: string | Date,
    isStaff = true,
    memberId?: string,
  ): Promise<UnifiedCalendarItem[]> {
    const key = `calendar:feed:${from}:${to}:${isStaff}:${memberId || 'all'}`;
    return this.cache.wrap(key, 30, () => this.computeUnifiedFeed(from, to, isStaff, memberId), ['calendar', 'meetings']);
  }

  private async viewerFor(isStaff: boolean, memberId?: string): Promise<EventViewer> {
    if (isStaff) return { isStaff: true };
    if (!memberId) return { isStaff: false };
    const member = await this.prisma.member.findUnique({ where: { id: memberId }, select: { subTeamId: true, roleInUnit: true } });
    return { memberId, subTeamId: member?.subTeamId ?? null, roleInUnit: member?.roleInUnit ?? null, isStaff: false };
  }

  private async computeUnifiedFeed(
    from: string | Date,
    to: string | Date,
    isStaff = true,
    memberId?: string,
  ): Promise<UnifiedCalendarItem[]> {
    const start = new Date(from);
    const end = new Date(to);
    const viewer = await this.viewerFor(isStaff, memberId);

    const [meetings, appointments, googleMappings] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          AND: [
            visibilityWhere(viewer),
            { startTime: { gte: start, lte: end } },
            { status: { not: 'CANCELLED' } },
          ],
        },
        include: {
          category: { select: { name: true } },
          eventType: { select: { key: true, name: true, color: true } },
          _count: { select: { invitations: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: {
          startTime: { gte: start, lte: end },
          status: { not: 'CANCELLED' },
          ...(memberId && !isStaff ? { memberId } : {}),
        },
        include: {
          service: { select: { id: true, name: true, category: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.externalCalendarEventMapping.findMany({
        where: {
          createdAt: { gte: new Date(start.getTime() - 30 * 86400000) },
        },
      }),
    ]);

    const googleMapByEntity = new Map<string, (typeof googleMappings)[0]>();
    for (const mapping of googleMappings) {
      googleMapByEntity.set(`${mapping.entityType}:${mapping.entityId}`, mapping);
    }

    const mappedMeetings: UnifiedCalendarItem[] = meetings.map((m) => {
      const isEvent = Boolean(m.eventType?.key);
      const mapping = googleMapByEntity.get(`MEETING:${m.id}`);

      return {
        id: m.id,
        originalId: m.id,
        domainType: isEvent ? 'EVENT' : 'MEETING',
        title: m.title,
        description: m.description,
        startTime: m.startTime,
        endTime: m.endTime || new Date(m.startTime.getTime() + 60 * 60000),
        locationName: m.locationName || 'General',
        meetingUrl: mapping?.meetingUrl || (m.locationName?.toLowerCase()?.includes('meet') ? 'https://meet.google.com' : null),
        status: m.status,
        isCompulsory: m.isCompulsory,
        visibility: m.visibility,
        isRecurring: Boolean(m.serviceScheduleId),
        categoryName: m.category?.name || 'General',
        eventTypeName: m.eventType?.name,
        eventTypeKey: m.eventType?.key,
        color: isEvent ? '#6366f1' : '#10b981',
        googleSynced: Boolean(mapping),
        googleHtmlLink: mapping?.externalHtmlLink,
        attendeesCount: m._count.invitations,
        raw: m,
      };
    });

    const mappedAppointments: UnifiedCalendarItem[] = appointments.map((a) => {
      const mapping = googleMapByEntity.get(`APPOINTMENT:${a.id}`);

      return {
        id: a.id,
        originalId: a.id,
        domainType: 'APPOINTMENT',
        title: a.title,
        description: a.notes,
        startTime: a.startTime,
        endTime: a.endTime,
        locationName: a.location || (a.mode === 'VIDEO_CONFERENCE' ? 'Google Meet' : 'Office Suite'),
        meetingUrl: a.meetingUrl || mapping?.meetingUrl,
        status: a.status,
        isCompulsory: false,
        visibility: 'RESTRICTED',
        isRecurring: false,
        categoryName: a.service?.name || 'Appointment',
        clientName: a.clientName,
        providerName: a.providerName,
        color: '#f59e0b',
        googleSynced: Boolean(mapping),
        googleHtmlLink: mapping?.externalHtmlLink,
        raw: a,
      };
    });

    return [...mappedMeetings, ...mappedAppointments].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }

  /**
   * Helper function to calculate exact local day bounds in configured timezone.
   */
  private getLocalDayBounds(refDate = new Date()) {
    const tz = this.config.get<string>('TFHC_TIMEZONE') || 'Africa/Lagos';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(refDate);

    let year = '', month = '', day = '';
    for (const p of parts) {
      if (p.type === 'year') year = p.value;
      if (p.type === 'month') month = p.value;
      if (p.type === 'day') day = p.value;
    }

    const todayDateStr = `${year}-${month}-${day}`;
    const dummyUtc = new Date(`${todayDateStr}T00:00:00Z`);

    const tzFormatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).format(refDate);

    const match = tzFormatted.match(/GMT([+-]\d{2}):?(\d{2})?/);
    let offsetMinutes = 0;
    if (match) {
      const sign = match[1][0] === '+' ? 1 : -1;
      const hours = parseInt(match[1].slice(1), 10);
      const mins = match[2] ? parseInt(match[2], 10) : 0;
      offsetMinutes = sign * (hours * 60 + mins);
    }

    const todayStart = new Date(dummyUtc.getTime() - offsetMinutes * 60 * 1000);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    return { timezone: tz, todayDateStr, todayStart, todayEnd };
  }

  async getTodayUpcoming(memberId?: string, isStaff = true) {
    const now = new Date();
    const { timezone, todayDateStr, todayStart, todayEnd } = this.getLocalDayBounds(now);
    const viewer = await this.viewerFor(isStaff, memberId);

    const key = `calendar:today-upcoming:${todayDateStr}:${isStaff}:${memberId || 'all'}`;

    return this.cache.wrap(
      key,
      15,
      async () => {
        const [todayMeetings, todayAppointments, upcomingMeetings, upcomingAppointments, activeMeetingRaw] =
          await Promise.all([
            this.prisma.meeting.findMany({
              where: {
                AND: [
                  visibilityWhere(viewer),
                  { archivedAt: null },
                  { status: { not: 'CANCELLED' } },
                  { startTime: { gte: todayStart, lte: todayEnd } },
                ],
              },
              include: {
                category: { select: { name: true } },
                eventType: { select: { key: true, name: true, color: true } },
                _count: { select: { invitations: true, attendanceRecords: true } },
              },
              orderBy: { startTime: 'asc' },
            }),

            this.prisma.appointment.findMany({
              where: {
                status: { not: 'CANCELLED' },
                startTime: { gte: todayStart, lte: todayEnd },
                ...(memberId && !isStaff ? { memberId } : {}),
              },
              include: {
                service: { select: { id: true, name: true, category: true } },
              },
              orderBy: { startTime: 'asc' },
            }),

            this.prisma.meeting.findMany({
              where: {
                AND: [
                  visibilityWhere(viewer),
                  { archivedAt: null },
                  { status: { notIn: ['CANCELLED', 'CLOSED'] } },
                  { startTime: { gt: todayEnd } },
                ],
              },
              include: {
                category: { select: { name: true } },
                eventType: { select: { key: true, name: true, color: true } },
                _count: { select: { invitations: true, attendanceRecords: true } },
              },
              orderBy: { startTime: 'asc' },
            }),

            this.prisma.appointment.findMany({
              where: {
                status: { in: ['SCHEDULED', 'CONFIRMED'] },
                startTime: { gt: todayEnd },
                ...(memberId && !isStaff ? { memberId } : {}),
              },
              include: {
                service: { select: { id: true, name: true, category: true } },
              },
              orderBy: { startTime: 'asc' },
            }),

            this.prisma.meeting.findFirst({
              where: {
                AND: [
                  visibilityWhere(viewer),
                  { archivedAt: null },
                  { status: 'ACTIVE' },
                  {
                    OR: [
                      { attendanceOpenTime: { lte: now }, attendanceCloseTime: { gte: now } },
                      { startTime: { gte: todayStart, lte: todayEnd } },
                    ],
                  },
                ],
              },
              include: {
                category: { select: { name: true } },
                eventType: { select: { key: true, name: true, color: true } },
                _count: { select: { invitations: true, attendanceRecords: true } },
              },
              orderBy: { startTime: 'desc' },
            }),
          ]);

        const mapMeetingToUnified = (m: any): UnifiedCalendarItem => {
          const isEvent = Boolean(m.eventType?.key);
          return {
            id: m.id,
            originalId: m.id,
            domainType: isEvent ? 'EVENT' : 'MEETING',
            title: m.title,
            description: m.description,
            startTime: m.startTime,
            endTime: m.endTime || new Date(new Date(m.startTime).getTime() + 60 * 60000),
            locationName: m.locationName || 'Main Sanctuary',
            status: m.status,
            isCompulsory: m.isCompulsory,
            visibility: m.visibility,
            isRecurring: Boolean(m.serviceScheduleId),
            categoryName: m.category?.name || 'General',
            eventTypeName: m.eventType?.name,
            eventTypeKey: m.eventType?.key,
            color: isEvent ? '#6366f1' : '#10b981',
            attendeesCount: m._count?.attendanceRecords || m._count?.invitations || 0,
            raw: m,
          };
        };

        const mapAppointmentToUnified = (a: any): UnifiedCalendarItem => ({
          id: a.id,
          originalId: a.id,
          domainType: 'APPOINTMENT',
          title: a.title,
          description: a.notes,
          startTime: a.startTime,
          endTime: a.endTime,
          locationName: a.location || (a.mode === 'VIDEO_CONFERENCE' ? 'Google Meet' : 'Office Suite'),
          status: a.status,
          isCompulsory: false,
          visibility: 'RESTRICTED',
          isRecurring: false,
          categoryName: a.service?.name || 'Appointment',
          clientName: a.clientName,
          providerName: a.providerName,
          color: '#f59e0b',
          raw: a,
        });

        const todayItems: UnifiedCalendarItem[] = [
          ...todayMeetings.map(mapMeetingToUnified),
          ...todayAppointments.map(mapAppointmentToUnified),
        ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        const upcomingItems: UnifiedCalendarItem[] = [
          ...upcomingMeetings.map(mapMeetingToUnified),
          ...upcomingAppointments.map(mapAppointmentToUnified),
        ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        const activeMeetingItem = activeMeetingRaw ? mapMeetingToUnified(activeMeetingRaw) : null;

        return {
          timezone,
          todayDate: todayDateStr,
          activeMeeting: activeMeetingItem,
          today: todayItems,
          upcoming: upcomingItems,
        };
      },
      ['calendar', 'meetings'],
    );
  }
}
