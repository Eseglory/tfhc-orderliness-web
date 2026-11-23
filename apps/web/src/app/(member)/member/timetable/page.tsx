'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { LogoIcon } from '../../../../components/LogoIcon';
import { PageLoader } from '../../../../components/ui';

interface TimetableAssignment {
  memberId: string;
  fullName: string;
  memberCode: string;
  profilePhotoUrl?: string | null;
  roleTitle?: string;
}

interface TimetableSession {
  id: string;
  sessionKey: string;
  serviceTitle: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  locationName: string;
  requiredUshers: number;
  assignments: TimetableAssignment[];
}

interface MemberTimetableResponse {
  period: {
    id: string;
    weekLabel: string;
    startDate: string;
    endDate: string;
    targetWeek: string;
  } | null;
  version: {
    id: string;
    versionNumber: number;
    status: string;
    publishedAt: string | null;
  } | null;
  sessions: TimetableSession[];
  myAssignments: Array<{
    sessionKey: string;
    serviceTitle: string;
    serviceDate: string;
    startTime: string;
    endTime: string;
    locationName: string;
    roleTitle?: string;
  }>;
}

export default function MemberTimetablePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<MemberTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchApi<MemberTimetableResponse>('/me/timetable/current')
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load timetable');
      })
      .finally(() => setLoading(false));
  }, []);

  const isPublished = data?.version?.status === 'PUBLISHED';
  const myAssignments = data?.myAssignments || [];

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-white pb-28 antialiased">
      {/* Top Header */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 sm:px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Go Back"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <div>
            <h1 className="text-base font-extrabold text-[#0b1c30] dark:text-white leading-tight">
              Ushering Timetable
            </h1>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {data?.period?.weekLabel || 'This Week'}
            </p>
          </div>
        </div>

        {user && (user.role !== 'MEMBER' || user.isSuperAdmin) && (
          <Link
            href="/admin/timetable"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] text-white font-bold text-xs transition-all shadow-xs"
          >
            <span className="material-symbols-outlined text-sm text-amber-300">admin_panel_settings</span>
            <span>Admin</span>
          </Link>
        )}
      </header>

      <main className="flex w-full flex-1 flex-col gap-5 px-4 sm:px-6 pt-5 max-w-4xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <PageLoader message="Loading weekly timetable..." />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-5 text-center">
            <span className="material-symbols-outlined text-3xl text-rose-500 mb-2">error</span>
            <p className="text-sm font-bold text-rose-800 dark:text-rose-200">{error}</p>
          </div>
        ) : !isPublished ? (
          /* Unapproved / In Preparation State */
          <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">pending_actions</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 mb-3">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Under Finalisation
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0b1c30] dark:text-white">
              Timetable for this week is being finalised.
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2 leading-relaxed">
              The ushering roster is currently undergoing review and verification by the leadership team. Please check back soon once approved and published.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Link
                href="/member"
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        ) : (
          /* Published Timetable */
          <>
            {/* Week Status Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">verified</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      Approved & Published
                    </span>
                    <span className="text-[11px] text-slate-400">•</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Version {data.version?.versionNumber}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#0b1c30] dark:text-white mt-0.5">
                    {data.period?.weekLabel}
                  </p>
                </div>
              </div>
            </div>

            {/* My Personal Assignment Alert */}
            {myAssignments.length > 0 ? (
              <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/5 p-4 sm:p-5 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                    <span className="material-symbols-outlined text-2xl">how_to_reg</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white mb-1.5">
                      Your Duty This Week
                    </span>
                    <h3 className="text-base font-extrabold text-emerald-950 dark:text-emerald-100">
                      You are scheduled to serve in {myAssignments.length} service{myAssignments.length > 1 ? 's' : ''}!
                    </h3>
                    <div className="mt-3 flex flex-col gap-2">
                      {myAssignments.map((a, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-emerald-200 dark:border-emerald-800/60 shadow-xs"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-[#0b1c30] dark:text-white truncate">
                              {a.serviceTitle}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                              {a.startTime} – {a.endTime} WAT • {a.locationName || 'Main Sanctuary'}
                            </p>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold shrink-0">
                            {a.roleTitle || 'Usher'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">event_seat</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Not rostered to serve this week
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Enjoy worship in God&apos;s presence! You may be scheduled in an upcoming week.
                  </p>
                </div>
              </div>
            )}

            {/* All Weekly Sessions */}
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                Full Weekly Schedule
              </h2>

              {data.sessions?.map((session) => {
                const isAssigned = session.assignments?.some(
                  (a) => a.memberId === user?.memberId
                );

                return (
                  <div
                    key={session.id}
                    className={`rounded-2xl border transition-all ${
                      isAssigned
                        ? 'border-emerald-500/60 bg-white dark:bg-slate-900 ring-2 ring-emerald-500/20 shadow-md'
                        : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
                    } p-4 sm:p-5`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-extrabold text-[#0b1c30] dark:text-white">
                            {session.serviceTitle}
                          </h3>
                          {isAssigned && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase">
                              Your Duty
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                            {session.startTime} – {session.endTime} WAT
                          </span>
                          <span>•</span>
                          <span>{session.locationName || 'Main Sanctuary'}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                          {session.assignments?.length || 0} Ushers
                        </span>
                      </div>
                    </div>

                    {/* Assigned Ushers List */}
                    <div className="mt-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Assigned Ushers
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {session.assignments?.map((u) => {
                          const isMe = u.memberId === user?.memberId;
                          return (
                            <div
                              key={u.memberId}
                              className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                                isMe
                                  ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-bold'
                                  : 'border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center text-xs font-bold">
                                {u.profilePhotoUrl ? (
                                  <img src={u.profilePhotoUrl} alt={u.fullName} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{u.fullName?.charAt(0) || 'U'}</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-extrabold truncate leading-tight">
                                  {u.fullName} {isMe && <span className="text-emerald-600 dark:text-emerald-400 font-black">(You)</span>}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {u.memberCode}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
