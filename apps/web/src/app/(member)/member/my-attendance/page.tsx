'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../../../lib/api';
import { Navbar } from '../../../../components/Navbar';
import { StatusBadge } from '../../../../components/StatusBadge';
import { Calendar, FileText, AlertCircle, CheckCircle2, Clock, MapPin, X, Send, Edit3 } from 'lucide-react';

export default function MyAttendancePage() {
  const [history, setHistory] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showExcuseModal, setShowExcuseModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);

  // Excuse Form State (Screen 12)
  const [excuseCategory, setExcuseCategory] = useState('Illness');
  const [excuseReason, setExcuseReason] = useState('');

  // Correction Form State (Screen 13)
  const [requestedStatus, setRequestedStatus] = useState('ON_TIME');
  const [correctionReason, setCorrectionReason] = useState('');

  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAttendanceData();
  }, []);

  const loadAttendanceData = async () => {
    try {
      // Fetch current member profile to get member ID
      const perf = await fetchApi('/scoring/my-performance');
      if (perf?.member?.id) {
        const records = await fetchApi(`/attendance/member/${perf.member.id}`);
        setHistory(records);
      }
      const ms = await fetchApi('/meetings');
      setMeetings(ms);
    } catch (err: any) {
      console.error('Failed to load attendance history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Screen 12: Handle Excuse Submission
  const handleSubmitExcuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;

    try {
      const perf = await fetchApi('/scoring/my-performance');
      await fetchApi('/excuses', {
        method: 'POST',
        body: JSON.stringify({
          memberId: perf.member.id,
          meetingId: selectedMeeting.id,
          category: excuseCategory,
          reason: excuseReason,
        }),
      });

      setMessage('Absence excuse submitted successfully for administrative review!');
      setShowExcuseModal(false);
      setExcuseReason('');
      loadAttendanceData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit excuse');
    }
  };

  // Screen 13: Handle Attendance Correction Request
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;

    try {
      const perf = await fetchApi('/scoring/my-performance');
      await fetchApi('/excuses/corrections', {
        method: 'POST',
        body: JSON.stringify({
          memberId: perf.member.id,
          meetingId: selectedMeeting.id,
          requestedStatus: requestedStatus,
          reason: correctionReason,
        }),
      });

      setMessage('Attendance correction request submitted to admin audit log!');
      setShowCorrectionModal(false);
      setCorrectionReason('');
      loadAttendanceData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit correction request');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      <Navbar />

      <main className="max-w-md mx-auto sm:max-w-xl md:max-w-7xl px-4 py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white">My Attendance History</h1>
            <p className="text-xs text-slate-400">Past meeting records, absence excuses &amp; corrections</p>
          </div>
          <button
            onClick={() => {
              if (meetings.length > 0) setSelectedMeeting(meetings[0]);
              setShowExcuseModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            <span>Submit Excuse</span>
          </button>
        </div>

        {message && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-between">
            <span>{message}</span>
            <button onClick={() => setMessage('')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* History List */}
        <section className="space-y-3">
          {history.length > 0 ? (
            history.map((record) => (
              <div key={record.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-white">
                    <Calendar className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{record.meeting?.title || 'Saturday Unit Meeting'}</div>
                    <div className="text-xs text-slate-400">
                      {record.actualArrivalTime
                        ? `Arrived: ${new Date(record.actualArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'No Arrival Time Recorded'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={record.status} />
                  <button
                    onClick={() => {
                      setSelectedMeeting(record.meeting);
                      setShowCorrectionModal(true);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Request Correction"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 space-y-2">
              <Calendar className="w-12 h-12 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-medium">No past attendance records found</p>
              <p className="text-xs text-slate-600">Your checked-in meetings will appear here automatically</p>
            </div>
          )}
        </section>
      </main>

      {/* Screen 12: Submit Absence Excuse Modal */}
      {showExcuseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full relative shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-500" />
                <span>Submit Absence Excuse</span>
              </h2>
              <button onClick={() => setShowExcuseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExcuse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Meeting</label>
                <select
                  value={selectedMeeting?.id || ''}
                  onChange={(e) => {
                    const found = meetings.find((m) => m.id === e.target.value);
                    if (found) setSelectedMeeting(found);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                >
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>{m.title} ({new Date(m.meetingDate).toLocaleDateString()})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Excuse Category</label>
                <select
                  value={excuseCategory}
                  onChange={(e) => setExcuseCategory(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value="Illness">Illness / Health</option>
                  <option value="Travel">Travel / Out of Town</option>
                  <option value="Work">Work / Academic Conflict</option>
                  <option value="Family Emergency">Family Emergency</option>
                  <option value="Official Unit Duty">Official Unit Duty</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Detailed Reason</label>
                <textarea
                  required
                  rows={3}
                  value={excuseReason}
                  onChange={(e) => setExcuseReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="Provide brief context for administrative review..."
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Excuse for Review</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Screen 13: Attendance Correction Request Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full relative shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-500" />
                <span>Request Attendance Correction</span>
              </h2>
              <button onClick={() => setShowCorrectionModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCorrection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Target Meeting</label>
                <input
                  type="text"
                  disabled
                  value={selectedMeeting ? selectedMeeting.title : 'Saturday Unit Meeting'}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Requested Correct Status</label>
                <select
                  value={requestedStatus}
                  onChange={(e) => setRequestedStatus(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value="EARLY">Early</option>
                  <option value="ON_TIME">On Time</option>
                  <option value="GRACE_PERIOD">Grace Period</option>
                  <option value="EXCUSED">Excused</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Justification / Audit Note</label>
                <textarea
                  required
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="Explain why correction is requested (logged in audit trail)..."
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Correction Request</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
