import { describe, it, expect } from 'vitest';
import { expandRecurrence, isValidRecurrenceRule, describeRecurrence, RecurrenceRule } from '../recurrence.js';

// All dtstarts here are 09:00 Africa/Lagos = 08:00Z.
const at = (iso: string) => new Date(iso);
const win = (from: string, to: string) => ({ from: at(from), to: at(to), zoneOffsetMinutes: 60 });

describe('recurrence engine', () => {
  it('weekly on the dtstart weekday', () => {
    const rule: RecurrenceRule = { freq: 'WEEKLY', interval: 1 };
    const out = expandRecurrence(rule, at('2026-01-04T08:00:00Z'), win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'));
    expect(out.map((d) => d.toISOString())).toEqual([
      '2026-01-04T08:00:00.000Z',
      '2026-01-11T08:00:00.000Z',
      '2026-01-18T08:00:00.000Z',
      '2026-01-25T08:00:00.000Z',
    ]);
  });

  it('weekly on multiple weekdays (Mon & Thu)', () => {
    const rule: RecurrenceRule = { freq: 'WEEKLY', interval: 1, byWeekday: [1, 4] };
    const out = expandRecurrence(rule, at('2026-01-05T08:00:00Z'), win('2026-01-01T00:00:00Z', '2026-01-20T00:00:00Z'));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-01-05',
      '2026-01-08',
      '2026-01-12',
      '2026-01-15',
      '2026-01-19',
    ]);
  });

  it('fortnightly (interval 2)', () => {
    const rule: RecurrenceRule = { freq: 'WEEKLY', interval: 2 };
    const out = expandRecurrence(rule, at('2026-01-04T08:00:00Z'), win('2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z'));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-04', '2026-01-18', '2026-02-01', '2026-02-15']);
  });

  it('count stops the series', () => {
    const rule: RecurrenceRule = { freq: 'WEEKLY', interval: 1, count: 3 };
    const out = expandRecurrence(rule, at('2026-01-04T08:00:00Z'), win('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'));
    expect(out).toHaveLength(3);
  });

  it('until stops the series (inclusive)', () => {
    const rule: RecurrenceRule = { freq: 'WEEKLY', interval: 1, until: '2026-01-18T23:59:59Z' };
    const out = expandRecurrence(rule, at('2026-01-04T08:00:00Z'), win('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-04', '2026-01-11', '2026-01-18']);
  });

  it('monthly on the first Sunday', () => {
    const rule: RecurrenceRule = { freq: 'MONTHLY', interval: 1, bySetPos: [{ weekday: 0, nth: 1 }] };
    const out = expandRecurrence(rule, at('2026-01-04T08:00:00Z'), win('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-04', '2026-02-01', '2026-03-01']);
  });

  it('monthly on the last Friday', () => {
    const rule: RecurrenceRule = { freq: 'MONTHLY', interval: 1, bySetPos: [{ weekday: 5, nth: -1 }] };
    const out = expandRecurrence(rule, at('2026-01-30T08:00:00Z'), win('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-30', '2026-02-27', '2026-03-27']);
  });

  it('monthly on day 15, clamps for short months when -1', () => {
    const rule: RecurrenceRule = { freq: 'MONTHLY', interval: 1, byMonthday: [-1] };
    const out = expandRecurrence(rule, at('2026-01-31T08:00:00Z'), win('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('yearly', () => {
    const rule: RecurrenceRule = { freq: 'YEARLY', interval: 1 };
    const out = expandRecurrence(rule, at('2026-06-15T08:00:00Z'), win('2026-01-01T00:00:00Z', '2029-01-01T00:00:00Z'));
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-06-15', '2027-06-15', '2028-06-15']);
  });

  it('windows: only returns occurrences inside [from,to) but counts from dtstart', () => {
    const rule: RecurrenceRule = { freq: 'WEEKLY', interval: 1, count: 10 };
    const out = expandRecurrence(rule, at('2026-01-04T08:00:00Z'), win('2026-02-01T00:00:00Z', '2026-02-28T00:00:00Z'));
    // weeks 5..8 of the series fall in February
    expect(out.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22']);
  });

  it('validates rules', () => {
    expect(isValidRecurrenceRule({ freq: 'WEEKLY', interval: 1 })).toBe(true);
    expect(isValidRecurrenceRule({ freq: 'WEEKLY', interval: 0 })).toBe(false);
    expect(isValidRecurrenceRule({ freq: 'HOURLY', interval: 1 })).toBe(false);
    expect(isValidRecurrenceRule({ freq: 'WEEKLY', interval: 1, byWeekday: [7] })).toBe(false);
    expect(isValidRecurrenceRule({ freq: 'MONTHLY', interval: 1, bySetPos: [{ weekday: 0, nth: 0 }] })).toBe(false);
  });

  it('describes rules', () => {
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 1, byWeekday: [0, 3] })).toBe('Weekly on Sun, Wed');
    expect(describeRecurrence({ freq: 'WEEKLY', interval: 2 })).toBe('Every 2 weeks');
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 1, bySetPos: [{ weekday: 0, nth: 1 }] })).toBe(
      'Monthly on the 1st Sun',
    );
  });
});
