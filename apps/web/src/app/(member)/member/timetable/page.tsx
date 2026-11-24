'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { PageLoader } from '../../../../components/ui';

interface TimetableAssignment {
  memberId: string;
  fullName: string;
  name?: string;
  memberCode: string;
  profilePhotoUrl?: string | null;
  roleTitle?: string;
  position?: string;
  role?: string;
  isMe?: boolean;
}

interface TimetableSession {
  id: string;
  sessionKey: string;
  serviceTitle: string;
  serviceName?: string;
  serviceDate: string;
  formattedDate?: string;
  startTime: string;
  endTime: string;
  locationName: string;
  location?: string;
  requiredUshers: number;
  supervisingMinister?: {
    id: string;
    name: string;
    preferredName?: string;
    roleInUnit?: string;
    profilePhotoUrl?: string | null;
  } | null;
  leadUsher?: {
    id: string;
    name: string;
    position?: string;
    role?: string;
    profilePhotoUrl?: string | null;
  } | null;
  chairArrangement?: {
    group: string;
    groupName: string;
    members?: any[];
    note?: string;
  } | null;
  assignments: TimetableAssignment[];
  ushers?: TimetableAssignment[];
}

interface MemberTimetableResponse {
  published?: boolean;
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
    sessionId?: string;
    sessionKey: string;
    serviceTitle: string;
    serviceName?: string;
    serviceDate: string;
    formattedDate?: string;
    startTime: string;
    endTime: string;
    locationName: string;
    roleTitle?: string;
    position?: string;
  }>;
}

export default function MemberTimetablePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<MemberTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyToast, setCopyToast] = useState('');
  const [selectedSessionModal, setSelectedSessionModal] = useState<TimetableSession | null>(null);

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

  const isPublished = data?.version?.status === 'PUBLISHED' || Boolean(data?.published);
  const myAssignments = data?.myAssignments || [];

  const triggerToast = (msg: string) => {
    setCopyToast(msg);
    setTimeout(() => setCopyToast(''), 3500);
  };

  const getFullRosterText = (): string => {
    if (!data) return '';
    const weekLabel = data.period?.weekLabel || (data as any)?.label || 'Current Week';
    let text = `🏛️ *THE FATHER'S HOUSE CHURCH (TFHC)*\n`;
    text += `📋 *USHERING DEPARTMENT WEEKLY ROSTER*\n`;
    text += `📅 *${weekLabel}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const sessions = data.sessions || [];
    sessions.forEach((s, idx) => {
      const title = s.serviceTitle || s.serviceName || `Service #${idx + 1}`;
      const date = s.formattedDate || (s.serviceDate ? new Date(s.serviceDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
      const times = s.startTime && s.endTime ? `${s.startTime} – ${s.endTime} WAT` : '';
      const location = s.locationName || s.location || 'Main Sanctuary';
      const minister = s.supervisingMinister?.name ? `${s.supervisingMinister.name}${s.supervisingMinister.roleInUnit ? ` (${s.supervisingMinister.roleInUnit})` : ''}` : 'To be assigned';
      const list = s.assignments || s.ushers || [];

      text += `🔹 *${date} — ${title}*\n`;
      if (times) text += `   ⏰ Time: ${times}\n`;
      text += `   📍 Venue: ${location}\n`;
      text += `   🛡️ Minister: ${minister}\n`;
      text += `   👥 Ushers (${list.length}):\n`;
      if (list.length === 0) {
        text += `      _No ushers assigned yet_\n`;
      } else {
        list.forEach((u, uIdx) => {
          const uName = u.fullName || u.name || 'Usher';
          const uCode = u.memberCode ? ` [${u.memberCode}]` : '';
          const uPos = u.position ? ` • ${u.position}` : '';
          text += `      ${uIdx + 1}. ${uName}${uCode}${uPos}\n`;
        });
      }
      text += `\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `• Please arrive and check in at least 30 minutes before service.\n`;
    text += `• Promptness, dedication, and excellence in God's house. 🙏\n`;
    return text;
  };

  const getSessionRosterText = (s: TimetableSession): string => {
    const title = s.serviceTitle || s.serviceName || 'Church Service';
    const date = s.formattedDate || (s.serviceDate ? new Date(s.serviceDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '');
    const times = s.startTime && s.endTime ? `${s.startTime} – ${s.endTime} WAT` : '';
    const location = s.locationName || s.location || 'Main Sanctuary';
    const minister = s.supervisingMinister?.name ? `${s.supervisingMinister.name}${s.supervisingMinister.roleInUnit ? ` (${s.supervisingMinister.roleInUnit})` : ''}` : 'To be assigned';
    const list = s.assignments || s.ushers || [];

    let text = `🏛️ *TFHC USHERING ROSTER — ${title.toUpperCase()}*\n`;
    text += `📅 *${date}*\n`;
    if (times) text += `⏰ Time: ${times}\n`;
    text += `📍 Venue: ${location}\n`;
    text += `🛡️ Supervising Minister: ${minister}\n\n`;
    text += `👥 *Assigned Ushers (${list.length}):*\n`;
    list.forEach((u, i) => {
      const uName = u.fullName || u.name || 'Usher';
      const uCode = u.memberCode ? ` [${u.memberCode}]` : '';
      const uPos = u.position ? ` • ${u.position}` : '';
      text += `${i + 1}. ${uName}${uCode}${uPos}\n`;
    });
    return text;
  };

  const getMyDutyText = (): string => {
    if (!myAssignments.length) return '';
    const weekLabel = data?.period?.weekLabel || (data as any)?.label || 'Current Week';
    let text = `🏛️ *TFHC USHERING DUTY SCHEDULE*\n`;
    text += `👤 *Usher:* ${user?.firstName} ${user?.lastName} (${(user as any)?.memberCode || 'Usher'})\n`;
    text += `📅 *${weekLabel}*\n\n`;
    text += `I am rostered to serve in the following service(s):\n\n`;

    myAssignments.forEach((a, i) => {
      const title = a.serviceTitle || a.serviceName || 'Church Service';
      const date = a.formattedDate || (a.serviceDate ? new Date(a.serviceDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) : '');
      const times = a.startTime && a.endTime ? `${a.startTime} – ${a.endTime} WAT` : '';
      text += `✅ *${i + 1}. ${date} — ${title}*\n`;
      if (times) text += `   ⏰ Time: ${times}\n`;
      text += `   📍 Venue: ${a.locationName || 'Main Sanctuary'}\n`;
      text += `   🎯 Role: ${a.roleTitle || a.position || 'General Usher'}\n\n`;
    });

    text += `_Promptness, dedication and excellence in God's presence._ 🙏`;
    return text;
  };

  const copyOrShare = async (text: string, title: string, successMsg: string) => {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text });
        triggerToast(successMsg);
        return;
      } catch (err) {
        // User cancelled share dialog or unsupported, fallback to clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      triggerToast(successMsg);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-white pb-28 antialiased">
      {/* Toast Notification */}
      {copyToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-700 text-white font-bold text-xs shadow-2xl animate-in fade-in slide-in-from-top-4">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          <span>{copyToast}</span>
        </div>
      )}

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
              This Week&apos;s Ushering Timetable
            </h1>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {data?.period?.weekLabel || (data as any)?.label || 'This Week'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (user.role !== 'MEMBER' || user.isSuperAdmin) && (
            <Link
              href="/admin/timetable"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0b1c30] hover:bg-[#162a42] text-white font-bold text-xs transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-sm text-amber-300">admin_panel_settings</span>
              <span>Admin</span>
            </Link>
          )}
        </div>
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
            {/* Week Status Banner & Share Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
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
                      Version {data?.version?.versionNumber ?? (data as any)?.versionNumber ?? 1}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#0b1c30] dark:text-white mt-0.5">
                    {data?.period?.weekLabel || (data as any)?.label || 'Current Week'}
                  </p>
                </div>
              </div>

              {/* Share & Export Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copyOrShare(getFullRosterText(), 'TFHC Ushering Roster', 'Weekly roster copied! Ready to paste into WhatsApp.')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-xs"
                  title="Share complete weekly roster to WhatsApp or social"
                >
                  <span className="material-symbols-outlined text-sm">share</span>
                  <span>Share WhatsApp Roster</span>
                </button>

                {myAssignments.length > 0 && (
                  <button
                    onClick={() => copyOrShare(getMyDutyText(), 'My TFHC Ushering Duty', 'My duty schedule copied! Ready to share.')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors border border-slate-200 dark:border-slate-700"
                    title="Share your personal service schedule"
                  >
                    <span className="material-symbols-outlined text-sm text-emerald-600">person</span>
                    <span>Share My Duty</span>
                  </button>
                )}

                <button
                  onClick={() => { if (typeof window !== 'undefined') window.print(); }}
                  className="flex items-center justify-center h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Print Timetable"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                </button>
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
                              {a.serviceTitle || a.serviceName}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                              {a.formattedDate ? `${a.formattedDate} • ` : ''}{a.startTime} – {a.endTime} WAT • {a.locationName || 'Main Sanctuary'}
                            </p>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold shrink-0">
                            {a.roleTitle || a.position || 'Usher'}
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
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Full Weekly Schedule ({data?.sessions?.length || 0} Services)
                </h2>
                <button
                  onClick={() => copyOrShare(getFullRosterText(), 'TFHC Ushering Roster', 'Weekly roster copied! Ready to paste into WhatsApp.')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  <span>Copy Entire Roster</span>
                </button>
              </div>

              {data?.sessions?.map((session) => {
                const assignments = session.assignments || session.ushers || [];
                const isAssigned = assignments.some(
                  (a) => a.memberId === user?.memberId || a.isMe
                );
                const sessionTitle = session.serviceTitle || session.serviceName || 'Service';
                const sessionDate = session.formattedDate || (session.serviceDate ? new Date(session.serviceDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '');

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
                            {sessionTitle}
                          </h3>
                          {isAssigned && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase">
                              Your Duty
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                          {sessionDate && <span className="font-semibold text-slate-700 dark:text-slate-300">{sessionDate}</span>}
                          {sessionDate && <span>•</span>}
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-slate-400">schedule</span>
                            {session.startTime} – {session.endTime} WAT
                          </span>
                          <span>•</span>
                          <span>{session.locationName || session.location || 'Main Sanctuary'}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyOrShare(getSessionRosterText(session), `${sessionTitle} Roster`, `${sessionTitle} roster copied! Ready to paste into WhatsApp.`)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
                          title="Copy this service roster for WhatsApp"
                        >
                          <span className="material-symbols-outlined text-xs">share</span>
                          <span>Share</span>
                        </button>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold border border-emerald-200 dark:border-emerald-800">
                          {assignments.length} Ushers
                        </span>
                      </div>
                    </div>

                    {/* Supervising Minister & Lead Usher */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {session.supervisingMinister && (
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/50">
                          <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg">
                            shield_person
                          </span>
                          <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Supervising Minister
                            </span>
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {session.supervisingMinister.name} {session.supervisingMinister.roleInUnit ? `(${session.supervisingMinister.roleInUnit})` : ''}
                            </p>
                          </div>
                        </div>
                      )}

                      {session.leadUsher && (
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/50">
                          <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-lg">
                            star
                          </span>
                          <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
                              Lead Usher
                            </span>
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {session.leadUsher.name} {session.leadUsher.position ? `• ${session.leadUsher.position}` : ''}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Saturday Chair Arrangement Section */}
                    {session.chairArrangement && (
                      <div className="mt-2.5 p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/50">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-base">
                              chair
                            </span>
                            <span className="text-xs font-extrabold text-purple-900 dark:text-purple-200">
                              Chair Arrangement: {session.chairArrangement.groupName || session.chairArrangement.group}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-200/70 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300">
                            Responsible Team
                          </span>
                        </div>
                        {session.chairArrangement.note && (
                          <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mb-2">
                            {session.chairArrangement.note}
                          </p>
                        )}
                        {Array.isArray(session.chairArrangement.members) && session.chairArrangement.members.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {session.chairArrangement.members.map((m: any, mIdx: number) => {
                              const isMeInChair = m.id === user?.memberId || m.memberId === user?.memberId;
                              return (
                                <span
                                  key={m.id || m.memberId || mIdx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                                    isMeInChair
                                      ? 'bg-purple-600 text-white font-bold border-purple-700'
                                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-purple-200/60 dark:border-purple-900/50'
                                  }`}
                                >
                                  {m.firstName ? `${m.firstName} ${m.lastName || ''}` : m.name || 'Member'}
                                  {isMeInChair && <span className="text-amber-200 text-[10px] font-black">(You)</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Assigned Ushers List */}
                    <div className="mt-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Assigned Ushers ({assignments.length})
                        </p>
                        <button
                          onClick={() => setSelectedSessionModal(session)}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"
                        >
                          <span>View Full Details</span>
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {assignments.map((u, uIdx) => {
                          const isMe = u.memberId === user?.memberId || u.isMe;
                          const uFullName = u.fullName || u.name || 'Usher';
                          return (
                            <div
                              key={u.memberId || (u as any).id || uIdx}
                              onClick={() => setSelectedSessionModal(session)}
                              className={`flex items-center gap-2.5 p-2 rounded-xl border cursor-pointer hover:border-emerald-400 transition-colors ${
                                isMe
                                  ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-bold'
                                  : 'border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center text-xs font-bold">
                                {u.profilePhotoUrl ? (
                                  <img src={u.profilePhotoUrl} alt={uFullName} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{uFullName.charAt(0) || 'U'}</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-extrabold truncate leading-tight">
                                  {uFullName} {isMe && <span className="text-emerald-600 dark:text-emerald-400 font-black">(You)</span>}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {u.memberCode} {u.position ? `• ${u.position}` : ''}
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

      {/* Member Service Details Modal Popup */}
      {selectedSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-base font-extrabold text-[#0b1c30] dark:text-white">
                  {selectedSessionModal.serviceTitle || selectedSessionModal.serviceName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs">calendar_today</span>
                  {selectedSessionModal.formattedDate || selectedSessionModal.serviceDate} • {selectedSessionModal.startTime} – {selectedSessionModal.endTime} WAT
                </p>
              </div>
              <button
                onClick={() => setSelectedSessionModal(null)}
                className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Location & Summary */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-800/50 text-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-lg">location_on</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {selectedSessionModal.locationName || selectedSessionModal.location || 'Main Sanctuary'}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-extrabold text-xs">
                  {(selectedSessionModal.assignments || selectedSessionModal.ushers || []).length} Ushers Assigned
                </span>
              </div>

              {/* Leadership Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {selectedSessionModal.supervisingMinister && (
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-0.5">
                      Supervising Minister
                    </span>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {selectedSessionModal.supervisingMinister.name}
                    </p>
                    {selectedSessionModal.supervisingMinister.roleInUnit && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        {selectedSessionModal.supervisingMinister.roleInUnit}
                      </p>
                    )}
                  </div>
                )}

                {selectedSessionModal.leadUsher && (
                  <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400 block mb-0.5">
                      Lead Usher
                    </span>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {selectedSessionModal.leadUsher.name}
                    </p>
                    {selectedSessionModal.leadUsher.position && (
                      <p className="text-[11px] text-blue-800 dark:text-blue-300">
                        {selectedSessionModal.leadUsher.position}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Saturday Chair Arrangement */}
              {selectedSessionModal.chairArrangement && (
                <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-extrabold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-purple-600 text-base">chair</span>
                      Chair Arrangement ({selectedSessionModal.chairArrangement.groupName || selectedSessionModal.chairArrangement.group})
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-200 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300">
                      Team on Duty
                    </span>
                  </div>
                  {selectedSessionModal.chairArrangement.note && (
                    <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mb-2">
                      {selectedSessionModal.chairArrangement.note}
                    </p>
                  )}
                  {Array.isArray(selectedSessionModal.chairArrangement.members) && selectedSessionModal.chairArrangement.members.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedSessionModal.chairArrangement.members.map((m: any, idx: number) => {
                        const isMeChair = m.id === user?.memberId || m.memberId === user?.memberId;
                        return (
                          <span
                            key={idx}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border ${
                              isMeChair
                                ? 'bg-purple-600 text-white font-bold border-purple-700'
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-purple-200 dark:border-purple-900/40'
                            }`}
                          >
                            {m.firstName ? `${m.firstName} ${m.lastName || ''}` : m.name || 'Member'}
                            {isMeChair && <span className="ml-1 text-amber-200 font-black">(You)</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Full Ushering Roster */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2.5">
                  Assigned Ushers ({(selectedSessionModal.assignments || selectedSessionModal.ushers || []).length})
                </h4>
                <div className="space-y-2">
                  {(selectedSessionModal.assignments || selectedSessionModal.ushers || []).map((u, idx) => {
                    const isMe = u.memberId === user?.memberId || u.isMe;
                    const uFullName = u.fullName || u.name || 'Usher';
                    return (
                      <div
                        key={u.memberId || (u as any).id || idx}
                        className={`flex items-center justify-between p-2.5 rounded-xl border ${
                          isMe
                            ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100'
                            : 'border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center text-xs font-bold">
                            {u.profilePhotoUrl ? (
                              <img src={u.profilePhotoUrl} alt={uFullName} className="w-full h-full object-cover" />
                            ) : (
                              <span>{uFullName.charAt(0) || 'U'}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">
                              {uFullName} {isMe && <span className="text-emerald-600 dark:text-emerald-400 font-black ml-1">(You)</span>}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {u.memberCode}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[11px] font-semibold shrink-0">
                          {u.position || u.roleTitle || 'General Usher'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <button
                onClick={() => copyOrShare(getSessionRosterText(selectedSessionModal), `${selectedSessionModal.serviceTitle} Roster`, 'Service roster copied!')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-xs"
              >
                <span className="material-symbols-outlined text-sm">share</span>
                <span>Share Roster</span>
              </button>
              <button
                onClick={() => setSelectedSessionModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
