export interface CalendarAttendee {
  email: string;
  displayName?: string;
  optional?: boolean;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
}

export interface CalendarEventPayload {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  isOnline?: boolean;
  conferenceType?: 'GOOGLE_MEET';
  attendees?: CalendarAttendee[];
  recurrence?: string[];
  reminders?: { minutes: number; method: 'popup' | 'email' }[];
  metadata?: Record<string, any>;
}

export interface CalendarEventResult {
  externalEventId: string;
  externalHtmlLink?: string;
  meetingUrl?: string; // e.g. Google Meet link
  etag?: string;
  status: string;
  attendees?: CalendarAttendee[];
}

export interface ICalendarProvider {
  readonly providerName: string;

  createEvent(
    auth: { accessToken: string; refreshToken?: string; calendarId?: string },
    payload: CalendarEventPayload,
  ): Promise<CalendarEventResult>;

  updateEvent(
    auth: { accessToken: string; refreshToken?: string; calendarId?: string },
    externalEventId: string,
    payload: Partial<CalendarEventPayload>,
  ): Promise<CalendarEventResult>;

  deleteEvent(
    auth: { accessToken: string; refreshToken?: string; calendarId?: string },
    externalEventId: string,
  ): Promise<void>;

  getEvent(
    auth: { accessToken: string; refreshToken?: string; calendarId?: string },
    externalEventId: string,
  ): Promise<CalendarEventResult | null>;

  listEvents(
    auth: { accessToken: string; refreshToken?: string; calendarId?: string },
    timeMin: Date,
    timeMax: Date,
    syncToken?: string,
  ): Promise<{ items: CalendarEventResult[]; nextSyncToken?: string }>;
}
