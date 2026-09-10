'use client';

import React from 'react';
import Link from 'next/link';
import { Users, UserPlus, Award, CheckCircle2, ArrowUpRight } from 'lucide-react';

interface MemberRetentionCardProps {
  totalMembers: number;
  memberStatuses: Record<string, number>;
  attendanceRate?: number | null;
  loading?: boolean;
}

export const MemberRetentionCard: React.FC<MemberRetentionCardProps> = ({
  totalMembers = 0,
  memberStatuses = {},
  attendanceRate = null,
  loading = false,
}) => {
  const activeCount = memberStatuses['ACTIVE'] || 0;
  const newCount = memberStatuses['NEW_MEMBER'] || 0;
  const onLeaveCount = memberStatuses['ON_LEAVE'] || 0;
  const inactiveCount = memberStatuses['INACTIVE'] || 0;

  const total = totalMembers || activeCount + newCount + onLeaveCount + inactiveCount || 1;

  const activePct = Math.round((activeCount / total) * 100);
  const newPct = Math.round((newCount / total) * 100);
  const onLeavePct = Math.round((onLeaveCount / total) * 100);
  const inactivePct = Math.max(0, 100 - activePct - newPct - onLeavePct);

  const retentionScore = attendanceRate ? `${attendanceRate.toFixed(1)}%` : `${activePct}%`;

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Member Retention &amp; Milestones
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                Assimilation Index
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Congregational lifecycle health, attendance consistency, and membership progression
            </p>
          </div>
          <Link
            href="/admin/members"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Directory
          </Link>
        </div>

        {/* 3 Metric Pills */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mt-4">
          {/* Active Regulars */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Users className="w-3 h-3 text-indigo-500" />
              Active
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              {activeCount}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{activePct}% of roster</p>
          </div>

          {/* New In-take */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <UserPlus className="w-3 h-3 text-emerald-500" />
              New Intakes
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              {newCount}
            </p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
              In assimilation
            </p>
          </div>

          {/* Retention Rate */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Award className="w-3 h-3 text-amber-500" />
              Consistency
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
              {retentionScore}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Active engagement</p>
          </div>
        </div>

        {/* Lifecycle Multi-Segment Bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Membership Lifecycle Distribution
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              {totalMembers} Total Registered
            </span>
          </div>

          {/* Segmented bar */}
          <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
            <div
              style={{ width: `${Math.max(activePct, 5)}%` }}
              className="bg-indigo-600 transition-all"
              title={`Active Regulars: ${activeCount} (${activePct}%)`}
            />
            <div
              style={{ width: `${Math.max(newPct, 3)}%` }}
              className="bg-emerald-500 transition-all"
              title={`New Members: ${newCount} (${newPct}%)`}
            />
            <div
              style={{ width: `${Math.max(onLeavePct, 2)}%` }}
              className="bg-amber-400 transition-all"
              title={`On Leave: ${onLeaveCount} (${onLeavePct}%)`}
            />
            <div
              style={{ width: `${Math.max(inactivePct, 2)}%` }}
              className="bg-slate-300 dark:bg-slate-700 transition-all"
              title={`Inactive: ${inactiveCount} (${inactivePct}%)`}
            />
          </div>

          {/* Legend row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
              <span>Active Regulars ({activeCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>New Members ({newCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span>On Leave ({onLeaveCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
              <span>Inactive ({inactiveCount})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer link */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Updated continuously from check-in logs</span>
        <Link
          href="/admin/members"
          className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          <span>Manage Members</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
