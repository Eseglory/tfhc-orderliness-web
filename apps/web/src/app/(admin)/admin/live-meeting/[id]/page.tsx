'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Radio,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  MapPin,
  Calendar,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { StatusBadge } from '../../../../../components/StatusBadge';
import { fetchApi } from '../../../../../lib/api';

export default function AdminLiveMeetingPage() {
  const params = useParams();
  const meetingId = params?.id as string;

  const [meeting, setMeeting] = useState<any>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual Attendance Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [manualArrival, setManualArrival] = useState('');
  const [manualStatus, setManualStatus] = useState('ON_TIME');
  const [manualReason, setManualReason] = useState('Dead phone battery / No smartphone');
  const [submittingManual, setSubmittingManual] = useState(false);

  const loadData = useCallback(async () => {
    if (!meetingId) return;
    try {
      const [mtgData, attData] = await Promise.all([
        fetchApi(`/meetings/${meetingId}`),
        fetchApi(`/attendance/meeting/${meetingId}`),
      ]);
      setMeeting(mtgData);
      setAttendanceRecords(attData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  const loadMembers = async () => {
    try {
      const data = await fetchApi('/members');
      setMembers(data);
      if (data.length > 0) setSelectedMemberId(data[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    loadMembers();

    // Auto-refresh attendance stats every 15 seconds
    const interval = setInterval(() => {
      loadData();
    }, 15000);

    return () => clearInterval(interval);
  }, [meetingId, loadData]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) return;

    setSubmittingManual(true);
    try {
      await fetchApi('/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({
          memberId: selectedMemberId,
          meetingId,
          status: manualStatus,
          reason: manualReason,
          ...(manualArrival ? { actualArrivalTime: new Date(manualArrival).toISOString() } : {}),
        }),
      });

      setShowManualModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record manual attendance');
    } finally {
      setSubmittingManual(false);
    }
  };

  const earlyCount = attendanceRecords.filter((r) => r.status === 'EARLY').length;
  const onTimeCount = attendanceRecords.filter((r) => r.status === 'ON_TIME').length;
  const graceCount = attendanceRecords.filter((r) => r.status === 'GRACE_PERIOD').length;
  const lateCount = attendanceRecords.filter((r) => r.status === 'LATE').length;
  const totalPresent = earlyCount + onTimeCount + graceCount + lateCount;

  return (
    <AdminLayoutShell activeHref="/admin/meetings">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/meetings" className="hover:text-indigo-600 transition-colors">MEETINGS</Link>
              <span>/</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE ACTIVE MONITOR
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {meeting?.title || 'Live Gathering Monitor'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Venue: {meeting?.locationName ?? 'Campus Hall'} · Geofence Radius: {meeting?.geofenceRadiusMeters ?? 100}m
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
              title="Refresh Live Data"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Refresh
            </button>
            <button
              onClick={() => setShowManualModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Record Manual Attendance
            </button>
          </div>
        </div>

        {/* 5 Metric Real-Time Stats Grid - Swipeable on mobile */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pb-1 sm:pb-0">
          <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Checked In</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{totalPresent}</p>
            <p className="mt-1 text-[11px] font-bold text-emerald-600">Present members</p>
          </div>

          <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Early Arrival</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-600">{earlyCount}</p>
            <p className="mt-1 text-[11px] text-slate-400">Arrived before start</p>
          </div>

          <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">On Time</span>
              <Clock className="w-4 h-4 text-green-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-green-600">{onTimeCount}</p>
            <p className="mt-1 text-[11px] text-slate-400">Arrived on schedule</p>
          </div>

          <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Grace Window</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-amber-600">{graceCount}</p>
            <p className="mt-1 text-[11px] text-slate-400">Within grace period</p>
          </div>

          <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Late Arrival</span>
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-rose-600">{lateCount}</p>
            <p className="mt-1 text-[11px] text-slate-400">After grace period</p>
          </div>
        </div>

        {/* Location & Live Attendance Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Location & Attendance Summary */}
          <div className="space-y-4">
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Venue Geofence Status</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Members check in with GPS geolocation on mobile device.
              </p>
              <div className="space-y-2 pt-1 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Venue</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{meeting?.locationName || 'Loading venue…'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Radius</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{meeting?.geofenceRadiusMeters ?? 100} metres</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Coordinates</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{meeting?.latitude ?? '—'}, {meeting?.longitude ?? '—'}</span>
                </div>
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">RSVP Responses</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-xl font-black text-emerald-600">
                    {meeting?.eventResponses?.filter((r: any) => r.attending).length ?? 0}
                  </span>
                  <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">Attending</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-xl font-black text-rose-600">
                    {meeting?.eventResponses?.filter((r: any) => !r.attending).length ?? 0}
                  </span>
                  <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">Declined</span>
                </div>
              </div>
            </section>
          </div>

          {/* Live Attendance Feed */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Live Check-in Stream</h2>
              </div>
              <span className="text-xs text-slate-400 font-bold">{attendanceRecords.length} records captured</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Sub-Team</th>
                    <th className="px-4 py-3">Arrival Time</th>
                    <th className="px-4 py-3">GPS Distance</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {attendanceRecords.length > 0 ? (
                    attendanceRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {r.member?.firstName} {r.member?.lastName}
                          </div>
                          <span className="text-[11px] text-slate-400">{r.member?.memberCode}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-medium">{r.member?.subTeam?.name || 'General'}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {r.actualArrivalTime ? new Date(r.actualArrivalTime).toLocaleTimeString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                          {r.distanceFromVenue ? `${Math.round(r.distanceFromVenue)}m` : 'On-Site'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                        No check-ins recorded yet for this meeting.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Manual Attendance Modal */}
        {showManualModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Record Manual Attendance Override</h2>

              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Select Member</label>
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.firstName} {m.lastName} ({m.memberCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Actual Arrival Time (Optional)
                  </label>
                  <input
                    className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                    type="datetime-local"
                    value={manualArrival}
                    onChange={(e) => setManualArrival(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Attendance Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="EARLY">EARLY</option>
                    <option value="ON_TIME">ON TIME</option>
                    <option value="GRACE_PERIOD">GRACE PERIOD</option>
                    <option value="LATE">LATE</option>
                    <option value="EXCUSED">EXCUSED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mandatory Audit Reason</label>
                  <textarea
                    required
                    rows={2}
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    placeholder="Provide justification for manual override..."
                    className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingManual}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white shadow-sm transition-all"
                  >
                    {submittingManual ? 'Saving…' : 'Record & Audit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}

