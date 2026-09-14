import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import {
  ICalendarProvider,
  CalendarEventPayload,
  CalendarEventResult,
} from './calendar-provider.interface';

@Injectable()
export class GoogleCalendarProvider implements ICalendarProvider {
  readonly providerName = 'GOOGLE_CALENDAR';
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  private getCalendarClient(accessToken: string): calendar_v3.Calendar {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async createEvent(
    auth: { accessToken: string; calendarId?: string },
    payload: CalendarEventPayload,
  ): Promise<CalendarEventResult> {
    const calendar = this.getCalendarClient(auth.accessToken);
    const calendarId = auth.calendarId || 'primary';

    const eventResource: calendar_v3.Schema$Event = {
      summary: payload.title,
      description: payload.description,
      start: {
        dateTime: payload.startTime.toISOString(),
      },
      end: {
        dateTime: payload.endTime.toISOString(),
      },
      location: payload.location,
      attendees: payload.attendees?.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        optional: a.optional,
      })),
      recurrence: payload.recurrence,
      reminders: payload.reminders
        ? {
            useDefault: false,
            overrides: payload.reminders.map((r) => ({
              method: r.method,
              minutes: r.minutes,
            })),
          }
        : { useDefault: true },
    };

    if (payload.isOnline || payload.conferenceType === 'GOOGLE_MEET') {
      eventResource.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    try {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: eventResource,
        conferenceDataVersion: payload.isOnline || payload.conferenceType === 'GOOGLE_MEET' ? 1 : 0,
        sendUpdates: payload.attendees && payload.attendees.length > 0 ? 'all' : 'none',
      });

      const data = response.data;
      const meetingUrl =
        data.hangoutLink ||
        data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
        undefined;

      return {
        externalEventId: data.id || '',
        externalHtmlLink: data.htmlLink || undefined,
        meetingUrl,
        etag: data.etag || undefined,
        status: data.status || 'confirmed',
        attendees: data.attendees?.map((att) => ({
          email: att.email || '',
          displayName: att.displayName || undefined,
          responseStatus: (att.responseStatus as any) || 'needsAction',
        })),
      };
    } catch (error: any) {
      this.logger.error(`Failed to create Google Calendar event: ${error?.message || error}`, error?.stack);
      throw error;
    }
  }

  async updateEvent(
    auth: { accessToken: string; calendarId?: string },
    externalEventId: string,
    payload: Partial<CalendarEventPayload>,
  ): Promise<CalendarEventResult> {
    const calendar = this.getCalendarClient(auth.accessToken);
    const calendarId = auth.calendarId || 'primary';

    const patchBody: calendar_v3.Schema$Event = {};
    if (payload.title !== undefined) patchBody.summary = payload.title;
    if (payload.description !== undefined) patchBody.description = payload.description;
    if (payload.startTime) patchBody.start = { dateTime: payload.startTime.toISOString() };
    if (payload.endTime) patchBody.end = { dateTime: payload.endTime.toISOString() };
    if (payload.location !== undefined) patchBody.location = payload.location;
    if (payload.attendees) {
      patchBody.attendees = payload.attendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        optional: a.optional,
      }));
    }

    try {
      const response = await calendar.events.patch({
        calendarId,
        eventId: externalEventId,
        requestBody: patchBody,
        sendUpdates: 'all',
      });

      const data = response.data;
      const meetingUrl =
        data.hangoutLink ||
        data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
        undefined;

      return {
        externalEventId: data.id || externalEventId,
        externalHtmlLink: data.htmlLink || undefined,
        meetingUrl,
        etag: data.etag || undefined,
        status: data.status || 'confirmed',
        attendees: data.attendees?.map((att) => ({
          email: att.email || '',
          displayName: att.displayName || undefined,
          responseStatus: (att.responseStatus as any) || 'needsAction',
        })),
      };
    } catch (error: any) {
      this.logger.error(`Failed to update Google Calendar event ${externalEventId}: ${error?.message || error}`);
      throw error;
    }
  }

  async deleteEvent(
    auth: { accessToken: string; calendarId?: string },
    externalEventId: string,
  ): Promise<void> {
    const calendar = this.getCalendarClient(auth.accessToken);
    const calendarId = auth.calendarId || 'primary';

    try {
      await calendar.events.delete({
        calendarId,
        eventId: externalEventId,
        sendUpdates: 'all',
      });
    } catch (error: any) {
      // If already deleted in Google (404/410), treat as completed
      if (error?.status === 404 || error?.status === 410) {
        return;
      }
      this.logger.error(`Failed to delete Google Calendar event ${externalEventId}: ${error?.message || error}`);
      throw error;
    }
  }

  async getEvent(
    auth: { accessToken: string; calendarId?: string },
    externalEventId: string,
  ): Promise<CalendarEventResult | null> {
    const calendar = this.getCalendarClient(auth.accessToken);
    const calendarId = auth.calendarId || 'primary';

    try {
      const response = await calendar.events.get({
        calendarId,
        eventId: externalEventId,
      });
      const data = response.data;
      const meetingUrl =
        data.hangoutLink ||
        data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
        undefined;

      return {
        externalEventId: data.id || externalEventId,
        externalHtmlLink: data.htmlLink || undefined,
        meetingUrl,
        etag: data.etag || undefined,
        status: data.status || 'confirmed',
        attendees: data.attendees?.map((att) => ({
          email: att.email || '',
          displayName: att.displayName || undefined,
          responseStatus: (att.responseStatus as any) || 'needsAction',
        })),
      };
    } catch (error: any) {
      if (error?.status === 404 || error?.status === 410) {
        return null;
      }
      throw error;
    }
  }

  async listEvents(
    auth: { accessToken: string; calendarId?: string },
    timeMin: Date,
    timeMax: Date,
    syncToken?: string,
  ): Promise<{ items: CalendarEventResult[]; nextSyncToken?: string }> {
    const calendar = this.getCalendarClient(auth.accessToken);
    const calendarId = auth.calendarId || 'primary';

    try {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId,
        singleEvents: true,
        maxResults: 250,
      };

      if (syncToken) {
        params.syncToken = syncToken;
      } else {
        params.timeMin = timeMin.toISOString();
        params.timeMax = timeMax.toISOString();
        params.orderBy = 'startTime';
      }

      const response = await calendar.events.list(params);
      const items = (response.data.items || []).map((data) => {
        const meetingUrl =
          data.hangoutLink ||
          data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
          undefined;

        return {
          externalEventId: data.id || '',
          externalHtmlLink: data.htmlLink || undefined,
          meetingUrl,
          etag: data.etag || undefined,
          status: data.status || 'confirmed',
          attendees: data.attendees?.map((att) => ({
            email: att.email || '',
            displayName: att.displayName || undefined,
            responseStatus: (att.responseStatus as any) || 'needsAction',
          })),
        };
      });

      return {
        items,
        nextSyncToken: response.data.nextSyncToken || undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to list Google Calendar events: ${error?.message || error}`);
      throw error;
    }
  }
}
