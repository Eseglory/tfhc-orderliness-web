'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, ShieldAlert, FileText, ArrowRight, UserX, Clock } from 'lucide-react';

export interface PendingActionSummary {
  excusesCount: number;
  correctionsCount: number;
  approvalsCount: number;
  flagsCount: number;
}

interface PendingActionsPanelProps {
  summary: PendingActionSummary;
  loading?: boolean;
}

export const PendingActionsPanel: React.FC<PendingActionsPanelProps> = ({
  summary,
  loading = false,
}) => {
  const totalPending =
    (summary.excusesCount || 0) +
    (summary.correctionsCount || 0) +
    (summary.approvalsCount || 0) +
    (summary.flagsCount || 0);

  const actionItems = [
    {
      id: 'excuses',
      title: 'Pending Absence Excuses',
      count: summary.excusesCount,
      desc: 'Members requesting absence approval for scheduled meetings',
      href: '/admin/approvals?tab=excuses',
      tone: 'amber',
    },
    {
      id: 'corrections',
      title: 'Attendance Corrections',
      count: summary.correctionsCount,
      desc: 'Disputed attendance marks and missed check-in reviews',
      href: '/admin/approvals?tab=corrections',
      tone: 'indigo',
    },
    {
      id: 'approvals',
      title: 'Workflow & Welfare Requests',
      count: summary.approvalsCount,
      desc: 'Multi-step approvals, welfare assistance, and expense requests',
      href: '/admin/approvals?tab=workflows',
      tone: 'purple',
    },
    {
      id: 'flags',
      title: 'Pastoral Follow-Up Flags',
      count: summary.flagsCount,
      desc: 'Congregants with consecutive absences or check-in dropouts',
      href: '/admin/follow-up',
      tone: 'rose',
    },
  ];

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Pending Administrative Actions
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  totalPending > 0
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 animate-pulse'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                }`}
              >
                {totalPending > 0 ? `${totalPending} Attention Items` : 'Queue Cleared'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review requests, excuses, and pastoral care workflows requiring authorization
            </p>
          </div>

          <Link
            href="/admin/approvals"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Review All
          </Link>
        </div>

        {/* List of Attention Items */}
        <div className="mt-4 space-y-2.5">
          {actionItems.map((item) => {
            const hasItems = item.count > 0;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  hasItems
                    ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                    : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800/60 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </span>
                    {hasItems && (
                      <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-md bg-amber-500 text-white">
                        {item.count}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {item.desc}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                      hasItems
                        ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-xs'
                        : 'bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {hasItems ? 'Review' : 'Clear'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Instant email and mobile push notifications active</span>
        <Link
          href="/admin/approvals"
          className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          <span>Approvals Center</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
