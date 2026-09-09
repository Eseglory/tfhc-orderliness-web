import { expandRecurrence, isValidRecurrenceRule, RecurrenceRule } from '@tfhc/shared';

export const SERVICE_SCHEDULES = [
  { id: 'sunday-first', title: 'First Service', dayOfWeek: 0, startMinutes: 420, endMinutes: 480, categoryName: 'Sunday Service' },
  { id: 'sunday-second', title: 'Second Service', dayOfWeek: 0, startMinutes: 510, endMinutes: 600, categoryName: 'Sunday Service' },
  { id: 'sunday-third', title: 'Third Service', dayOfWeek: 0, startMinutes: 630, endMinutes: 720, categoryName: 'Sunday Service' },
  { id: 'sunday-youth', title: 'Youth Church', dayOfWeek: 0, startMinutes: 495, endMinutes: 600, categoryName: 'Sunday Service' },
  { id: 'sunday-teens', title: 'Teens Church', dayOfWeek: 0, startMinutes: 630, endMinutes: 720, categoryName: 'Sunday Service' },
  { id: 'sunday-children-0730', title: 'Children’s Church (7:30 AM)', dayOfWeek: 0, startMinutes: 450, endMinutes: null, categoryName: 'Sunday Service' },
  { id: 'sunday-children-0830', title: 'Children’s Church (8:30 AM)', dayOfWeek: 0, startMinutes: 510, endMinutes: null, categoryName: 'Sunday Service' },
  { id: 'sunday-children-1030', title: 'Children’s Church (10:30 AM)', dayOfWeek: 0, startMinutes: 630, endMinutes: null, categoryName: 'Sunday Service' },
  { id: 'tuesday-midweek', title: 'Mid-Week Service', dayOfWeek: 2, startMinutes: 1125, endMinutes: 1215, categoryName: 'Midweek Service' },
  { id: 'thursday-divine', title: 'Divine Intervention Service', dayOfWeek: 4, startMinutes: 480, endMinutes: 600, categoryName: 'Special Programme' },
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
    if (startTime <= now) continue;
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
  const startUtc = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + (schedule.startMinutes - 60) * 60000,
  );
  const to = new Date(now.getTime() + days * 86400000);
  const durationMs = schedule.endMinutes === null ? null : (schedule.endMinutes - schedule.startMinutes) * 60000;

  return expandRecurrence(rule, startUtc, { from: now, to, zoneOffsetMinutes: LAGOS_OFFSET_MIN, max: 200 })
    .filter((start) => start > now)
    .map((start) => ({
      startTime: start,
      endTime: durationMs === null ? null : new Date(start.getTime() + durationMs),
    }));
}
