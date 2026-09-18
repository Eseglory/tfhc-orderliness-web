'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, Award } from 'lucide-react';

interface MemberAttendancePieChartProps {
  attendedCount?: number;
  onTimeCount?: number;
  absentCount?: number;
  excusedCount?: number;
  attendanceRate?: number;
  punctualityRate?: number;
  compositeScore?: number;
  rankPosition?: number;
}

export const MemberAttendancePieChart: React.FC<MemberAttendancePieChartProps> = ({
  attendedCount = 0,
  onTimeCount = 0,
  absentCount = 0,
  excusedCount = 0,
  attendanceRate = 0,
  punctualityRate = 0,
  compositeScore = 0,
  rankPosition,
}) => {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const presentVal = Math.max(0, attendedCount - onTimeCount);
  const onTimeVal = onTimeCount;
  const excusedVal = excusedCount;
  const absentVal = absentCount;
  const total = presentVal + onTimeVal + excusedVal + absentVal;
  const hasData = total > 0;

  const slices = useMemo(() => {
    return [
      {
        id: 'ontime',
        label: 'On-Time (Punctual)',
        count: onTimeVal,
        color: '#f2320c',
        bgClass: 'bg-[#f2320c]',
        textColor: 'text-[#f2320c]',
      },
      {
        id: 'present',
        label: 'Present (Standard)',
        count: presentVal,
        color: '#0b1c30',
        bgClass: 'bg-[#0b1c30] dark:bg-slate-300',
        textColor: 'text-[#0b1c30] dark:text-slate-200',
      },
      {
        id: 'excused',
        label: 'Approved Excuses',
        count: excusedVal,
        color: '#f59e0b',
        bgClass: 'bg-amber-500',
        textColor: 'text-amber-600 dark:text-amber-400',
      },
      {
        id: 'absent',
        label: 'Unexcused Absence',
        count: absentVal,
        color: '#cbd5e1',
        bgClass: 'bg-slate-300 dark:bg-slate-700',
        textColor: 'text-slate-500 dark:text-slate-400',
      },
    ];
  }, [presentVal, onTimeVal, excusedVal, absentVal]);

  // Circumference for r=38
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  const donutSegments = slices.map((slice) => {
    const fraction = hasData && total > 0 ? slice.count / total : 0;
    const strokeLength = fraction * circumference;
    const strokeDasharray = `${strokeLength} ${circumference - strokeLength}`;
    const strokeDashoffset = -currentOffset;
    currentOffset += strokeLength;

    return {
      ...slice,
      fraction,
      percentage: hasData && total > 0 ? Math.round(fraction * 100) : 0,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const displayScore = hasData && attendanceRate > 0 ? `${attendanceRate.toFixed(0)}%` : (hasData ? '0%' : '—');

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0b1c30] dark:text-slate-300">
                DISTRIBUTION
              </span>
              {rankPosition && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800">
                  Rank #{rankPosition}
                </span>
              )}
            </div>
            <h3 className="text-base font-extrabold text-[#0b1c30] dark:text-white mt-0.5">
              Standing &amp; Status Breakdown
            </h3>
          </div>

          <Link
            href="/member/leaderboard"
            className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="View Leaderboard"
          >
            <Award className="w-4 h-4 text-amber-500" />
          </Link>
        </div>

        {/* Donut Chart and Legend */}
        <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
          {/* SVG Donut */}
          <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
              {/* Background ring */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke="currentColor"
                strokeWidth="11"
                className="text-slate-100 dark:text-slate-800"
              />
              {/* Slices */}
              {donutSegments.map((segment) => {
                const isHovered = hoveredSlice === segment.id;
                return (
                  <circle
                    key={segment.id}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke={segment.color}
                    strokeWidth={isHovered ? '14' : '11'}
                    strokeDasharray={segment.strokeDasharray}
                    strokeDashoffset={segment.strokeDashoffset}
                    strokeLinecap="butt"
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredSlice(segment.id)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                );
              })}
            </svg>

            {/* Central Score Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-[#0b1c30] dark:text-white leading-none">
                {displayScore}
              </span>
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight mt-0.5">
                Attendance
              </span>
            </div>
          </div>

          {/* Interactive Legend Breakdown */}
          <div className="flex-1 w-full space-y-2">
            {donutSegments.map((seg) => {
              const isHovered = hoveredSlice === seg.id;
              return (
                <div
                  key={seg.id}
                  onMouseEnter={() => setHoveredSlice(seg.id)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`flex items-center justify-between p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isHovered ? 'bg-slate-100/80 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {seg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-black ${seg.textColor}`}>
                      {hasData ? seg.count : `${seg.percentage}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          Total Sessions Logged: <strong className="text-slate-800 dark:text-slate-200">{hasData ? total : 18}</strong>
        </span>

        <Link
          href="/member/my-attendance"
          className="text-[11px] font-bold text-[#0b1c30] dark:text-slate-300 hover:underline flex items-center gap-0.5"
        >
          View Log <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
