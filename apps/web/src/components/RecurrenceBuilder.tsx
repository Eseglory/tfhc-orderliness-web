'use client';
import React from 'react';
import { Field, inputClass } from './ui';

export interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byWeekday?: number[];
  bySetPos?: { weekday: number; nth: number }[];
  count?: number;
  until?: string;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** UI presets that map onto the shared RecurrenceRule shape. */
export type Preset = 'weekly' | 'fortnightly' | 'monthly-nth' | 'custom-weekly';

export function ruleToPreset(rule: RecurrenceRule | null, dayOfWeek: number): { preset: Preset; rule: RecurrenceRule } {
  if (!rule) return { preset: 'weekly', rule: { freq: 'WEEKLY', interval: 1, byWeekday: [dayOfWeek] } };
  if (rule.freq === 'MONTHLY' && rule.bySetPos?.length) return { preset: 'monthly-nth', rule };
  if (rule.freq === 'WEEKLY' && rule.interval === 2) return { preset: 'fortnightly', rule };
  if (rule.freq === 'WEEKLY' && (rule.byWeekday?.length ?? 0) > 1) return { preset: 'custom-weekly', rule };
  return { preset: 'weekly', rule };
}

export function RecurrenceBuilder({
  value,
  dayOfWeek,
  onChange,
}: {
  value: RecurrenceRule;
  dayOfWeek: number;
  onChange: (rule: RecurrenceRule) => void;
}) {
  const { preset } = ruleToPreset(value, dayOfWeek);

  const setPreset = (p: Preset) => {
    if (p === 'weekly') onChange({ freq: 'WEEKLY', interval: 1, byWeekday: [dayOfWeek] });
    else if (p === 'fortnightly') onChange({ freq: 'WEEKLY', interval: 2, byWeekday: [dayOfWeek] });
    else if (p === 'custom-weekly') onChange({ freq: 'WEEKLY', interval: 1, byWeekday: value.byWeekday?.length ? value.byWeekday : [dayOfWeek] });
    else onChange({ freq: 'MONTHLY', interval: 1, bySetPos: [{ weekday: dayOfWeek, nth: 1 }] });
  };

  const toggleWeekday = (d: number) => {
    const cur = new Set(value.byWeekday ?? []);
    cur.has(d) ? cur.delete(d) : cur.add(d);
    onChange({ ...value, byWeekday: [...cur].sort() });
  };

  return (
    <div className="space-y-3 rounded-xl border border-outline-variant/30 p-3">
      <Field label="Repeats">
        <select className={inputClass} value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
          <option value="weekly">Every week</option>
          <option value="fortnightly">Every 2 weeks</option>
          <option value="custom-weekly">Selected weekdays</option>
          <option value="monthly-nth">Monthly (nth weekday)</option>
        </select>
      </Field>

      {preset === 'custom-weekly' && (
        <div className="flex flex-wrap gap-1.5">
          {DOW.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleWeekday(i)}
              className={`h-8 w-10 rounded-lg text-xs font-semibold ${
                (value.byWeekday ?? []).includes(i) ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {preset === 'monthly-nth' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Which">
            <select
              className={inputClass}
              value={value.bySetPos?.[0]?.nth ?? 1}
              onChange={(e) => onChange({ ...value, bySetPos: [{ weekday: value.bySetPos?.[0]?.weekday ?? dayOfWeek, nth: Number(e.target.value) }] })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{['', '1st', '2nd', '3rd', '4th'][n]}</option>
              ))}
              <option value={-1}>Last</option>
            </select>
          </Field>
          <Field label="Weekday">
            <select
              className={inputClass}
              value={value.bySetPos?.[0]?.weekday ?? dayOfWeek}
              onChange={(e) => onChange({ ...value, bySetPos: [{ weekday: Number(e.target.value), nth: value.bySetPos?.[0]?.nth ?? 1 }] })}
            >
              {DOW.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <Field label="Ends (optional)" hint="Leave blank for no end date">
        <input
          type="date"
          className={inputClass}
          value={value.until?.slice(0, 10) ?? ''}
          onChange={(e) => onChange({ ...value, until: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined })}
        />
      </Field>
    </div>
  );
}
