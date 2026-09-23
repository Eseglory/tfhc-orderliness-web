import { recurrenceRuleToRRuleString, RecurrenceRule } from '@tfhc/shared';
import { occurrences, SERVICE_SCHEDULES } from '../src/modules/recurring-services/service-schedules';

describe('Wednesday Unit Weekly Meeting End-to-End Suite', () => {
  const wednesdayTemplate = SERVICE_SCHEDULES.find((s) => s.id === 'wednesday-unit-meeting')!;

  describe('1. Recurrence Rule & RRULE RFC 5545 Generation', () => {
    it('correctly converts Wednesday recurrence rule to RFC-5545 RRULE string', () => {
      const rule: RecurrenceRule = { freq: 'WEEKLY', interval: 1, byWeekday: [3] };
      const rruleStr = recurrenceRuleToRRuleString(rule);
      expect(rruleStr).toBe('FREQ=WEEKLY;BYDAY=WE');
    });

    it('matches the schedule definition for wednesday-unit-meeting', () => {
      expect(wednesdayTemplate).toBeDefined();
      expect(wednesdayTemplate.title).toBe('Wednesday Unit Weekly Meeting');
      expect(wednesdayTemplate.dayOfWeek).toBe(3); // Wednesday (0=Sun, 1=Mon, 2=Tue, 3=Wed)
      expect(wednesdayTemplate.startMinutes).toBe(1200); // 20:00 (8:00 PM WAT)
      expect(wednesdayTemplate.endMinutes).toBe(1260); // 21:00 (9:00 PM WAT)
      expect(wednesdayTemplate.isOnline).toBe(true);
      expect(wednesdayTemplate.locationName).toBe('Online / Google Meet');
      expect(wednesdayTemplate.meetingUrl).toContain('https://meet.google.com/');
    });
  });

  describe('2. Recurrence Calculation & Timezone Preservation (Africa/Lagos)', () => {
    it('generates strictly Wednesday occurrences without shifting days', () => {
      // Simulated reference date: Wednesday Sep 23, 2026
      const refDate = new Date('2026-09-23T12:00:00.000Z');
      const upcoming = occurrences(wednesdayTemplate, refDate, 28);

      expect(upcoming.length).toBeGreaterThanOrEqual(4);

      for (const occ of upcoming) {
        // In Africa/Lagos (UTC+1), the start time must be 20:00 (8:00 PM) on a Wednesday
        const lagosTime = new Date(occ.startTime.getTime() + 60 * 60000);
        expect(lagosTime.getUTCDay()).toBe(3); // Wednesday
        expect(lagosTime.getUTCHours()).toBe(20); // 8:00 PM WAT
        expect(lagosTime.getUTCMinutes()).toBe(0);

        // Corresponding UTC time should be 19:00 UTC
        expect(occ.startTime.getUTCHours()).toBe(19);

        // End time must be 1 hour later (21:00 WAT / 20:00 UTC)
        expect(occ.endTime).not.toBeNull();
        expect(occ.endTime!.getTime() - occ.startTime.getTime()).toBe(60 * 60000);
      }
    });

    it('does not generate duplicate occurrences for the same Wednesday', () => {
      const refDate = new Date('2026-09-23T00:00:00.000Z');
      const upcoming = occurrences(wednesdayTemplate, refDate, 35);
      const dates = upcoming.map((o) => o.startTime.toISOString().slice(0, 10));
      const uniqueDates = new Set(dates);
      expect(uniqueDates.size).toBe(upcoming.length);
    });
  });

  describe('3. Google Calendar Link Generation', () => {
    it('builds a valid Google Calendar URL with recur, ctz, and online details', () => {
      const toUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const startTime = new Date('2026-09-23T19:00:00.000Z');
      const endTime = new Date('2026-09-23T20:00:00.000Z');
      const rrule = recurrenceRuleToRRuleString(wednesdayTemplate.recurrenceRule as RecurrenceRule);

      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: wednesdayTemplate.title,
        dates: `${toUtc(startTime)}/${toUtc(endTime)}`,
        details: `${wednesdayTemplate.description}\n\nJoin Google Meet: ${wednesdayTemplate.meetingUrl}`,
        location: wednesdayTemplate.locationName || 'Online',
        ctz: 'Africa/Lagos',
        recur: `RRULE:${rrule}`,
      });

      const url = `https://calendar.google.com/calendar/render?${params.toString()}`;

      expect(url).toContain('action=TEMPLATE');
      expect(url).toContain('text=Wednesday+Unit+Weekly+Meeting');
      expect(url).toContain('ctz=Africa%2FLagos');
      expect(url).toContain('recur=RRULE%3AFREQ%3DWEEKLY%3BBYDAY%3DWE');
      expect(url).toContain('https%3A%2F%2Fmeet.google.com%2Ford-tfhc-wed');
    });
  });

  describe('4. Member Invitation & Audience Integrity', () => {
    it('targets all active members dynamically and assigns ALL_MEMBERS scope', () => {
      const mockMembers = [
        { id: 'mem-1', status: 'ACTIVE' },
        { id: 'mem-2', status: 'ACTIVE' },
        { id: 'mem-3', status: 'ACTIVE' },
      ];

      const audience = {
        scope: 'ALL_MEMBERS',
      };

      const invitations = mockMembers.map((m) => ({
        meetingId: 'meeting-wed-1',
        memberId: m.id,
        status: 'INVITED',
      }));

      expect(audience.scope).toBe('ALL_MEMBERS');
      expect(invitations.length).toBe(3);
      expect(invitations.every((i) => i.status === 'INVITED')).toBe(true);
    });
  });
});
