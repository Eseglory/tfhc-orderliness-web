'use client';
import { DraftControls } from '../../../../components/OfflineStorage';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Send,
  RefreshCw,
  Trash2,
  CalendarRange,
  ChevronRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { fetchApi } from '../../../../lib/api';

export default function SubmitExcusePage() {
  const router = useRouter();

  // Mode: 'single' (specific meeting/service/event) vs 'range' (general unavailability/leave)
  const [mode, setMode] = useState<'single' | 'range'>('single');

  const [requests, setRequests] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMeetings, setLoadingMeetings] = useState(true);

  // Form state
  const [meetingId, setMeetingId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // History tab filter
  const [historyTab, setHistoryTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

  const loadRequests = async () => {
    try {
      const data = await fetchApi<any[]>('/excuses/mine');
      setRequests(data || []);
    } catch (error: any) {
      setMessage({ text: error.message || 'Could not load your previous requests', type: 'error' });
    }
  };

  const loadMeetings = async () => {
    setLoadingMeetings(true);
    try {
      const data = await fetchApi<any[]>('/meetings');
      setMeetings(data || []);
    } catch (error: any) {
      // ignore or set error
    } finally {
      setLoadingMeetings(false);
    }
  };

  useEffect(() => {
    Promise.all([loadRequests(), loadMeetings()]).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const payload: any = {
        category,
        reason: details.trim(),
        requestType: mode === 'single' ? 'MEETING' : 'GENERAL_UNAVAILABILITY',
      };

      if (mode === 'single') {
        if (!meetingId) {
          setMessage({ text: 'Please select a meeting or service.', type: 'error' });
          setSubmitting(false);
          return;
        }
        payload.meetingId = meetingId;
      } else {
        if (!startDate || !endDate) {
          setMessage({ text: 'Please select both a start date and end date.', type: 'error' });
          setSubmitting(false);
          return;
        }
        if (new Date(startDate) > new Date(endDate)) {
          setMessage({ text: 'Start date cannot be after end date.', type: 'error' });
          setSubmitting(false);
          return;
        }
        payload.startDate = new Date(startDate).toISOString();
        payload.endDate = new Date(endDate).toISOString();
      }

      await fetchApi('/excuses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setMessage({ text: 'Absence request submitted successfully for leadership review.', type: 'success' });
      setDetails('');
      setMeetingId('');
      setStartDate('');
      setEndDate('');
      setCategory('');
      await loadRequests();
    } catch (err: any) {
      setMessage({ text: err.message || 'Submission failed. Please try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!window.confirm('Are you sure you want to withdraw this absence request?')) return;
    setCancellingId(id);
    try {
      await fetchApi(`/excuses/${id}/cancel`, { method: 'POST' });
      setMessage({ text: 'Request withdrawn successfully.', type: 'success' });
      await loadRequests();
    } catch (err: any) {
      setMessage({ text: err.message || 'Could not cancel request.', type: 'error' });
    } finally {
      setCancellingId(null);
    }
  };

  const filteredRequests = useMemo(() => {
    if (historyTab === 'ALL') return requests;
    return requests.filter((r) => r.status === historyTab);
  }, [requests, historyTab]);

  return (
    <div className="bg-background text-on-background min-h-screen font-body-md antialiased pb-28">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between w-full px-4 sm:px-6 h-16 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors text-on-surface"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-headline-sm text-base sm:text-lg font-bold text-primary text-center">
          Absence &amp; Excuse Permission
        </h1>
        <div className="w-10" />
      </header>

      <main className="px-4 sm:px-6 py-6 max-w-2xl mx-auto space-y-6">
        {/* Context Banner */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs border border-surface-container-low relative overflow-hidden space-y-2">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600"></div>
          <div className="flex items-center gap-2 text-primary font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Attendance Governance</span>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Submit an advance excuse or general unavailability leave. Once approved by leadership, your attendance standing and consistency streaks are protected.
          </p>
        </section>

        {/* Feedback Message */}
        {message && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2.5 ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Request Submission Form */}
        <section className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 shadow-xs border border-surface-container-low space-y-5">
          {/* Mode Switcher */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Absence Type
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'single'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Specific Service</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('range')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'range'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                <span>Leave / Date Range</span>
              </button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <DraftControls name="excuse" value={{ mode, meetingId, startDate, endDate, category, details }} restore={value => {
              setMode(value.mode === 'range' ? 'range' : 'single'); setMeetingId(String(value.meetingId || ''));
              setStartDate(String(value.startDate || '')); setEndDate(String(value.endDate || ''));
              setCategory(String(value.category || '')); setDetails(String(value.details || ''));
            }} />
            {/* Mode 1: Meeting Selector */}
            {mode === 'single' ? (
              <div className="space-y-1.5">
                <label htmlFor="excuseMeeting" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Select Meeting / Service *
                </label>
                <select
                  id="excuseMeeting"
                  required
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Choose an eligible service or event...</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} — {new Date(m.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ({new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              /* Mode 2: Date Range Pickers */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="startDate" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    From (Start Date) *
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="endDate" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    To (End Date) *
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {/* Category Dropdown */}
            <div className="space-y-1.5">
              <label htmlFor="category" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Reason Category *
              </label>
              <select
                id="category"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select category...</option>
                <option value="SICKNESS">Illness / Medical Sickness</option>
                <option value="TRAVEL">Travel / Out of town</option>
                <option value="WORK">Work / Shift Scheduling Conflict</option>
                <option value="FAMILY">Family Emergency / Obligation</option>
                <option value="ACADEMIC">Academic / Exams</option>
                <option value="PERSONAL">Personal / Bereavement</option>
                <option value="OTHER">Other Reason</option>
              </select>
            </div>

            {/* Detailed Explanation Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="details" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Detailed Explanation / Notes *
                </label>
                <span className="text-[10px] text-slate-400">{details.length}/500</span>
              </div>
              <textarea
                id="details"
                rows={3}
                required
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Provide details for leadership to review..."
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || (mode === 'single' ? !meetingId : !startDate || !endDate) || !category || !details.trim()}
              className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Submitting Request...' : 'Submit Excuse for Review'}</span>
            </button>
          </form>
        </section>

        {/* My Requests Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">My Absence Requests</h2>
              <p className="text-xs text-slate-500">Track approvals, leader feedback, and withdrawal status.</p>
            </div>
            <button
              onClick={loadRequests}
              className="self-start sm:self-auto inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl w-fit">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setHistoryTab(t)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  historyTab === t
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {t === 'ALL' ? 'All' : t[0] + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {filteredRequests.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-low p-8 text-center text-xs text-slate-400">
              No absence requests found in this view.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => (
                <article
                  key={req.id}
                  className="bg-surface-container-lowest rounded-2xl border border-surface-container-low p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          {req.meeting?.title || (req.startDate ? `Leave: ${new Date(req.startDate).toLocaleDateString()} – ${new Date(req.endDate).toLocaleDateString()}` : 'General Leave')}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {req.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Submitted: {new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        req.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : req.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : req.status === 'CANCELLED'
                          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    &quot;{req.reason}&quot;
                  </p>

                  {/* Decision Note */}
                  {req.reviewNote && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-xs">
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">
                        Leadership Note:
                      </span>
                      <p className="text-slate-800 dark:text-slate-200">{req.reviewNote}</p>
                    </div>
                  )}

                  {/* Actions for Pending */}
                  {req.status === 'PENDING' && (
                    <div className="pt-2 flex justify-end border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={cancellingId === req.id}
                        onClick={() => handleCancelRequest(req.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{cancellingId === req.id ? 'Withdrawing...' : 'Withdraw Request'}</span>
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
