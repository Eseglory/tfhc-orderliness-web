/**
 * Advanced Google Calendar and Online Meeting (Google Meet) integration utility.
 * Generates Google Calendar TEMPLATE links with attendee email lists,
 * RFC-5545 compliant .ICS calendar files, and formatted invitation messages.
 */

export interface CalendarEventOptions {
  id?: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  startTime: string | Date;
  endTime?: string | Date | null;
  locationName?: string | null;
  address?: string | null;
  virtualMeetingUrl?: string | null;
  mode?: 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';
  attendeeEmails?: string[];
  organizerName?: string | null;
  recurrenceRule?: string | null;
  timezone?: string | null;
  agendaItems?: Array<{
    order: number;
    title: string;
    description?: string | null;
    durationMinutes?: number | null;
    assignedMember?: { firstName?: string; lastName?: string; preferredName?: string | null } | null;
  }>;
}

/**
 * Generates a standard Google Meet room code format (e.g. abc-defg-hij)
 */
export function generateRandomGoogleMeetCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const randSegment = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${randSegment(3)}-${randSegment(4)}-${randSegment(3)}`;
}

export function generateGoogleMeetUrl(): string {
  return `https://meet.google.com/${generateRandomGoogleMeetCode()}`;
}

/**
 * Strictly identifies the Wednesday unit meeting, which is the only online service requiring Google Calendar/Meet actions.
 * All other services are strictly in-person and do not display Google Calendar buttons.
 */
export function isOnlineUnitMeeting(meeting?: { title?: string | null; isOnline?: boolean | null; mode?: string | null } | null): boolean {
  if (!meeting) return false;
  const t = (meeting.title || '').toLowerCase();
  // Strictly only the Wednesday Unit Meeting is online.
  // In-person church services (First/Second/Third Service, Mid-Week, Divine Intervention, Communion, etc.)
  // must never display Google Calendar buttons or online meeting actions.
  const hasWednesday = t.includes('wednesday');
  const hasUnit = t.includes('unit');

  if (hasWednesday && hasUnit) return true;
  if (Boolean(meeting.isOnline) && (hasWednesday || hasUnit)) return true;

  return false;
}

/**
 * Extracts virtual meeting URL from notes or address if present.
 */
export function extractVirtualUrl(event: { notes?: string | null; address?: string | null; locationName?: string | null }): string | null {
  if (event.address && event.address.startsWith('http')) return event.address;
  if (event.notes) {
    const match = event.notes.match(/\[Virtual Link:\s*([^\s\]]+)\]/i);
    if (match) return match[1];
    const urlMatch = event.notes.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) return urlMatch[0];
  }
  return null;
}

/**
 * Builds an advanced Google Calendar Web URL pre-filled with:
 * - Title
 * - Dates (ISO standard YYYYMMDDTHHmmssZ)
 * - Recurrence (e.g. RRULE:FREQ=WEEKLY;BYDAY=WE)
 * - Timezone (default Africa/Lagos)
 * - Details (Agenda, Google Meet link, Notes)
 * - Location (Google Meet URL / Physical address)
 * - add (comma-separated list of invited attendee emails for automatic invitation)
 */
export function buildAdvancedGoogleCalendarUrl(opts: CalendarEventOptions): string {
  const start = new Date(opts.startTime);
  const end = opts.endTime
    ? new Date(opts.endTime)
    : new Date(start.getTime() + 60 * 60 * 1000); // default 1 hour duration

  const formatIso = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, '');
  const startIso = formatIso(start);
  const endIso = formatIso(end);

  const virtualUrl = opts.virtualMeetingUrl || extractVirtualUrl(opts);

  let detailsText = opts.description ? `${opts.description.trim()}\n\n` : '';
  if (virtualUrl) {
    detailsText += `📹 Google Meet / Video Call: ${virtualUrl}\n\n`;
  }
  if (opts.agendaItems && opts.agendaItems.length > 0) {
    detailsText += `📋 Order of Service / Agenda:\n`;
    opts.agendaItems.forEach((item) => {
      const assigned = item.assignedMember
        ? ` (${item.assignedMember.preferredName || `${item.assignedMember.firstName || ''} ${item.assignedMember.lastName || ''}`.trim()})`
        : '';
      const dur = item.durationMinutes ? ` [${item.durationMinutes}m]` : '';
      detailsText += `${item.order}. ${item.title}${dur}${assigned}\n`;
    });
    detailsText += `\n`;
  }
  if (opts.notes) {
    detailsText += `📌 Notes & Guidelines: ${opts.notes.trim()}\n\n`;
  }
  detailsText += `Organized by: ${opts.organizerName || "The Father's House Church (TFHC) Orderliness Unit"}`;

  let locationText = '';
  if (opts.mode === 'VIRTUAL' && virtualUrl) {
    locationText = virtualUrl;
  } else if (opts.mode === 'HYBRID' && virtualUrl) {
    locationText = `${opts.locationName || 'Main Centre'} (${virtualUrl})`;
  } else {
    locationText = [opts.locationName, opts.address].filter(Boolean).join(', ') || "The Father's House Church";
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${startIso}/${endIso}`,
    details: detailsText,
    location: locationText,
    ctz: opts.timezone || 'Africa/Lagos',
  });

  if (opts.recurrenceRule) {
    const ruleStr = opts.recurrenceRule.startsWith('RRULE:')
      ? opts.recurrenceRule
      : `RRULE:${opts.recurrenceRule}`;
    params.set('recur', ruleStr);
  }

  // Attach attendee emails if provided (Google Calendar auto-adds them as invited guests)
  if (opts.attendeeEmails && opts.attendeeEmails.length > 0) {
    const validEmails = opts.attendeeEmails
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));
    if (validEmails.length > 0) {
      params.set('add', validEmails.join(','));
    }
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates RFC-5545 iCalendar (.ICS) file string
 */
export function generateIcsFileContent(opts: CalendarEventOptions): string {
  const start = new Date(opts.startTime);
  const end = opts.endTime
    ? new Date(opts.endTime)
    : new Date(start.getTime() + 60 * 60 * 1000);

  const formatIso = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, '');
  const virtualUrl = opts.virtualMeetingUrl || extractVirtualUrl(opts);

  let locationText = opts.locationName || "The Father's House Church";
  if (virtualUrl) {
    locationText = opts.mode === 'VIRTUAL' ? virtualUrl : `${locationText} (${virtualUrl})`;
  }

  const escapeIcs = (str: string) =>
    str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const attendeesIcs = (opts.attendeeEmails || [])
    .filter((e) => e && e.includes('@'))
    .map((e) => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${e}:mailto:${e}`)
    .join('\r\n');

  const rruleIcs = opts.recurrenceRule
    ? (opts.recurrenceRule.startsWith('RRULE:') ? opts.recurrenceRule : `RRULE:${opts.recurrenceRule}`)
    : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Fathers House Church//Orderliness Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${opts.id || Math.random().toString(36).slice(2)}@thefathershouse.net`,
    `DTSTAMP:${formatIso(new Date())}`,
    `DTSTART:${formatIso(start)}`,
    `DTEND:${formatIso(end)}`,
    rruleIcs,
    `SUMMARY:${escapeIcs(opts.title)}`,
    `DESCRIPTION:${escapeIcs(
      [
        opts.description,
        virtualUrl ? `Join Google Meet: ${virtualUrl}` : null,
        opts.agendaItems && opts.agendaItems.length > 0
          ? `Agenda:\n` +
            opts.agendaItems
              .map((it) => `${it.order}. ${it.title}${it.durationMinutes ? ` [${it.durationMinutes}m]` : ''}${it.assignedMember ? ` (${it.assignedMember.firstName || ''} ${it.assignedMember.lastName || ''})` : ''}`)
              .join('\n')
          : null,
        opts.notes,
      ]
        .filter(Boolean)
        .join('\n\n'),
    )}`,
    `LOCATION:${escapeIcs(locationText)}`,
    virtualUrl ? `URL:${virtualUrl}` : '',
    attendeesIcs ? attendeesIcs : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

/**
 * Formats a clean WhatsApp / Email copyable text invitation
 */
export function formatMeetingInviteMessage(opts: CalendarEventOptions): string {
  const start = new Date(opts.startTime);
  const dateStr = start.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const virtualUrl = opts.virtualMeetingUrl || extractVirtualUrl(opts);

  let msg = `✨ *${opts.title}*\n`;
  msg += `📅 *Date:* ${dateStr}\n`;
  msg += `🕒 *Time:* ${timeStr}\n`;

  if (virtualUrl) {
    msg += `📹 *Google Meet Link:* ${virtualUrl}\n`;
  }
  if (opts.locationName && opts.mode !== 'VIRTUAL') {
    msg += `📍 *Venue:* ${opts.locationName}${opts.address ? `, ${opts.address}` : ''}\n`;
  }
  if (opts.description) {
    msg += `\n📝 *Overview:*\n${opts.description}\n`;
  }
  if (opts.agendaItems && opts.agendaItems.length > 0) {
    msg += `\n📋 *Order of Service / Agenda:*\n`;
    opts.agendaItems.forEach((it) => {
      const assigned = it.assignedMember
        ? ` (${it.assignedMember.preferredName || `${it.assignedMember.firstName || ''} ${it.assignedMember.lastName || ''}`.trim()})`
        : '';
      const dur = it.durationMinutes ? ` [${it.durationMinutes}m]` : '';
      msg += `• *${it.order}. ${it.title}*${dur}${assigned}\n`;
    });
  }

  if (opts.mode === 'VIRTUAL') {
    msg += `\n🔗 *Add to Google Calendar:*\n${buildAdvancedGoogleCalendarUrl(opts)}\n`;
  }

  msg += `\n_The Father's House Church_`;

  return msg;
}
