'use client';

import React from 'react';
import Link from 'next/link';
import { Target, CheckCircle2, AlertCircle, ArrowUpRight, Flame, ShieldAlert, Check } from 'lucide-react';

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
  // If specific trackers are passed, use them; otherwise construct from real system state
  const items: TrackerItem[] = trackers || [
    {
      id: 'tracker-follow-up',
      title: 'Pastoral Care & Member Follow-Up',
      subtitle: activeFlagsCount === 0
        ? 'All member follow-up queues and consecutive absence flags resolved'
        : `${activeFlagsCount} congregant follow-up flags requiring intervention`,
      progressPct: activeFlagsCount === 0 ? 100 : Math.max(10, Math.round(100 - activeFlagsCount * 15)),
      targetLabel: activeFlagsCount === 0 ? 'All Clear' : `${activeFlagsCount} Pending`,
      tone: activeFlagsCount === 0 ? 'emerald' : 'amber',
      href: '/admin/follow-up',
      statusBadge: activeFlagsCount === 0 ? 'Resolved' : 'Requires Review',
    },
    {
      id: 'tracker-dues',
      title: 'Monthly Stewardship & Dues Collection',
      subtitle: 'Congregational unit dues and welfare assignments',
      progressPct: 100,
      targetLabel: 'Active Ledger',
      tone: 'indigo',
      href: '/admin/finance/dues',
      statusBadge: 'Active',
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
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                Live Status
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automated operational queues, pastoral follow-up flags, and campaign milestones
            </p>
          </div>
          <Link
            href="/admin/follow-up"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Manage
          </Link>
        </div>

        {/* Trackers List */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400">Loading active trackers...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                All tracking queues clear
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                No outstanding follow-up items or pending administrative alerts.
              </p>
            </div>
          ) : (
            items.map((tracker) => {
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
                        {tracker.targetLabel}
                      </span>
                      {tracker.statusBadge && (
                        <span
                          className={`block text-[10px] font-bold mt-0.5 ${
                            tracker.tone === 'emerald'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : tracker.tone === 'amber'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {tracker.statusBadge}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-700 overflow-hidden mt-2">
                    <div
                      style={{ width: `${Math.min(100, Math.max(5, tracker.progressPct))}%` }}
                      className={`h-full rounded-full ${barColors} transition-all duration-500`}
                    />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Footer link */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Continuous automated milestone calculation</span>
        <Link
          href="/admin/follow-up"
          className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          <span>View Flags Queue</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
