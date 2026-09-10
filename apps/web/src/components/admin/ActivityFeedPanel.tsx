'use client';

import React from 'react';
import Link from 'next/link';
import { History, UserCheck, Calendar, CheckCircle2, Shield, ArrowUpRight, DollarSign } from 'lucide-react';

export interface ActivityItem {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  actorName?: string;
  category?: 'member' | 'attendance' | 'approval' | 'finance' | 'system';
  badge?: string;
}

interface ActivityFeedPanelProps {
  activities?: ActivityItem[];
  loading?: boolean;
}

export const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({
  activities = [],
  loading = false,
}) => {
  const getCategoryIcon = (cat?: string) => {
    switch (cat) {
      case 'attendance':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'member':
        return <UserCheck className="w-3.5 h-3.5 text-indigo-500" />;
      case 'approval':
        return <Shield className="w-3.5 h-3.5 text-amber-500" />;
      case 'finance':
        return <DollarSign className="w-3.5 h-3.5 text-purple-500" />;
      default:
        return <History className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const formatRelative = (ts: string) => {
    try {
      const diffMs = Date.now() - new Date(ts).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Recent Ministry Activity Feed
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                Live Stream
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Operational records across field sessions and auxiliary leadership
            </p>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            View Master Log
          </Link>
        </div>

        {/* Feed List */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Streaming activity logs...</div>
          ) : activities.length === 0 ? (
            <div className="py-8 text-center">
              <History className="w-7 h-7 text-slate-300 dark:text-slate-700 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No recent activity records
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Activity records will populate as administrators and members take action.
              </p>
            </div>
          ) : (
            activities.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  {getCategoryIcon(item.category)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {item.action}
                    </p>
                    <span className="text-[10px] font-medium text-slate-400 shrink-0">
                      {formatRelative(item.timestamp)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1 mt-0.5">
                    {item.description}
                  </p>
                  {item.badge && (
                    <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer link */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Immutable audit tracking active</span>
        <Link
          href="/admin/audit"
          className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          <span>Audit Log</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
