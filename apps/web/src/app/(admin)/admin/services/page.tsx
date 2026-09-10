'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Layers,
  Clock,
  Calendar,
  Building2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Edit2,
  Power,
  Sliders,
  Shield,
  History,
  Check,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { RecurrenceBuilder, RecurrenceRule, ruleToPreset } from '../../../../components/RecurrenceBuilder';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, useToast } from '../../../../components/ui';

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (m: number | null) =>
  m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (v: string) => (v ? Number(v.split(':')[0]) * 60 + Number(v.split(':')[1]) : null);

interface Schedule {
  id?: string;
  title: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number | null;
  categoryName: string;
  enabled: boolean;
  recurrenceRule?: RecurrenceRule | null;
  recurrenceSummary?: string;
  eventTypeKey?: string | null;
  visibility?: 'PUBLIC' | 'RESTRICTED';
  horizonDays?: number;
  exceptions?: { id: string; occurrenceStart: string; kind: string; reason: string | null }[];
  _count?: { meetings: number };
}

export default function RecurringServicesPage() {
  const { can, loading: authLoading } = useAuth();
  const { notify } = useToast();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [eventTypes, setEventTypes] = useState<{ key: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Schedule | null>(null);
  const [search, setSearch] = useState('');

  const canManage = can('events.create') || can('events.update');

  const load = async () => {
    try {
      const [data, types] = await Promise.all([
        fetchApi<{ schedules: Schedule[]; config: any }>('/service-schedules'),
        fetchApi<{ key: string; name: string }[]>('/meetings/event-types').catch(() => []),
      ]);
      setSchedules(data.schedules);
      setConfig(data.config);
      setEventTypes(types);
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? 'You do not have access to recurring events.'
          : 'Could not load recurring events.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const saveSchedule = async (s: Schedule) => {
    const body = {
      title: s.title.trim(),
      categoryName: s.categoryName.trim(),
      dayOfWeek: s.dayOfWeek,
      startMinutes: s.startMinutes,
      endMinutes: s.endMinutes,
      enabled: s.enabled,
      eventTypeKey: s.eventTypeKey || null,
      visibility: s.visibility ?? 'PUBLIC',
      horizonDays: s.horizonDays ?? 28,
      recurrenceRule: s.recurrenceRule ?? null,
    };
    await fetchApi(s.id ? `/service-schedules/${s.id}` : '/service-schedules', {
      method: s.id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    });
    setEdit(null);
    notify('Saved. Recurring schedule updated.', 'success');
    load();
  };

  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        return s.title.toLowerCase().includes(q) || s.categoryName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [schedules, search]);

  const stats = useMemo(() => {
    const total = schedules.length;
    const enabled = schedules.filter((s) => s.enabled).length;
    const totalMeetings = schedules.reduce((acc, s) => acc + (s._count?.meetings || 0), 0);
    return { total, enabled, totalMeetings };
  }, [schedules]);

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumb & Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <span>CHURCH OPERATIONS</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">GRACE CATHEDRAL CAMPUS</span>
              <span>/</span>
              <span>RECURRING SERVICE SERIES</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Recurring Liturgical &amp; Service Series
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automated horizon generation for weekly Sunday services, midweek gatherings, and synods.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Sync Engine
            </button>
            {canManage && (
              <button
                onClick={() =>
                  setEdit({
                    title: '',
                    dayOfWeek: 0,
                    startMinutes: 600,
                    endMinutes: 720,
                    categoryName: 'Sunday Service',
                    enabled: true,
                    visibility: 'PUBLIC',
                    horizonDays: 28,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Recurring Series
              </button>
            )}
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ACTIVE SERIES
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.enabled}</span>
              <span className="text-xs font-bold text-slate-400">/ {stats.total} Series</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span className="font-bold text-emerald-600">Auto-Generates</span> upcoming calendar
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                GENERATION HORIZON
              </span>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">28 Days</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Rolling future instances buffer</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                TOTAL INSTANCES
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalMeetings}</span>
              <span className="text-xs font-bold text-slate-400">Events</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Generated in schedule history</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                ENGINE HEALTH
              </span>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">Healthy</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>Cron scheduler synced</span>
            </div>
          </div>
        </div>

        {/* Series Search & List */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recurring series... (⌘K)"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-5">SERIES TITLE &amp; CATEGORY</th>
                  <th className="py-3 px-4">CADENCE &amp; TIME</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4">GENERATED INSTANCES</th>
                  <th className="py-3 px-5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filtered.length > 0 ? (
                  filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {WD[s.dayOfWeek]?.slice(0, 2) || 'SU'}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 dark:text-white text-xs block">
                              {s.title}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {s.categoryName} • {s.visibility || 'PUBLIC'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">
                            Every {WD[s.dayOfWeek]}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {clock(s.startMinutes)} – {clock(s.endMinutes)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            s.enabled
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {s.enabled ? 'Active Engine' : 'Paused'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {s._count?.meetings ?? 0}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">events</span>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        {canManage && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEdit(s)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Edit Series"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => saveSchedule({ ...s, enabled: !s.enabled })}
                              className={`p-1.5 rounded-lg transition-colors ${
                                s.enabled
                                  ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950'
                                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                              title={s.enabled ? 'Disable Series' : 'Enable Series'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-slate-400">
                      No recurring series created yet. Click &quot;Add Recurring Series&quot; to configure.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {edit && (
          <Modal
            open={Boolean(edit)}
            onClose={() => setEdit(null)}
            title={edit.id ? 'Edit Recurring Series' : 'New Recurring Series'}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSchedule(edit);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Series Title
                </label>
                <input
                  type="text"
                  required
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  placeholder="e.g. Sunday Contemporary Worship"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Day of Week
                  </label>
                  <select
                    value={edit.dayOfWeek}
                    onChange={(e) => setEdit({ ...edit, dayOfWeek: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold"
                  >
                    {WD.map((name, i) => (
                      <option key={i} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Category Name
                  </label>
                  <input
                    type="text"
                    required
                    value={edit.categoryName}
                    onChange={(e) => setEdit({ ...edit, categoryName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={clock(edit.startMinutes)}
                    onChange={(e) => setEdit({ ...edit, startMinutes: toMin(e.target.value) ?? 600 })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={clock(edit.endMinutes)}
                    onChange={(e) => setEdit({ ...edit, endMinutes: toMin(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="enabledCheckbox"
                  checked={edit.enabled}
                  onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="enabledCheckbox" className="font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  Series Engine Enabled (Automatically create upcoming calendar occurrences)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                >
                  Save Series
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AdminLayoutShell>
  );
}
