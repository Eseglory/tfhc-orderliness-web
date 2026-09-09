/**
 * Calendar recurrence engine.
 *
 * Works entirely in a single timezone's **wall-clock local time**, expressed as
 * a UTC-shifted "pseudo-local" Date (add the zone offset to real UTC). Callers
 * convert back to real UTC with the same offset. The church operates in
 * Africa/Lagos (UTC+01:00, no DST) so a fixed offset is exact today; the
 * `zoneOffsetMinutes` parameter keeps the seam for a full IANA implementation.
 */

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Every N periods. 1 = weekly, 2 = fortnightly, … */
  interval: number;
  /** WEEKLY: weekdays it lands on, 0=Sun … 6=Sat. Empty ⇒ same weekday as dtstart. */
  byWeekday?: number[];
  /** MONTHLY: days of month (1..31, or -1 for last day). Empty ⇒ same day as dtstart. */
  byMonthday?: number[];
  /**
   * MONTHLY: "nth weekday" rules, e.g. { weekday: 0, nth: 1 } = first Sunday,
   * { weekday: 5, nth: -1 } = last Friday. Combined with byWeekday semantics.
   */
  bySetPos?: { weekday: number; nth: number }[];
  /** Stop after this many occurrences (inclusive of dtstart). */
  count?: number;
  /** Stop on/before this instant (ISO). */
  until?: string;
}

const DAY_MS = 86_400_000;
const HARD_CAP = 1000;

export function isValidRecurrenceRule(rule: unknown): rule is RecurrenceRule {
  if (!rule || typeof rule !== 'object') return false;
  const r = rule as RecurrenceRule;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq)) return false;
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 366) return false;
  if (r.byWeekday && (!Array.isArray(r.byWeekday) || r.byWeekday.some((d) => !Number.isInteger(d) || d < 0 || d > 6)))
    return false;
  if (
    r.byMonthday &&
    (!Array.isArray(r.byMonthday) || r.byMonthday.some((d) => !Number.isInteger(d) || d < -1 || d === 0 || d > 31))
  )
    return false;
  if (
    r.bySetPos &&
    (!Array.isArray(r.bySetPos) ||
      r.bySetPos.some(
        (s) =>
          !s ||
          !Number.isInteger(s.weekday) ||
          s.weekday < 0 ||
          s.weekday > 6 ||
          !Number.isInteger(s.nth) ||
          s.nth === 0 ||
          s.nth < -1 ||
          s.nth > 5,
      ))
  )
    return false;
  if (r.count !== undefined && (!Number.isInteger(r.count) || r.count < 1 || r.count > HARD_CAP)) return false;
  if (r.until !== undefined && !Number.isFinite(new Date(r.until).getTime())) return false;
  return true;
}

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addMonths(dayStart: number, months: number): number {
  const d = new Date(dayStart);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  return target.getTime();
}

/** Concrete day-starts (UTC ms) a MONTHLY rule produces within [monthStart, nextMonthStart). */
function monthlyDays(monthStart: number, rule: RecurrenceRule, anchorDom: number): number[] {
  const d = new Date(monthStart);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out = new Set<number>();

  const doms = rule.byMonthday && rule.byMonthday.length ? rule.byMonthday : rule.bySetPos?.length ? [] : [anchorDom];
  for (const dom of doms) {
    const day = dom === -1 ? daysInMonth : dom;
    if (day >= 1 && day <= daysInMonth) out.add(Date.UTC(year, month, day));
  }

  for (const pos of rule.bySetPos ?? []) {
    // 1st..5th weekday, or -1 = last.
    if (pos.nth === -1) {
      for (let day = daysInMonth; day >= 1; day--) {
        if (new Date(Date.UTC(year, month, day)).getUTCDay() === pos.weekday) {
          out.add(Date.UTC(year, month, day));
          break;
        }
      }
    } else {
      let seen = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        if (new Date(Date.UTC(year, month, day)).getUTCDay() === pos.weekday && ++seen === pos.nth) {
          out.add(Date.UTC(year, month, day));
          break;
        }
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Expand a rule into occurrence start instants (real UTC).
 *
 * @param rule          the recurrence rule
 * @param dtStartUtc    first occurrence, real UTC
 * @param opts.from     window start (inclusive), real UTC
 * @param opts.to       window end (exclusive), real UTC
 * @param opts.zoneOffsetMinutes  minutes to add to UTC to get local wall time (Lagos = 60)
 * @param opts.max      safety cap on returned occurrences (default 500, hard max 1000)
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  dtStartUtc: Date,
  opts: { from: Date; to: Date; zoneOffsetMinutes?: number; max?: number },
): Date[] {
  if (!isValidRecurrenceRule(rule)) throw new Error('Invalid recurrence rule');
  const offset = (opts.zoneOffsetMinutes ?? 60) * 60_000;
  const max = Math.min(opts.max ?? 500, HARD_CAP);

  // Shift everything into pseudo-local time.
  const dtStart = new Date(dtStartUtc.getTime() + offset);
  const from = new Date(opts.from.getTime() + offset);
  const to = new Date(opts.to.getTime() + offset);
  const untilLocal = rule.until ? new Date(new Date(rule.until).getTime() + offset).getTime() : Infinity;

  const timeOfDayMs = dtStart.getTime() - startOfUtcDay(dtStart);
  const anchorDom = dtStart.getUTCDate();
  const anchorWeekday = dtStart.getUTCDay();

  const results: number[] = [];
  let produced = 0;

  const push = (dayStart: number) => {
    const instant = dayStart + timeOfDayMs;
    if (instant < dtStart.getTime()) return true;
    if (instant > untilLocal) return false;
    produced++;
    if (instant >= from.getTime() && instant < to.getTime()) results.push(instant - offset);
    if (rule.count && produced >= rule.count) return false;
    if (results.length >= max) return false;
    return true;
  };

  const dtDay = startOfUtcDay(dtStart);

  if (rule.freq === 'DAILY') {
    for (let day = dtDay; day < to.getTime() + DAY_MS; day += DAY_MS * rule.interval) {
      if (!push(day)) break;
      if (day > untilLocal) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const weekdays = (rule.byWeekday && rule.byWeekday.length ? rule.byWeekday : [anchorWeekday]).slice().sort();
    // Anchor to the Sunday of dtStart's week.
    const weekAnchor = dtDay - anchorWeekday * DAY_MS;
    for (let week = weekAnchor; week < to.getTime() + 7 * DAY_MS; week += 7 * DAY_MS * rule.interval) {
      let stop = false;
      for (const wd of weekdays) {
        const day = week + wd * DAY_MS;
        if (day + timeOfDayMs < dtStart.getTime()) continue;
        if (!push(day)) {
          stop = true;
          break;
        }
      }
      if (stop) break;
    }
  } else if (rule.freq === 'MONTHLY') {
    let monthStart = Date.UTC(dtStart.getUTCFullYear(), dtStart.getUTCMonth(), 1);
    for (let guard = 0; guard < 1200; guard++) {
      if (monthStart > to.getTime()) break;
      let stop = false;
      for (const day of monthlyDays(monthStart, rule, anchorDom)) {
        if (day + timeOfDayMs < dtStart.getTime()) continue;
        if (!push(day)) {
          stop = true;
          break;
        }
      }
      if (stop) break;
      monthStart = addMonths(monthStart, rule.interval);
    }
  } else {
    // YEARLY — same month/day as dtStart, every `interval` years.
    for (let year = dtStart.getUTCFullYear(); ; year += rule.interval) {
      const day = Date.UTC(year, dtStart.getUTCMonth(), anchorDom);
      if (day > to.getTime() + 366 * DAY_MS) break;
      if (!push(day)) break;
    }
  }

  return results.sort((a, b) => a - b).map((ms) => new Date(ms));
}

/** Human summary for UI, e.g. "Weekly on Sun, Wed". */
export function describeRecurrence(rule: RecurrenceRule): string {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const every = rule.interval === 1 ? '' : ` every ${rule.interval}`;
  if (rule.freq === 'DAILY') return rule.interval === 1 ? 'Daily' : `Every ${rule.interval} days`;
  if (rule.freq === 'WEEKLY') {
    const days = (rule.byWeekday ?? []).map((d) => WD[d]).join(', ');
    return `${rule.interval === 1 ? 'Weekly' : `Every ${rule.interval} weeks`}${days ? ` on ${days}` : ''}`;
  }
  if (rule.freq === 'MONTHLY') {
    if (rule.bySetPos?.length) {
      const p = rule.bySetPos[0];
      const nth = p.nth === -1 ? 'last' : ['', '1st', '2nd', '3rd', '4th', '5th'][p.nth];
      return `Monthly on the ${nth} ${WD[p.weekday]}`;
    }
    if (rule.byMonthday?.length) return `Monthly on day ${rule.byMonthday.join(', ')}`;
    return `Monthly${every ? every + ' months' : ''}`;
  }
  return rule.interval === 1 ? 'Yearly' : `Every ${rule.interval} years`;
}
