'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { TrendingUp, BarChart3, ChevronRight, Calendar } from 'lucide-react';

export interface MemberMonthlyTrendPoint {
  month: string;
  attended: number;
  total: number;
  punctual: number;
  rate: number;
}

interface MemberAttendanceTrendChartProps {
  trendData?: MemberMonthlyTrendPoint[];
  attendanceRate?: number;
  punctualityRate?: number;
}

export const MemberAttendanceTrendChart: React.FC<MemberAttendanceTrendChartProps> = ({
  trendData = [],
  attendanceRate = 0,
  punctualityRate = 0,
}) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly'>('monthly');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const data = useMemo(() => {
    return Array.isArray(trendData) ? trendData : [];
  }, [trendData]);

  const maxVal = 100;

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#f2320c] dark:text-red-400">
                ATTENDANCE TRENDS
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-[#f2320c] dark:bg-red-950/60 dark:text-red-400">
                6-Month Momentum
              </span>
            </div>
            <h3 className="text-base font-extrabold text-[#0b1c30] dark:text-white mt-0.5">
              Performance Activity Graph
            </h3>
          </div>

          {/* Quick Filter Pill */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'monthly'
                  ? 'bg-[#0b1c30] text-white shadow-xs dark:bg-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'weekly'
                  ? 'bg-[#0b1c30] text-white shadow-xs dark:bg-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Services
            </button>
          </div>
        </div>

        {/* Graph Summary Metrics */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Attendance Rate</p>
            <p className="text-lg font-black text-[#0b1c30] dark:text-white leading-tight mt-0.5">
              {attendanceRate > 0 ? `${attendanceRate.toFixed(0)}%` : '0%'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Punctuality Score</p>
            <p className="text-lg font-black text-[#f2320c] leading-tight mt-0.5">
              {punctualityRate > 0 ? `${punctualityRate.toFixed(0)}%` : '0%'}
            </p>
          </div>
        </div>

        {/* Bar Chart Visualization */}
        <div className="mt-4 pt-2">
          {data.length === 0 ? (
            <div className="h-40 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center p-4">
              <BarChart3 className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No attendance history yet</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Check in to your upcoming services to build your activity trends.</p>
            </div>
          ) : (
            <div className="h-40 flex items-end justify-between gap-2 px-1 relative">
              {/* Horizontal Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
                <div className="border-b border-dashed border-slate-200 dark:border-slate-700 w-full" />
                <div className="border-b border-dashed border-slate-200 dark:border-slate-700 w-full" />
                <div className="border-b border-dashed border-slate-200 dark:border-slate-700 w-full" />
              </div>

              {data.map((item, idx) => {
                const attHeight = Math.max(12, (item.rate / maxVal) * 100);
                const isHovered = hoveredIndex === idx;

                return (
                  <div
                    key={item.month}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="flex-1 flex flex-col items-center h-full justify-end relative cursor-pointer group z-10"
                  >
                    {/* Tooltip on hover */}
                    {isHovered && (
                      <div className="absolute -top-12 z-30 bg-[#0b1c30] text-white text-[10px] font-bold py-1 px-2 rounded-lg shadow-lg whitespace-nowrap">
                        <div>{item.month}: {item.rate}% ({item.attended}/{item.total})</div>
                        <div className="text-amber-300">Punctual: {item.punctual}</div>
                      </div>
                    )}

                    {/* Dual Bar (Attendance + Punctuality) */}
                    <div className="w-full max-w-[28px] flex items-end justify-center gap-1 h-full pb-1">
                      {/* Attendance Bar */}
                      <div
                        style={{ height: `${attHeight}%` }}
                        className={`w-full rounded-t-md transition-all duration-300 ${
                          isHovered
                            ? 'bg-[#f2320c] shadow-md shadow-red-500/20'
                            : 'bg-[#0b1c30] dark:bg-slate-300 group-hover:bg-[#f2320c]'
                        }`}
                      />
                    </div>

                    {/* X-axis label */}
                    <span className={`text-[11px] font-bold mt-1 transition-colors ${
                      isHovered ? 'text-[#f2320c]' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Legend & Link */}
      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0b1c30] dark:bg-slate-300" />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Monthly Avg</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f2320c]" />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Peak Performance</span>
          </div>
        </div>

        <Link
          href="/member/analytics"
          className="text-[11px] font-bold text-[#f2320c] dark:text-red-400 hover:underline flex items-center gap-0.5"
        >
          Detailed Analytics <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
