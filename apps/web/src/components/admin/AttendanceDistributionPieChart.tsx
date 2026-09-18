'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { PieChart as PieIcon, ArrowUpRight, CheckCircle2 } from 'lucide-react';

interface AttendanceDistributionPieChartProps {
  totals?: {
    attended: number;
    punctual: number;
    absent: number;
    excused: number;
  };
  attendanceRate?: number | null;
  punctualityRate?: number | null;
  loading?: boolean;
}

export const AttendanceDistributionPieChart: React.FC<AttendanceDistributionPieChartProps> = ({
  totals,
  attendanceRate = null,
  punctualityRate = null,
  loading = false,
}) => {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const rawTotals = totals || { attended: 0, punctual: 0, absent: 0, excused: 0 };

  const punctualCount = rawTotals.punctual || 0;
  const lateCount = Math.max(0, (rawTotals.attended || 0) - punctualCount);
  const excusedCount = rawTotals.excused || 0;
  const absentCount = rawTotals.absent || 0;

  const totalSegments = punctualCount + lateCount + excusedCount + absentCount;

  // Pie slice calculations
  const slices = useMemo(() => {
    if (totalSegments === 0) {
      return [
        { key: 'empty', label: 'No records', count: 1, pct: 100, color: '#e2e8f0', textColor: 'text-slate-400' },
      ];
    }

    const items = [
      {
        key: 'punctual',
        label: 'Punctual (On-Time)',
        count: punctualCount,
        pct: Math.round((punctualCount / totalSegments) * 100),
        color: '#f2320c',
        textColor: 'text-[#f2320c]',
        bgClass: 'bg-[#f2320c]',
      },
      {
        key: 'late',
        label: 'Late / Grace Period',
        count: lateCount,
        pct: Math.round((lateCount / totalSegments) * 100),
        color: '#0b1c30',
        textColor: 'text-[#0b1c30] dark:text-slate-200',
        bgClass: 'bg-[#0b1c30] dark:bg-slate-300',
      },
      {
        key: 'excused',
        label: 'Approved Excuses',
        count: excusedCount,
        pct: Math.round((excusedCount / totalSegments) * 100),
        color: '#f59e0b',
        textColor: 'text-amber-600 dark:text-amber-400',
        bgClass: 'bg-amber-500',
      },
      {
        key: 'absent',
        label: 'Unexcused Absence',
        count: absentCount,
        pct: Math.round((absentCount / totalSegments) * 100),
        color: '#cbd5e1',
        textColor: 'text-slate-500 dark:text-slate-400',
        bgClass: 'bg-slate-300 dark:bg-slate-700',
      },
    ];

    return items;
  }, [totalSegments, punctualCount, lateCount, excusedCount, absentCount]);

  // Generate SVG conic circle segments
  const circumference = 2 * Math.PI * 40; // r = 40
  let accumulatedOffset = 0;

  const donutSegments = slices.map((slice) => {
    const fraction = totalSegments > 0 ? slice.count / totalSegments : 1;
    const strokeDash = fraction * circumference;
    const strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += strokeDash;

    return {
      ...slice,
      strokeDasharray: `${strokeDash} ${circumference - strokeDash}`,
      strokeDashoffset,
    };
  });

  const rateDisplay = attendanceRate != null ? `${attendanceRate}%` : totalSegments > 0 ? `${Math.round(((punctualCount + lateCount) / totalSegments) * 100)}%` : '0%';

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <PieIcon className="w-4 h-4 text-[#f2320c]" />
                <span>Status Breakdown</span>
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-[#f2320c] dark:bg-red-950/60 dark:text-red-400">
                Live Distribution
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Attendance &amp; punctuality composition
            </p>
          </div>

          <Link
            href="/admin/reports"
            className="text-xs font-bold text-[#f2320c] dark:text-red-400 hover:text-[#d82a08] flex items-center gap-0.5"
          >
            <span>Details</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Content: Donut Pie + Breakdown List */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading breakdown data...</div>
        ) : (
          <div className="mt-5 flex flex-col sm:flex-row items-center gap-6">
            {/* Donut Chart */}
            <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="12"
                  className="dark:stroke-slate-800"
                />
                {totalSegments > 0 ? (
                  donutSegments.map((seg) => (
                    <circle
                      key={seg.key}
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={hoveredSlice === seg.key ? '14' : '12'}
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      strokeLinecap="butt"
                      className="transition-all duration-300 cursor-pointer"
                      onMouseEnter={() => setHoveredSlice(seg.key)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    />
                  ))
                ) : (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#f2320c"
                    strokeWidth="12"
                    strokeDasharray={`${circumference} 0`}
                    strokeLinecap="butt"
                  />
                )}
              </svg>

              {/* Center Content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-xl font-black text-slate-900 dark:text-white leading-none">
                  {rateDisplay}
                </span>
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">
                  Attendance
                </span>
              </div>
            </div>

            {/* Slices Legend Breakdown */}
            <div className="flex-1 w-full space-y-2">
              {slices.filter((s) => s.key !== 'empty').map((slice) => {
                const isHovered = hoveredSlice === slice.key;
                return (
                  <div
                    key={slice.key}
                    onMouseEnter={() => setHoveredSlice(slice.key)}
                    onMouseLeave={() => setHoveredSlice(null)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      isHovered
                        ? 'bg-slate-100/80 dark:bg-slate-800 border-slate-300 dark:border-slate-700 shadow-xs'
                        : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate text-[11px]">
                          {slice.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                          {slice.count}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 w-8 text-right">
                          {slice.pct}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span className="truncate">
          {punctualityRate != null ? `Punctuality index: ${punctualityRate}%` : 'Real-time telemetry'}
        </span>
        <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px]">
          {totalSegments > 0 ? `${totalSegments} total marks` : 'Active period'}
        </span>
      </div>
    </div>
  );
};
