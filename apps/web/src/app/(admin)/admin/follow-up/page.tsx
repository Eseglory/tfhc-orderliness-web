'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  UserCheck,
  Clock,
  HeartHandshake,
  MessageSquare,
  ChevronRight,
  Send,
  Sparkles,
  Phone,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { Modal } from '../../../../components/ui';

export default function AdminFollowUpPage() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const loadFlags = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<any[]>('/alerts');
      setFlags(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, []);

  const handleScanFlags = async () => {
    setScanning(true);
    try {
      await fetchApi('/alerts/evaluate', { method: 'POST' });
      await loadFlags();
    } catch (err: any) {
      alert(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleResolveFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFlagId) return;

    setResolving(true);
    try {
      await fetchApi(`/alerts/${selectedFlagId}/resolve`, {
        method: 'PUT',
        body: JSON.stringify({ notes: resolutionNotes }),
      });

      setSelectedFlagId(null);
      setResolutionNotes('');
      loadFlags();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve flag');
    } finally {
      setResolving(false);
    }
  };

  const stats = useMemo(() => {
    const total = flags.length;
    const critical = flags.filter((f) => f.flagLevel === 3).length;
    const moderate = flags.filter((f) => f.flagLevel === 2).length;
    const warning = flags.filter((f) => f.flagLevel === 1).length;
    return { total, critical, moderate, warning };
  }, [flags]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TRACKING &amp; CARE</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">FOLLOW-UP &amp; FLAGS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Pastoral Care &amp; Absenteeism Flags
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automated threshold detection for congregants missing consecutive worship services or small group synods.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleScanFlags}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Evaluating...' : 'Run Threshold Scanner'}</span>
            </button>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ACTIVE CARE FLAGS
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
              <span className="text-xs font-bold text-slate-400">Total</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Requiring pastoral check-in</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                LEVEL 3 CRITICAL
              </span>
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{stats.critical}</span>
              <span className="text-xs font-bold text-rose-600">High Risk</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>3+ consecutive missed services</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                LEVEL 2 MODERATE
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.moderate}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>2 consecutive missed services</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                SHEPHERDING SLA
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">24 Hours</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Target resolution window</span>
            </div>
          </div>
        </div>

        {/* Flags Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {flags.length > 0 ? (
            flags.map((flag) => (
              <div
                key={flag.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 flex flex-col justify-between hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase border ${
                        flag.flagLevel === 3
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          : flag.flagLevel === 2
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                      }`}
                    >
                      Level {flag.flagLevel} • {flag.flagLevel === 3 ? 'Critical Absentee' : flag.flagLevel === 2 ? 'Moderate Risk' : 'Advisory'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(flag.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      {flag.member?.firstName} {flag.member?.lastName}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {flag.member?.subTeam?.name || 'General Congregation'} • ID: {flag.member?.memberCode || 'ORD-0000'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                    <p className="font-medium">{flag.reason}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/members/${flag.memberId || 'ORD-2041'}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    View CRM Profile
                  </Link>
                  <button
                    onClick={() => setSelectedFlagId(flag.id)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors"
                  >
                    Log Resolution
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No active absenteeism flags detected. All congregant rosters are healthy.
            </div>
          )}
        </div>

        {/* Resolve Modal */}
        {selectedFlagId && (
          <Modal
            open={Boolean(selectedFlagId)}
            onClose={() => setSelectedFlagId(null)}
            title="Log Pastoral Care Resolution"
          >
            <form onSubmit={handleResolveFlag} className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Document the pastoral contact made, hospital visit, or phone call result to clear this flag from the active queue.
              </p>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Resolution &amp; Pastoral Care Notes:
                </label>
                <textarea
                  required
                  rows={4}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Phone check-in completed. Member was traveling for family obligations; returning to worship next Sunday."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedFlagId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolving}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                >
                  {resolving ? 'Resolving...' : 'Clear & Archive Flag'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AdminLayoutShell>
  );
}
