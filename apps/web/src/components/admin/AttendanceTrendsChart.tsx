'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { BarChart3, TrendingUp, Calendar, ArrowUpRight, Info } from 'lucide-react';

export interface ServiceDataPoint {
  id: string;
  title: string;
  date: string;
  attended: number;
  punctual: number;
  absent: number;
  excused: number;
}

interface AttendanceTrendsChartProps {
  services: ServiceDataPoint[];
  days: number;
  onDaysChange: (days: number) => void;
  loading?: boolean;
}

export const AttendanceTrendsChart: React.FC<AttendanceTrendsChartProps> = ({
  services = [],
  days,
  onDaysChange,
  loading = false,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Identify peak service
  const peakService = useMemo(() => {
    if (!services || services.length === 0) return null;
    return services.reduce((max, curr) => (curr.attended > max.attended ? curr : max), services[0]);
  }, [services]);

  // Aggregate by service or date
  const chartData = useMemo(() => {
    if (!services || services.length === 0) return [];
    // Take up to latest 8 services to keep chart clean and readable
    return services.slice(-8);
  }, [services]);

  const maxAttended = useMemo(() => {
    if (chartData.length === 0) return 100;
    const max = Math.max(...chartData.map((d) => d.attended + d.absent), 10);
    return Math.ceil(max * 1.15); // Add 15% headroom
  }, [chartData]);

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      {/* Header with Title, Legends & Range Switcher */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Attendance Trends by Service
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                Live Roster Data
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Breakdown of congregational attendance and punctuality across recent services
            </p>
          </div>

          {/* Date range buttons */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shrink-0 self-start sm:self-auto">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  days === d
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Legend Indicators */}
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 shrink-0" />
            <span>Attended (Punctual)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 shrink-0" />
            <span>Late / Grace</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 dark:bg-slate-700 shrink-0" />
            <span>Absent / Expected</span>
          </div>
        </div>
      </div>

      {/* SVG Multi-Bar / Column Chart */}
      <div className="my-6 relative min-h-[190px] flex items-end">
        {loading ? (
          <div className="w-full h-44 flex items-center justify-center text-xs text-slate-400">
            Loading attendance analytics...
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-44 flex flex-col items-center justify-center text-center p-4">
            <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No closed service records in this range
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Attendance records will display once meetings or Sunday services are closed.
            </p>
          </div>
        ) : (
          <div className="w-full">
            {/* Chart Area */}
            <div className="flex items-end justify-between gap-2 sm:gap-4 h-40 pt-4 px-2 border-b border-slate-200/80 dark:border-slate-800">
              {chartData.map((item, idx) => {
                const total = item.attended + item.absent || 1;
                const attendedPct = Math.min(100, Math.round((item.attended / maxAttended) * 100));
                const punctualPct = Math.min(100, Math.round((item.punctual / maxAttended) * 100));
                const absentPct = Math.min(100, Math.round((item.absent / maxAttended) * 100));
                const isHovered = hoveredIndex === idx;
                const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <div
                    key={item.id || idx}
                    className="flex-1 flex flex-col items-center group relative cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    {/* Hover Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-20 z-20 bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 text-[11px] p-2.5 rounded-xl shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95 duration-100 border border-slate-700">
                        <p className="font-bold text-xs">{item.title}</p>
                        <p className="text-slate-400 text-[10px] mb-1">{formattedDate}</p>
                        <div className="flex items-center justify-between gap-3 text-[10px]">
                          <span className="text-indigo-300 font-medium">Attended: {item.attended}</span>
                          <span className="text-emerald-300 font-medium">Punctual: {item.punctual}</span>
                          <span className="text-slate-400">Absent: {item.absent}</span>
                        </div>
                      </div>
                    )}

                    {/* Bar Column Stack */}
                    <div className="w-full max-w-[42px] flex items-end justify-center gap-0.5 h-32">
                      {/* Punctual bar */}
                      <div
                        style={{ height: `${Math.max(punctualPct, 4)}%` }}
                        className="w-1/2 bg-indigo-600 dark:bg-indigo-500 rounded-t-md transition-all group-hover:brightness-110"
                      />
                      {/* Late / Other Attended bar */}
                      <div
                        style={{ height: `${Math.max(attendedPct - punctualPct, 4)}%` }}
                        className="w-1/3 bg-indigo-400 dark:bg-indigo-400/80 rounded-t-md transition-all group-hover:brightness-110"
                      />
                      {/* Absent bar */}
                      <div
                        style={{ height: `${Math.max(absentPct, 4)}%` }}
                        className="w-1/4 bg-slate-200 dark:bg-slate-700 rounded-t-md transition-all group-hover:brightness-110"
                      />
                    </div>

                    {/* X-axis label */}
                    <span className="mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[60px] text-center">
                      {formattedDate}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Callout & Link */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {peakService ? (
            <p className="text-slate-700 dark:text-slate-300 font-medium">
              <span className="font-bold text-indigo-600 dark:text-indigo-400">Peak Service:</span>{' '}
              {peakService.title} with {peakService.attended} attendees on{' '}
              {new Date(peakService.date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </p>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">
              Select date range to view comparative attendance velocity.
            </p>
          )}
        </div>

        <Link
          href="/admin/reports"
          className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          <span>View Roster Analytics</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
