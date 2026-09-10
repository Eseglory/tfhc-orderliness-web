'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  RefreshCw,
  Search,
  Calendar,
  Building2,
  Check,
  X,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';

export default function AbsenceRequestsPage() {
  const [kind, setKind] = useState<'absence' | 'correction'>('absence');
  const endpoint = kind === 'absence' ? '/excuses' : '/excuses/corrections';
  const [requests, setRequests] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<any[]>(`${endpoint}/pending`);
      setRequests(data || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [kind]);

  const review = async (id: string, status: string) => {
    setBusy(id);
    try {
      await fetchApi(`${endpoint}/${id}/review`, {
        method: 'PUT',
        body: JSON.stringify({ status, reviewNote: notes[id] || undefined }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not save decision.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TRACKING &amp; GOVERNANCE</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">ABSENCE &amp; EXCUSES</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Absence &amp; Correction Requests
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review member-submitted excuses, retroactive attendance adjustments, and sickness leaves.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Refresh
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                PENDING REQUESTS
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{requests.length}</span>
              <span className="text-xs font-bold text-amber-600">Pending Review</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>{kind === 'absence' ? 'Absence Excuses' : 'Attendance Corrections'}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                MODALITY TYPE
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-black text-slate-900 dark:text-white capitalize">
                {kind === 'absence' ? 'Excuse Approvals' : 'Audit Corrections'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Affects congregant consistency score</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                GOVERNANCE POLICY
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-black text-emerald-600">48h SLA</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Automatic notification upon decision</span>
            </div>
          </div>
        </div>

        {/* Type Switcher Bar */}
        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setKind('absence')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                kind === 'absence'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Absence Requests
            </button>
            <button
              onClick={() => setKind('correction')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                kind === 'correction'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Attendance Corrections
            </button>
          </div>
        </div>

        {/* Requests Feed */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading pending requests...</div>
          ) : requests.length > 0 ? (
            requests.map((request) => (
              <div
                key={request.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs">
                      {request.member?.firstName?.[0] || 'M'}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">
                        {request.member?.firstName} {request.member?.lastName}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {request.member?.memberCode && `ID: ${request.member.memberCode} • `}
                        {request.meeting?.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {request.meeting?.startTime
                        ? new Date(request.meeting.startTime).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : 'Scheduled Date'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                    Congregant Reason / Justification
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                    &quot;{request.reason}&quot;
                  </p>
                  {request.requestedStatus && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      Requested Status: {request.requestedStatus}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    Reviewer Note (Sent to member with decision):
                  </label>
                  <input
                    type="text"
                    maxLength={2000}
                    value={notes[request.id] || ''}
                    onChange={(e) => setNotes({ ...notes, [request.id]: e.target.value })}
                    placeholder="Optional feedback or approval conditions..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    disabled={busy !== null}
                    onClick={() => review(request.id, 'REJECTED')}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 transition-colors"
                  >
                    Reject Excuse
                  </button>
                  <button
                    disabled={busy !== null}
                    onClick={() => review(request.id, 'APPROVED')}
                    className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
                  >
                    Approve Request
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No pending requests in this queue.
            </div>
          )}
        </div>
      </div>
    </AdminLayoutShell>
  );
}
