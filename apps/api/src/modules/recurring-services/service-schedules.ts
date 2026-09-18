import { expandRecurrence, isValidRecurrenceRule, RecurrenceRule } from '@tfhc/shared';

export const SERVICE_SCHEDULES = [
  {
    id: 'saturday-seat-arrangement',
    title: 'Seat Arrangement',
    dayOfWeek: 6,
    startMinutes: 1020,
    endMinutes: 1080,
    categoryName: 'Unit Meeting',
    eventTypeKey: 'MEETING',
    recurrenceRule: { freq: 'WEEKLY', interval: 1, byWeekday: [6] },
  },
  {
    id: 'sunday-first',
    title: 'First Service',
    dayOfWeek: 0,
    startMinutes: 420,
    endMinutes: 480,
    categoryName: 'Sunday Service',
    eventTypeKey: 'SERVICE',
    recurrenceRule: { freq: 'WEEKLY', interval: 1, byWeekday: [0] },
  },
  {
    id: 'sunday-second',
    title: 'Second Service',
    dayOfWeek: 0,
    startMinutes: 510,
    endMinutes: 600,
    categoryName: 'Sunday Service',
    eventTypeKey: 'SERVICE',
    recurrenceRule: { freq: 'WEEKLY', interval: 1, byWeekday: [0] },
  },
  {
    id: 'sunday-third',
    title: 'Third Service',
    dayOfWeek: 0,
    startMinutes: 630,
    endMinutes: 720,
    categoryName: 'Sunday Service',
    eventTypeKey: 'SERVICE',
    recurrenceRule: { freq: 'WEEKLY', interval: 1, byWeekday: [0] },
  },
  {
    id: 'tuesday-midweek',
    title: 'Mid-Week Service',
    dayOfWeek: 2,
    startMinutes: 1125,
    endMinutes: 1215,
    categoryName: 'Midweek Service',
    eventTypeKey: 'SERVICE',
    recurrenceRule: { freq: 'WEEKLY', interval: 1, byWeekday: [2] },
  },
  {
    id: 'wednesday-unit-meeting',
    title: 'Unit weekly meeting',
    dayOfWeek: 3,
    startMinutes: 1200,
    endMinutes: 1260,
    categoryName: 'Unit Meeting',
    eventTypeKey: 'MEETING',
    recurrenceRule: { freq: 'WEEKLY', interval: 1, byWeekday: [3] },
  },
  {
    id: 'thursday-divine',
    title: 'Divine Intervention Service',
    dayOfWeek: 4,
    startMinutes: 480,
    endMinutes: 600,
    categoryName: 'Midweek Service',
    eventTypeKey: 'SERVICE',
    recurrenceRule: { freq: 'WEEKLY', interval: 1, byWeekday: [4] },
  },
  {
    id: 'monthly-speaking-mysteries',
    title: 'Speaking Mysteries',
    dayOfWeek: 6,
    startMinutes: 540,
    endMinutes: 900,
    categoryName: 'Special Programme',
    eventTypeKey: 'SPECIAL_SERVICE',
    recurrenceRule: { freq: 'MONTHLY', interval: 1, bySetPos: [{ weekday: 6, nth: 1 }] },
  },
  {
    id: 'monthly-communion-service',
    title: 'Communion Service',
    dayOfWeek: 0,
    startMinutes: 1065,
    endMinutes: 1200,
    categoryName: 'Special Programme',
    eventTypeKey: 'SPECIAL_SERVICE',
    recurrenceRule: { freq: 'MONTHLY', interval: 1, bySetPos: [{ weekday: 0, nth: -1 }] },
  },
];

export type ScheduleShape = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number | null;
  recurrenceRule?: unknown;
  horizonDays?: number | null;
};

// Africa/Lagos is UTC+01:00 year-round. Date arithmetic stays independent of host timezone.
const LAGOS_OFFSET_MIN = 60;

/**
 * Upcoming occurrence start/end instants for a schedule.
 *
 * - No `recurrenceRule` ⇒ legacy behaviour: every `dayOfWeek` in the next
 *   `days` window (default 28) at `startMinutes` local time.
 * - With a `recurrenceRule` ⇒ the shared recurrence engine drives the dates,
 *   anchored to today at `startMinutes`, over the same window.
 */
export function occurrences(schedule: ScheduleShape, now: Date, days?: number) {
  const window = days ?? schedule.horizonDays ?? 28;
  const rule = schedule.recurrenceRule;

  if (rule && isValidRecurrenceRule(rule)) {
    return recurrenceOccurrences(schedule, rule as RecurrenceRule, now, window);
  }

  const local = new Date(now.getTime() + LAGOS_OFFSET_MIN * 60000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const results: { startTime: Date; endTime: Date | null }[] = [];
  for (let day = 0; day < window; day++) {
    const date = new Date(midnight + day * 86400000);
    if (date.getUTCDay() !== schedule.dayOfWeek) continue;
    const startTime = new Date(date.getTime() + (schedule.startMinutes - 60) * 60000);
    results.push({
      startTime,
      endTime: schedule.endMinutes === null ? null : new Date(date.getTime() + (schedule.endMinutes - 60) * 60000),
    });
  }
  return results;
}

function recurrenceOccurrences(schedule: ScheduleShape, rule: RecurrenceRule, now: Date, days: number) {
  // Anchor dtStart to "today" at the schedule's local start time.
  const local = new Date(now.getTime() + LAGOS_OFFSET_MIN * 60000);
  const midnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const from = new Date(midnightUtc - LAGOS_OFFSET_MIN * 60000);
  const startUtc = new Date(midnightUtc + (schedule.startMinutes - 60) * 60000);
  const to = new Date(now.getTime() + days * 86400000);
  const durationMs = schedule.endMinutes === null ? null : (schedule.endMinutes - schedule.startMinutes) * 60000;

  return expandRecurrence(rule, startUtc, { from, to, zoneOffsetMinutes: LAGOS_OFFSET_MIN, max: 200 })
    .map((start) => ({
      startTime: start,
      endTime: durationMs === null ? null : new Date(start.getTime() + durationMs),
    }));
}
