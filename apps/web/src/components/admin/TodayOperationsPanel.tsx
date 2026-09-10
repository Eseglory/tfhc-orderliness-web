'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, ArrowUpRight, Flame, Plus } from 'lucide-react';

export interface UpcomingMeetingItem {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  locationName?: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED' | string;
  category?: { name: string };
  attendanceCount?: number;
  expectedCount?: number;
}

interface TodayOperationsPanelProps {
  meetings: UpcomingMeetingItem[];
  activeMeeting?: UpcomingMeetingItem | null;
  loading?: boolean;
}

export const TodayOperationsPanel: React.FC<TodayOperationsPanelProps> = ({
  meetings = [],
  activeMeeting,
  loading = false,
}) => {
  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Today &amp; Upcoming
              </h2>
              {activeMeeting && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400 animate-pulse">
                  <Flame className="w-3 h-3 text-rose-500" />
                  Live Now
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Scheduled gatherings, services, and operational checkpoints
            </p>
          </div>

          <Link
            href="/admin/meetings"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            All Events
          </Link>
        </div>

        {/* Live Active Meeting Banner if active */}
        {activeMeeting && (
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-indigo-50 to-indigo-100/50 dark:from-indigo-950/40 dark:to-slate-900 border border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <p className="text-xs font-bold text-indigo-950 dark:text-indigo-200 truncate">
                  {activeMeeting.title}
                </p>
              </div>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{activeMeeting.locationName || 'Main Sanctuary'}</span>
              </p>
            </div>
            <Link
              href="/admin/live-meeting"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 shrink-0"
            >
              Take Roster
            </Link>
          </div>
        )}

        {/* Meeting Schedule List */}
        <div className="mt-3 space-y-2.5">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading scheduled operations...</div>
          ) : meetings.length === 0 && !activeMeeting ? (
            <div className="py-8 text-center">
              <Clock className="w-7 h-7 text-slate-300 dark:text-slate-700 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No upcoming meetings scheduled
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Create services or meetings to monitor operations in real time.
              </p>
              <Link
                href="/admin/meetings"
                className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Gathering</span>
              </Link>
            </div>
          ) : (
            meetings.slice(0, 4).map((m) => {
              const dateObj = new Date(m.startTime);
              const isToday = new Date().toDateString() === dateObj.toDateString();
              const timeString = dateObj.toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              });
              const dateString = isToday
                ? `Today, ${timeString}`
                : `${dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • ${timeString}`;

              return (
                <div
                  key={m.id}
                  className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-bold ${
                          isToday
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {dateString}
                      </span>
                      {m.category && (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {m.category.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
                      {m.title}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {m.locationName || 'Main Auditorium'}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/admin/meetings/${m.id}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60 shrink-0"
                    title="Manage Meeting"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Link */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Showing next scheduled gatherings</span>
        <Link
          href="/admin/calendar"
          className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          <span>Open Full Calendar</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
