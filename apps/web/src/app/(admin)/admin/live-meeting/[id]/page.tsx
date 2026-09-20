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
  Shield,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { StatusBadge } from '../../../../../components/StatusBadge';
import { HeadcountModal, HeadcountData } from '../../../../../components/HeadcountModal';
import { fetchApi } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

interface SupervisingMinisterCandidate {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  roleInUnit?: string | null;
  subTeam?: { id: string; name: string } | null;
}

export default function AdminLiveMeetingPage() {
  const params = useParams();
  const meetingId = params?.id as string;
  const { can } = useAuth();

  const [meeting, setMeeting] = useState<any>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [headcountData, setHeadcountData] = useState<HeadcountData | null>(null);
  const [loading, setLoading] = useState(true);

  // Supervising Minister State
  const [ministerCandidates, setMinisterCandidates] = useState<SupervisingMinisterCandidate[]>([]);
  const [showMinisterModal, setShowMinisterModal] = useState(false);
  const [selectedMinisterId, setSelectedMinisterId] = useState('');
  const [savingMinister, setSavingMinister] = useState(false);

  // Headcount Modal
  const [showHeadcountModal, setShowHeadcountModal] = useState(false);

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
      const [mtgData, attData, hcRes] = await Promise.all([
        fetchApi(`/meetings/${meetingId}`),
        fetchApi(`/attendance/meeting/${meetingId}`),
        fetchApi<any>(`/attendance/headcount/${meetingId}`).catch(() => null),
      ]);
      setMeeting(mtgData);
      setAttendanceRecords(attData || []);
      setHeadcountData(hcRes?.headcount || null);
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

  const loadMinisterCandidates = async () => {
    try {
      const data = await fetchApi<SupervisingMinisterCandidate[]>('/meetings/supervising-ministers/candidates');
      setMinisterCandidates(data || []);
      if (data && data.length > 0) {
        setSelectedMinisterId((prev) => prev || data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    loadMembers();
    loadMinisterCandidates();

    // Auto-refresh attendance stats every 15 seconds
    const interval = setInterval(() => {
      loadData();
    }, 15000);

    return () => clearInterval(interval);
  }, [meetingId, loadData]);

  const handleAppointMinister = async (options: { memberId?: string | null; random?: boolean }) => {
    setSavingMinister(true);
    try {
      await fetchApi(`/meetings/${meetingId}/supervising-minister`, {
        method: 'POST',
        body: JSON.stringify(options),
      });
      setShowMinisterModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to appoint supervising minister');
    } finally {
      setSavingMinister(false);
    }
  };

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

  const isFutureMeeting = Boolean(meeting?.startTime && new Date(meeting.startTime) > new Date());

  return (
    <AdminLayoutShell activeHref="/admin/meetings">
      <div className="space-y-6 pb-16">
        {/* Future Meeting Warning Banner */}
        {isFutureMeeting && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
              <span className="font-extrabold text-sm block">Future Scheduled Event / Service</span>
              <p>
                This gathering is scheduled for {new Date(meeting.startTime).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}. In accordance with system policy, attendance clock-in is disabled until the scheduled start time.
              </p>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/meetings" className="hover:text-indigo-600 transition-colors">SERVICES &amp; EVENTS</Link>
              <span>/</span>
              {isFutureMeeting ? (
                <span className="text-amber-600 dark:text-amber-400 font-extrabold flex items-center gap-1">
                  SCHEDULED FUTURE MONITOR
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  LIVE ACTIVE MONITOR
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {meeting?.title || 'Live Operations Monitor'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Venue: {meeting?.locationName ?? 'Main Centre'} · Geofence Radius: {meeting?.geofenceRadiusMeters ?? 100}m
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
              onClick={() => setShowHeadcountModal(true)}
              disabled={isFutureMeeting}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                isFutureMeeting
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
              }`}
              title="Record or update official physical service headcount"
            >
              <Users className="w-4 h-4" />
              {headcountData ? 'Edit Official Headcount' : 'Record Official Headcount'}
            </button>
            <button
              onClick={() => setShowManualModal(true)}
              disabled={isFutureMeeting}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                isFutureMeeting
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
              title={isFutureMeeting ? 'Attendance cannot be clocked for future events' : 'Record Manual Attendance'}
            >
              <Plus className="w-4 h-4" />
              Record Manual Override
            </button>
          </div>
        </div>

        {/* Supervising Minister Status & Operations Card */}
        <section className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 p-5 sm:p-6 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Shield className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">Supervising Minister</h2>
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                    Executive &amp; Disciplinary Committee
                  </span>
                </div>
                {meeting?.supervisingMinister ? (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm font-black text-amber-300">
                      {meeting.supervisingMinister.firstName} {meeting.supervisingMinister.lastName}
                    </p>
                    <span className="text-xs text-slate-400">
                      ({meeting.supervisingMinister.subTeam?.name || meeting.supervisingMinister.roleInUnit || 'Executive'})
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">
                    No supervising minister appointed yet. Admins can appoint manually or trigger random selection.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAppointMinister({ random: true })}
                disabled={savingMinister}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                title="Randomly appoint an eligible minister from Executive or Disciplinary Committee"
              >
                <Sparkles className="w-3.5 h-3.5" />
                🎲 Random Select
              </button>
              <button
                onClick={() => setShowMinisterModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {meeting?.supervisingMinister ? 'Change Minister' : 'Appoint Minister'}
              </button>
            </div>
          </div>
        </section>

        {/* Official Physical Service Headcount Showcase */}
        <section className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 p-5 sm:p-6 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Users className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Official General Service Headcount
                    {headcountData && (
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded-full font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Official Record
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Physical attendance count of everyone in the auditorium (members, visitors, children &amp; guests)
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowHeadcountModal(true)}
              disabled={isFutureMeeting}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isFutureMeeting
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              {headcountData ? 'Update Headcount' : 'Record Headcount Now'}
            </button>
          </div>

          {headcountData ? (
            <div className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Total */}
                <div className="bg-slate-950/90 p-4 rounded-2xl border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10">
                  <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider block">
                    Total Official Headcount
                  </span>
                  <p className="mt-1 text-3xl font-black text-white">{headcountData.totalHeadcount}</p>
                  <p className="text-[11px] text-emerald-300/80">Authoritative physical count</p>
                </div>

                {/* Male */}
                <div className="bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider block">Male</span>
                  <p className="mt-1 text-2xl font-bold text-slate-100">{headcountData.maleCount ?? '—'}</p>
                  <p className="text-[10px] text-slate-400">Adult men</p>
                </div>

                {/* Female */}
                <div className="bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-extrabold text-pink-400 uppercase tracking-wider block">Female</span>
                  <p className="mt-1 text-2xl font-bold text-slate-100">{headcountData.femaleCount ?? '—'}</p>
                  <p className="text-[10px] text-slate-400">Adult women</p>
                </div>

                {/* Children */}
                <div className="bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider block">Children</span>
                  <p className="mt-1 text-2xl font-bold text-slate-100">{headcountData.childrenCount ?? '—'}</p>
                  <p className="text-[10px] text-slate-400">Minors/infants</p>
                </div>
              </div>

              {/* Distinction & Comparison Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">Physical Headcount vs App Check-ins</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-emerald-400">{headcountData.totalHeadcount} Physical</span>
                    <span className="text-slate-600">vs</span>
                    <span className="text-sm font-bold text-indigo-400">{totalPresent} Digital App</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">Physical / App Variance</span>
                  <div className="text-sm font-bold text-amber-300">
                    +{Math.max(0, headcountData.totalHeadcount - totalPresent)} additional attendees
                  </div>
                  <span className="text-[11px] text-slate-500">Unregistered members, children &amp; guests</span>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">Audit Information</span>
                  <div className="text-slate-300 font-medium text-[11px]">
                    Recorded by {headcountData.recordedBy?.member ? `${headcountData.recordedBy.member.firstName} ${headcountData.recordedBy.member.lastName}` : (headcountData.recordedBy?.email || 'Authorized Staff')}
                    {headcountData.recordedAt && ` on ${new Date(headcountData.recordedAt).toLocaleTimeString()}`}
                  </div>
                  {headcountData.notes && (
                    <div className="text-slate-400 italic text-[11px]">
                      &ldquo;{headcountData.notes}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-5 pb-2 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-300">
                  No official physical headcount recorded yet for this service.
                </p>
                <p className="text-xs text-slate-400 max-w-xl">
                  Supervising ministers and ushers should take the physical count in the auditorium and record it here to establish the official church attendance record.
                </p>
              </div>
              <button
                onClick={() => setShowHeadcountModal(true)}
                disabled={isFutureMeeting}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition ${
                  isFutureMeeting
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                }`}
              >
                Enter Physical Headcount
              </button>
            </div>
          )}
        </section>

        {/* 5 Metric Real-Time Stats Grid - Swipeable on mobile */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pb-1 sm:pb-0">
          <div className="min-w-[180px] sm:min-w-0 flex-1 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Checked In</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{totalPresent}</p>
            <p className="mt-1 text-[11px] font-bold text-indigo-600">Digital App Check-ins</p>
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
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
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

        {/* Official Headcount Modal */}
        {showHeadcountModal && (
          <HeadcountModal
            isOpen={showHeadcountModal}
            onClose={() => setShowHeadcountModal(false)}
            meeting={meeting}
            initialHeadcount={headcountData}
            onSaved={(saved) => {
              setHeadcountData(saved);
              loadData();
            }}
          />
        )}

        {/* Supervising Minister Appointment Modal */}
        {showMinisterModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
            <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-white space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">Appoint Supervising Minister</h3>
                    <p className="text-xs text-slate-400">
                      Select an eligible minister from Executive or Disciplinary Committee
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMinisterModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Eligible Minister Pool ({ministerCandidates.length})
                  </label>
                  <select
                    value={selectedMinisterId}
                    onChange={(e) => setSelectedMinisterId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">— Select Candidate —</option>
                    {ministerCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName} {c.preferredName ? `(${c.preferredName})` : ''} — {c.subTeam?.name || c.roleInUnit || 'Executive'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Or use automated random assignment:</span>
                    <button
                      type="button"
                      onClick={() => handleAppointMinister({ random: true })}
                      disabled={savingMinister || ministerCandidates.length === 0}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      🎲 Random Selection
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                {meeting?.supervisingMinister ? (
                  <button
                    type="button"
                    onClick={() => handleAppointMinister({ memberId: null })}
                    disabled={savingMinister}
                    className="text-xs font-bold text-rose-400 hover:text-rose-300 transition"
                  >
                    Unassign Minister
                  </button>
                ) : <div />}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMinisterModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedMinisterId) return;
                      handleAppointMinister({ memberId: selectedMinisterId });
                    }}
                    disabled={savingMinister || !selectedMinisterId}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white shadow-md shadow-indigo-600/30 transition disabled:opacity-50"
                  >
                    {savingMinister ? 'Assigning…' : 'Appoint Selected'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
