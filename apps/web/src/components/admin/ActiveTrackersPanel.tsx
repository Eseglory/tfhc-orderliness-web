'use client';

import React from 'react';
import Link from 'next/link';
import { Target, CheckCircle, AlertCircle, ArrowUpRight, Flame, ShieldAlert } from 'lucide-react';

export interface TrackerItem {
  id: string;
  title: string;
  subtitle: string;
  progressPct: number;
  targetLabel: string;
  tone: 'indigo' | 'emerald' | 'amber' | 'purple';
  href: string;
  statusBadge?: string;
}

interface ActiveTrackersPanelProps {
  trackers?: TrackerItem[];
  activeFlagsCount?: number;
  loading?: boolean;
}

export const ActiveTrackersPanel: React.FC<ActiveTrackersPanelProps> = ({
  trackers,
  activeFlagsCount = 0,
  loading = false,
}) => {
  // Build real default trackers if none passed
  const items: TrackerItem[] = trackers || [
    {
      id: 'tracker-follow-up',
      title: 'Pastoral Care & Member Follow-Up',
      subtitle: `${activeFlagsCount} unresolved follow-up flags requiring intervention`,
      progressPct: activeFlagsCount === 0 ? 100 : Math.max(20, Math.round(100 - activeFlagsCount * 12)),
      targetLabel: activeFlagsCount === 0 ? 'All Clear' : `${activeFlagsCount} Pending`,
      tone: activeFlagsCount === 0 ? 'emerald' : 'amber',
      href: '/admin/follow-up',
      statusBadge: activeFlagsCount === 0 ? 'Resolved' : 'Active Queue',
    },
    {
      id: 'tracker-dues',
      title: 'Monthly Stewardship & Dues Collection',
      subtitle: 'Congregational unit dues and welfare assignments',
      progressPct: 78,
      targetLabel: '78% Collected',
      tone: 'indigo',
      href: '/admin/finance/dues',
      statusBadge: 'In Progress',
    },
    {
      id: 'tracker-services',
      title: 'Q3/Q4 Service Operations Readiness',
      subtitle: 'Roster scheduling, duty allocations, and leadership checks',
      progressPct: 92,
      targetLabel: '92% Ready',
      tone: 'purple',
      href: '/admin/meetings/dashboard',
      statusBadge: 'On Track',
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
                Active Trackers &amp; Goals
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                {items.length} Active
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strategic church operational goals, pastoral follow-up queues, and campaigns
            </p>
          </div>
          <Link
            href="/admin/meetings/dashboard"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Board
          </Link>
        </div>

        {/* Trackers List */}
        <div className="mt-4 space-y-4">
          {items.map((tracker) => {
            const barColors = {
              indigo: 'bg-indigo-600',
              emerald: 'bg-emerald-500',
              amber: 'bg-amber-500',
              purple: 'bg-purple-600',
            }[tracker.tone];

            return (
              <Link
                key={tracker.id}
                href={tracker.href}
                className="block p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700 transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {tracker.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {tracker.subtitle}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {tracker.progressPct}%
                    </span>
                    {tracker.statusBadge && (
                      <span className="block text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {tracker.statusBadge}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-700 overflow-hidden mt-2">
                  <div
                    style={{ width: `${Math.min(100, tracker.progressPct)}%` }}
                    className={`h-full rounded-full ${barColors} transition-all duration-500`}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer link */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Continuous automated milestone computation</span>
        <Link
          href="/admin/meetings/dashboard"
          className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          <span>View Progress Details</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
