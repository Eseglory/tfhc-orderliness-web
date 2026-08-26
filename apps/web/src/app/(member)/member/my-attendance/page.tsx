'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '../../../../components/Navbar';
import { StatusBadge } from '../../../../components/StatusBadge';
import { fetchApi } from '../../../../lib/api';
import { FileText, Send, AlertCircle } from 'lucide-react';

export default function MyAttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [memberId, setMemberId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Excuse Modal state
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [excuseCategory, setExcuseCategory] = useState('Illness');
  const [excuseReason, setExcuseReason] = useState('');
  const [excuseSubmitting, setExcuseSubmitting] = useState(false);
  const [excuseMsg, setExcuseMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const user = await fetchApi('/auth/me');
      setMemberId(user.memberId);
      if (user.memberId) {
        const data = await fetchApi(`/attendance/member/${user.memberId}`);
        setRecords(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmitExcuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeetingId || !excuseReason.trim()) return;

    setExcuseSubmitting(true);
    setExcuseMsg('');

    try {
      await fetchApi('/excuses', {
        method: 'POST',
        body: JSON.stringify({
          memberId,
          meetingId: selectedMeetingId,
          category: excuseCategory,
          reason: excuseReason,
        }),
      });

      setExcuseMsg('Excuse submitted successfully for leader review!');
      setTimeout(() => {
        setSelectedMeetingId(null);
        setExcuseReason('');
        loadData();
      }, 1500);
    } catch (err: any) {
      setExcuseMsg(err.message || 'Failed to submit excuse');
    } finally {
      setExcuseSubmitting(false);
    }
  };

  const filteredRecords = filterStatus === 'ALL'
    ? records
    : records.filter((r) => r.status === filterStatus);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">My Attendance History</h1>
            <p className="text-xs text-slate-400 mt-1">Full participation log and absence explanations</p>
          </div>

          <div className="flex items-center gap-2">
            {['ALL', 'ON_TIME', 'LATE', 'ABSENT', 'EXCUSED'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === status ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* History Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/60 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Meeting</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Arrival Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Points</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-semibold text-white">{r.meeting?.title}</td>
                      <td className="px-6 py-4 text-slate-400">{r.meeting?.category?.name}</td>
                      <td className="px-6 py-4 text-slate-400">
                        {new Date(r.meeting?.startTime).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        {r.actualArrivalTime
                          ? new Date(r.actualArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-6 py-4 font-bold text-amber-400">+{r.pointsEarned}</td>
                      <td className="px-6 py-4 text-right">
                        {r.status === 'ABSENT' && (
                          <button
                            onClick={() => setSelectedMeetingId(r.meetingId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30"
                          >
                            <FileText className="w-3.5 h-3.5" /> Submit Excuse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      {loading ? 'Loading attendance history...' : 'No matching attendance records.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Submit Excuse Modal */}
        {selectedMeetingId && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">Submit Absence Excuse</h2>

              {excuseMsg && (
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
                  {excuseMsg}
                </div>
              )}

              <form onSubmit={handleSubmitExcuse} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Excuse Category</label>
                  <select
                    value={excuseCategory}
                    onChange={(e) => setExcuseCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Illness">Illness</option>
                    <option value="Travel">Travel</option>
                    <option value="Work/School">Work / School</option>
                    <option value="Family Commitment">Family Commitment</option>
                    <option value="Emergency">Emergency</option>
                    <option value="Approved Church Assignment">Approved Church Assignment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Detailed Explanation</label>
                  <textarea
                    required
                    rows={3}
                    value={excuseReason}
                    onChange={(e) => setExcuseReason(e.target.value)}
                    placeholder="Provide context for leadership review..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMeetingId(null)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={excuseSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/20"
                  >
                    {excuseSubmitting ? 'Submitting...' : 'Send Request'}
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
