'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '../../../../../components/Navbar';
import { StatusBadge } from '../../../../../components/StatusBadge';
import { fetchApi } from '../../../../../lib/api';
import { RefreshCw, Users, CheckCircle2, Clock, Plus } from 'lucide-react';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMembers runs once on mount by design
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
          ...(manualArrival ? {actualArrivalTime:new Date(manualArrival).toISOString()} : {}),
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
          <section className="p-4 rounded-xl bg-slate-900 border border-slate-800 my-4">
            <h2 className="font-bold">Attendance responses</h2>
            <p>{meeting?.eventResponses?.filter((r: any) => r.attending).length ?? 0} attending · {meeting?.eventResponses?.filter((r: any) => !r.attending).length ?? 0} not attending</p>
            <ul>{meeting?.eventResponses?.map((r: any) => <li key={r.id}>{r.member.firstName} {r.member.lastName}: {r.attending ? 'Attending' : 'Not attending'}</li>)}</ul>
          </section>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
              🔴 Live Active Meeting Monitor
            </span>
            <h1 className="text-2xl font-bold text-white mt-2">{meeting?.title || 'Active Meeting'}</h1>
            <p className="text-xs text-slate-400 mt-1">
              Venue: {meeting?.locationName} | Geofence: {meeting?.geofenceRadiusMeters}m
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                loadData();
                          }}
              className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              title="Refresh Live Data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowManualModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Record Manual Attendance
            </button>
          </div>
        </div>

        <section className="flex flex-wrap gap-6 rounded-xl bg-slate-900 p-5">
          <p>Expected: <strong>{meeting?.expectedCount ?? 0}</strong></p>
          <p>Not yet present: <strong>{Math.max(0,(meeting?.expectedCount ?? 0)-attendanceRecords.filter(r=>!['ABSENT'].includes(r.status)).length)}</strong></p>
          <p>Attendance so far: <strong>{meeting?.expectedCount ? (totalPresent/meeting.expectedCount*100).toFixed(1) : '0'}%</strong></p>
        </section>
        {/* Real-Time Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Checked In</div>
            <div className="text-3xl font-extrabold text-white">{totalPresent}</div>
            <div className="text-xs text-emerald-400 font-medium mt-1">Present members</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Early</div>
            <div className="text-3xl font-extrabold text-emerald-400">{earlyCount}</div>
            <div className="text-xs text-slate-500 mt-1">Arrival &lt; expected</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">On Time</div>
            <div className="text-3xl font-extrabold text-green-400">{onTimeCount}</div>
            <div className="text-xs text-slate-500 mt-1">Arrival &lt; start</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Grace Period</div>
            <div className="text-3xl font-extrabold text-amber-400">{graceCount}</div>
            <div className="text-xs text-slate-500 mt-1">Within grace window</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Late</div>
            <div className="text-3xl font-extrabold text-orange-400">{lateCount}</div>
            <div className="text-xs text-slate-500 mt-1">Arrival &gt; grace</div>
          </div>
        </div>

        {/* Location guidance and live attendance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h2 className="text-lg font-bold">Location check-in</h2>
            <p>Members open Check in and allow location access at the venue.</p>
            <p>{meeting?.locationName || 'Loading venue…'}</p>
            <p className="text-sm text-slate-400">Coordinates: {meeting?.latitude ?? '—'}, {meeting?.longitude ?? '—'}<br />Allowed distance: {meeting?.geofenceRadiusMeters ?? '—'} metres</p>
            <p className="text-sm text-slate-400">Attendance must be active and within the check-in window. Use manual attendance with a reason if a member cannot obtain an accurate location.</p>
          </section>

          {/* Live Attendance Feed */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Live Attendance Feed</h2>
              <span className="text-xs text-slate-400">{attendanceRecords.length} records captured</span>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-800/60 sticky top-0">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Sub-Team</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Distance</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {attendanceRecords.length > 0 ? (
                    attendanceRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-semibold text-white">
                          {r.member?.firstName} {r.member?.lastName}
                          <span className="block text-xs font-normal text-slate-400">{r.member?.memberCode}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{r.member?.subTeam?.name || 'Protocol'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">
                          {r.actualArrivalTime ? new Date(r.actualArrivalTime).toLocaleTimeString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          {r.distanceFromVenue ? `${Math.round(r.distanceFromVenue)}m` : 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Record Manual Attendance</h2>

              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Select Member</label>
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.firstName} {m.lastName} ({m.memberCode})
                      </option>
                    ))}
                  </select>
                </div>

                <label className="block">Actual arrival time (optional)<input className="block bg-slate-800 p-2 rounded" type="datetime-local" value={manualArrival} onChange={e=>setManualArrival(e.target.value)}/></label>
                  <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Attendance Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="EARLY">EARLY</option>
                    <option value="ON_TIME">ON TIME</option>
                    <option value="GRACE_PERIOD">GRACE PERIOD</option>
                    <option value="LATE">LATE</option>
                    <option value="EXCUSED">EXCUSED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Mandatory Audit Reason</label>
                  <textarea
                    required
                    rows={2}
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    placeholder="Provide reason for manual override..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingManual}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
                  >
                    {submittingManual ? 'Saving...' : 'Record & Audit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
