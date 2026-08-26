'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '../../../../components/Navbar';
import { fetchApi } from '../../../../lib/api';
import { Plus, Calendar, MapPin, Play, Square, Eye } from 'lucide-react';

export default function AdminMeetingsPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [expectedArrivalTime, setExpectedArrivalTime] = useState('');
  const [attendanceOpenTime, setAttendanceOpenTime] = useState('');
  const [attendanceCloseTime, setAttendanceCloseTime] = useState('');
  const [locationName, setLocationName] = useState('Church Auditorium');
  const [latitude, setLatitude] = useState(6.4531);
  const [longitude, setLongitude] = useState(3.3958);
  const [geofenceRadiusMeters, setGeofenceRadiusMeters] = useState(100);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mtgs, cats] = await Promise.all([
        fetchApi('/meetings'),
        fetchApi('/meetings/categories'),
      ]);
      setMeetings(mtgs);
      setCategories(cats);
      if (cats.length > 0) setCategoryId(cats[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await fetchApi('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title,
          categoryId,
          meetingDate: new Date(meetingDate).toISOString(),
          startTime: new Date(`${meetingDate}T${startTime}`).toISOString(),
          expectedArrivalTime: new Date(`${meetingDate}T${expectedArrivalTime}`).toISOString(),
          attendanceOpenTime: new Date(`${meetingDate}T${attendanceOpenTime}`).toISOString(),
          attendanceCloseTime: new Date(`${meetingDate}T${attendanceCloseTime}`).toISOString(),
          locationName,
          latitude: Number(latitude),
          longitude: Number(longitude),
          geofenceRadiusMeters: Number(geofenceRadiusMeters),
        }),
      });

      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create meeting');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (meetingId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    try {
      await fetchApi(`/meetings/${meetingId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update meeting status');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Meeting Management</h1>
            <p className="text-xs text-slate-400 mt-1">Configure meeting schedules, time windows & geofences</p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" /> Create New Meeting
          </button>
        </div>

        {/* Meetings List Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/60 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Date & Start Time</th>
                  <th className="px-6 py-4">Venue & Radius</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {meetings.length > 0 ? (
                  meetings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-semibold text-white">
                        {m.title}
                        <span className="block text-xs font-normal text-slate-400">
                          {m._count?.attendanceRecords ?? 0} checked in
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{m.category?.name}</td>
                      <td className="px-6 py-4 text-slate-300">
                        {new Date(m.startTime).toLocaleDateString()} at{' '}
                        {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {m.locationName} ({m.geofenceRadiusMeters}m)
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : m.status === 'CLOSED'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-indigo-500/20 text-indigo-400'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {m.status === 'ACTIVE' ? (
                          <>
                            <Link
                              href={`/admin/live-meeting/${m.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 text-slate-950 font-bold"
                            >
                              <Eye className="w-3.5 h-3.5" /> Monitor
                            </Link>
                            <button
                              onClick={() => handleStatusToggle(m.id, m.status)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-rose-600/20 text-rose-300 border border-rose-500/30"
                            >
                              <Square className="w-3.5 h-3.5" /> Close
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleStatusToggle(m.id, m.status)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30"
                          >
                            <Play className="w-3.5 h-3.5" /> Open Attendance
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      {loading ? 'Loading scheduled meetings...' : 'No meetings configured yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Meeting Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white">Create New Meeting</h2>

              <form onSubmit={handleCreateMeeting} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Meeting Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Saturday Unit Meeting"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Category</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.pointWeight}x)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Meeting Date</label>
                    <input
                      type="date"
                      required
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Attendance Opens</label>
                    <input
                      type="time"
                      required
                      value={attendanceOpenTime}
                      onChange={(e) => setAttendanceOpenTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Expected Arrival</label>
                    <input
                      type="time"
                      required
                      value={expectedArrivalTime}
                      onChange={(e) => setExpectedArrivalTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Meeting Starts</label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Attendance Closes</label>
                    <input
                      type="time"
                      required
                      value={attendanceCloseTime}
                      onChange={(e) => setAttendanceCloseTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Location Name</label>
                    <input
                      type="text"
                      required
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={latitude}
                      onChange={(e) => setLatitude(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Radius (m)</label>
                    <input
                      type="number"
                      required
                      value={geofenceRadiusMeters}
                      onChange={(e) => setGeofenceRadiusMeters(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
                  >
                    {submitting ? 'Creating...' : 'Save & Schedule Meeting'}
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
