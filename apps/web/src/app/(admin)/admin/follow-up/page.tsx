'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Search,
  Filter,
  CheckSquare,
  ArrowUpRight,
  UserX,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../lib/api';
import { Modal, useToast } from '../../../../components/ui';

export default function AdminFollowUpPage() {
  const { notify } = useToast();
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'ALL' | '3' | '2' | '1'>('ALL');
  const [search, setSearch] = useState('');

  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<any[]>('/alerts');
      setFlags(data || []);
    } catch (err) {
      console.error('Failed to load flags', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleScanFlags = async () => {
    setScanning(true);
    try {
      const res = await fetchApi('/alerts/evaluate', { method: 'POST' });
      notify('Threshold evaluation completed and rosters synchronized', 'success');
      await loadFlags();
    } catch (err: any) {
      notify(err.message || 'Scan evaluation failed', 'error');
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
        body: JSON.stringify({ notes: resolutionNotes.trim() || undefined }),
      });

      notify('Follow-up flag resolved and archived', 'success');
      setSelectedFlagId(null);
      setResolutionNotes('');
      await loadFlags();
    } catch (err: any) {
      notify(err.message || 'Failed to resolve flag', 'error');
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

  const filteredFlags = useMemo(() => {
    return flags.filter((f) => {
      if (filterLevel !== 'ALL' && f.flagLevel.toString() !== filterLevel) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = `${f.member?.firstName} ${f.member?.lastName}`.toLowerCase();
      const code = f.member?.memberCode?.toLowerCase() || '';
      const reason = (f.flagReason || f.reason || '').toLowerCase();
      return name.includes(q) || code.includes(q) || reason.includes(q);
    });
  }, [flags, filterLevel, search]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>TRACKING</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">FOLLOW-UP &amp; FLAGS</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Follow-Up &amp; Absenteeism Flags
              </h1>
              {stats.total > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  {stats.total} Active Interventions
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automated threshold detection for members missing consecutive services, team meetings, or falling below consistency benchmarks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/tracker"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <span>Goal Tracker</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={handleScanFlags}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Evaluating Roster...' : 'Run Threshold Scanner'}</span>
            </button>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ACTIVE FOLLOW-UP FLAGS
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
              <span>Requiring member check-in</span>
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
              <span>&lt;70% benchmark or 3+ missed</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                LEVEL 2 WARNING
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.moderate}</span>
              <span className="text-xs font-bold text-amber-600">Moderate</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>3 total unexcused absences</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                RESPONSE SLA
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">24 Hours</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Target contact window</span>
            </div>
          </div>
        </div>

        {/* Filters and Search Strip */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
            <button
              onClick={() => setFilterLevel('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterLevel === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              All Flags ({flags.length})
            </button>
            <button
              onClick={() => setFilterLevel('3')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterLevel === '3'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Level 3 Critical ({stats.critical})
            </button>
            <button
              onClick={() => setFilterLevel('2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterLevel === '2'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Level 2 Warning ({stats.moderate})
            </button>
            <button
              onClick={() => setFilterLevel('1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterLevel === '1'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Level 1 Advisory ({stats.warning})
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member or reason..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Flags Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredFlags.length > 0 ? (
            filteredFlags.map((flag) => {
              const reasonText = flag.flagReason || flag.reason || 'Consecutive missed services detected.';
              const memberPhone = flag.member?.phoneNumber || '';
              const whatsappLink = memberPhone ? `https://wa.me/${memberPhone.replace(/[^0-9]/g, '')}` : null;

              return (
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
                        Level {flag.flagLevel} • {flag.flagLevel === 3 ? 'Critical Absentee' : flag.flagLevel === 2 ? 'Warning' : 'Follow-Up Required'}
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
                        {flag.member?.subTeam?.name || 'General Registry'} • ID: {flag.member?.memberCode || 'ORD-0000'}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Flag Reason</span>
                      <p className="font-medium leading-relaxed">{reasonText}</p>
                    </div>

                    {memberPhone && (
                      <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
                        <span className="font-bold">Phone: {memberPhone}</span>
                        {whatsappLink && (
                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-bold"
                          >
                            WhatsApp
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/members/${flag.member?.id || flag.memberId || ''}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      CRM Profile
                    </Link>
                    <button
                      onClick={() => {
                        setSelectedFlagId(flag.id);
                        setResolutionNotes('');
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors"
                    >
                      Log Resolution
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
              No active absenteeism flags matching your filter. All member rosters are healthy.
            </div>
          )}
        </div>

        {/* Resolve Modal */}
        {selectedFlagId && (
          <Modal
            open={Boolean(selectedFlagId)}
            onClose={() => setSelectedFlagId(null)}
            title="Log Follow-Up Resolution"
          >
            <form onSubmit={handleResolveFlag} className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Document the check-in made, visit, or phone call result to clear this flag from the active queue.
              </p>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Resolution &amp; Follow-Up Notes:
                </label>
                <textarea
                  required
                  rows={4}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Phone check-in completed. Member was traveling for family obligations; returning next week."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none"
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
                  disabled={resolving || !resolutionNotes.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50"
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
