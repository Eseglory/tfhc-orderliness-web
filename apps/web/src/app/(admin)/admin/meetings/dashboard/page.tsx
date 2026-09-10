'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Kanban,
  List,
  Calendar as CalendarIcon,
  Plus,
  Filter,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Tag,
  Sparkles,
  ArrowUpRight,
  Building2,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

interface OperationalTask {
  id: string;
  title: string;
  category: 'Tech' | 'Worship' | 'Facilities' | 'Executive' | 'Outreach' | 'Pastoral' | string;
  priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  status: 'BACKLOG' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  dueDate: string;
  assignees: { name: string; initials: string; role?: string }[];
  subtasks: { completed: number; total: number };
  description?: string;
}

const DEFAULT_OPERATIONAL_TASKS: OperationalTask[] = [
  // Backlog
  {
    id: 'task-1',
    title: 'Sanctuary Audio System Upgrade Phase 2',
    category: 'Tech',
    priority: 'Medium',
    status: 'BACKLOG',
    dueDate: 'Jan 28, 2025',
    assignees: [{ name: 'David Chen', initials: 'DC' }, { name: 'Sarah Kim', initials: 'SK' }],
    subtasks: { completed: 2, total: 7 },
    description: 'Cross-campus soundboard routing and auxiliary monitors.',
  },
  {
    id: 'task-2',
    title: 'Easter 2025 Cantata Production Logistics',
    category: 'Worship',
    priority: 'Low',
    status: 'BACKLOG',
    dueDate: 'Feb 14, 2025',
    assignees: [{ name: 'Elena Rostova', initials: 'ER' }],
    subtasks: { completed: 0, total: 5 },
    description: 'Orchestration score acquisition and dedicated technical rehearsal scheduling.',
  },
  {
    id: 'task-3',
    title: 'Nursery Check-In QR Scanner Hardware Replacement',
    category: 'Tech',
    priority: 'High',
    status: 'BACKLOG',
    dueDate: 'Nov 15, 2024',
    assignees: [{ name: 'Marcus Vance', initials: 'MV' }],
    subtasks: { completed: 1, total: 3 },
    description: 'Procurement of 4 dedicated tablets with camera mounts.',
  },

  // Planned / Approved
  {
    id: 'task-4',
    title: 'Congregational Directory 2025 Re-print',
    category: 'Executive',
    priority: 'High',
    status: 'PLANNED',
    dueDate: 'Nov 20, 2024',
    assignees: [{ name: 'David Chen', initials: 'DC' }, { name: 'Sophia Lin', initials: 'SL' }],
    subtasks: { completed: 3, total: 8 },
    description: 'Final proofreading of member contact releases and photo index.',
  },
  {
    id: 'task-5',
    title: 'Mid-Year Pastoral Review Logistics',
    category: 'Pastoral',
    priority: 'Medium',
    status: 'PLANNED',
    dueDate: 'Nov 25, 2024',
    assignees: [{ name: 'Pastor David', initials: 'PD' }],
    subtasks: { completed: 2, total: 4 },
    description: 'Deacons board feedback synthesis and compensation reviews.',
  },

  // In Progress
  {
    id: 'task-6',
    title: 'Christmas Outreach Hamper Logistics',
    category: 'Outreach',
    priority: 'Urgent',
    status: 'IN_PROGRESS',
    dueDate: 'Nov 21, 2024',
    assignees: [{ name: 'Gabriel Ruiz', initials: 'GR' }, { name: 'Miriam Ali', initials: 'MA' }],
    subtasks: { completed: 12, total: 15 },
    description: 'Coordinate 450 family food parcels for Thanksgiving distribution.',
  },
  {
    id: 'task-7',
    title: 'New Member Orientation Portal Launch',
    category: 'Tech',
    priority: 'Medium',
    status: 'IN_PROGRESS',
    dueDate: 'Nov 30, 2024',
    assignees: [{ name: 'Sarah Kim', initials: 'SK' }],
    subtasks: { completed: 6, total: 9 },
    description: 'Integrating video testimonial embeds and digital discipleship booklets.',
  },
  {
    id: 'task-8',
    title: 'Annual Stewardship Campaign Mailer',
    category: 'Executive',
    priority: 'Urgent',
    status: 'IN_PROGRESS',
    dueDate: 'Nov 18, 2024',
    assignees: [{ name: 'David Chen', initials: 'DC' }],
    subtasks: { completed: 5, total: 6 },
    description: 'Print run verification of 1,200 personalized pledge envelopes.',
  },

  // Completed
  {
    id: 'task-9',
    title: 'Q3 Financial Audit & Elder Review',
    category: 'Executive',
    priority: 'High',
    status: 'COMPLETED',
    dueDate: 'Oct 15, 2024',
    assignees: [{ name: 'David Chen', initials: 'DC' }, { name: 'Audit Team', initials: 'AT' }],
    subtasks: { completed: 10, total: 10 },
    description: 'Complete book balance matching and internal control checks.',
  },
  {
    id: 'task-10',
    title: 'Fall Harvest Festival Operations',
    category: 'Facilities',
    priority: 'High',
    status: 'COMPLETED',
    dueDate: 'Oct 31, 2024',
    assignees: [{ name: 'Gabriel Ruiz', initials: 'GR' }],
    subtasks: { completed: 14, total: 14 },
    description: 'Campus parking coordination, food trucks, youth carnival.',
  },
  {
    id: 'task-11',
    title: 'Church Website Sermon Archive Migration',
    category: 'Tech',
    priority: 'Medium',
    status: 'COMPLETED',
    dueDate: 'Oct 10, 2024',
    assignees: [{ name: 'Sarah Kim', initials: 'SK' }],
    subtasks: { completed: 8, total: 8 },
    description: 'Migrated 420 legacy MP3 sermon records to AWS S3 storage.',
  },
  {
    id: 'task-12',
    title: 'Youth Volunteer Background Screening',
    category: 'Pastoral',
    priority: 'Urgent',
    status: 'COMPLETED',
    dueDate: 'Oct 05, 2024',
    assignees: [{ name: 'Sophia Lin', initials: 'SL' }],
    subtasks: { completed: 22, total: 22 },
    description: '100% background checks clearance verification.',
  },
];

export default function EventsDashboardPage() {
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'timeline'>('kanban');
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [selectedMinistry, setSelectedMinistry] = useState<string>('');
  const [tasks, setTasks] = useState<OperationalTask[]>(DEFAULT_OPERATIONAL_TASKS);
  const [loading, setLoading] = useState<boolean>(false);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchP = !selectedPriority || t.priority === selectedPriority;
      const matchM = !selectedMinistry || t.category === selectedMinistry;
      return matchP && matchM;
    });
  }, [tasks, selectedPriority, selectedMinistry]);

  const columns = [
    { key: 'BACKLOG', label: 'Backlog', tone: 'slate' },
    { key: 'PLANNED', label: 'Planned / Approved', tone: 'indigo' },
    { key: 'IN_PROGRESS', label: 'In Progress', tone: 'amber' },
    { key: 'COMPLETED', label: 'Completed', tone: 'emerald' },
  ];

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'Urgent':
        return 'bg-rose-500 text-white';
      case 'High':
        return 'bg-amber-500 text-white';
      case 'Medium':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Tech':
        return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
      case 'Worship':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'Facilities':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Executive':
        return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      case 'Outreach':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              STEWARDSHIP &amp; ROADMAP • FY24-Q3 SPRINT 12
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Feature &amp; Operations Board
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Track operational initiatives, church projects, ministry tasks, and administrative roadmaps across campus bodies.
            </p>
          </div>

          {/* Top-Right Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 text-xs font-bold">
              12 Active Initiatives
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 text-xs font-bold">
              86.4% Sprint Velocity
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60 text-xs font-bold">
              1 Critical (Due This Week)
            </span>
          </div>
        </div>

        {/* Filter Bar & View Mode Toggle */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1 text-slate-400 font-semibold mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter by:</span>
            </div>

            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            <select
              value={selectedMinistry}
              onChange={(e) => setSelectedMinistry(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="">All Ministries</option>
              <option value="Tech">Tech &amp; Media</option>
              <option value="Worship">Worship</option>
              <option value="Facilities">Facilities</option>
              <option value="Executive">Executive</option>
              <option value="Outreach">Outreach</option>
              <option value="Pastoral">Pastoral</option>
            </select>

            {(selectedPriority || selectedMinistry) && (
              <button
                onClick={() => {
                  setSelectedPriority('');
                  setSelectedMinistry('');
                }}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-2"
              >
                Reset
              </button>
            )}
          </div>

          {/* View Mode Toggle & Add Task */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'kanban'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>

            <Link
              href="/admin/meetings"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm shadow-indigo-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Task</span>
            </Link>
          </div>
        </div>

        {/* Strategic Focus Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 dark:border-amber-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white">
                High Priority
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Campus Strategic Focus: Advent &amp; Winter 2025
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
              Facilities, Tech, and Outreach squads are synchronizing weekly delivery milestones for the Logistics and Thanksgiving Fest.
            </p>
          </div>

          <Link
            href="/admin/calendar"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 shadow-sm shrink-0"
          >
            <span>Roadmap Specs</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Kanban Board Columns View */}
        {viewMode === 'kanban' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.key);

              return (
                <div
                  key={col.key}
                  className="rounded-2xl bg-slate-100/60 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 p-3 flex flex-col min-h-[500px]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200/80 dark:border-slate-800">
                    <span className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-current" />
                      {col.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-[11px] font-extrabold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Tasks List */}
                  <div className="space-y-3 flex-1 overflow-y-auto">
                    {colTasks.map((task) => {
                      const completionPct = Math.round(
                        (task.subtasks.completed / (task.subtasks.total || 1)) * 100
                      );

                      return (
                        <div
                          key={task.id}
                          className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                        >
                          <div>
                            {/* Top row: Category tag & Priority badge */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getCategoryColor(
                                  task.category
                                )}`}
                              >
                                {task.category}
                              </span>

                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${getPriorityBadge(
                                  task.priority
                                )}`}
                              >
                                {task.priority}
                              </span>
                            </div>

                            {/* Title & Description */}
                            <h3 className="font-extrabold text-xs text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {task.title}
                            </h3>
                            {task.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                          </div>

                          {/* Progress bar & Subtasks */}
                          <div>
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              <span>
                                {task.subtasks.completed}/{task.subtasks.total} Subtasks
                              </span>
                              <span>{completionPct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                style={{ width: `${completionPct}%` }}
                                className={`h-full rounded-full ${
                                  task.status === 'COMPLETED'
                                    ? 'bg-emerald-500'
                                    : completionPct > 60
                                    ? 'bg-indigo-600'
                                    : 'bg-amber-500'
                                }`}
                              />
                            </div>
                          </div>

                          {/* Bottom row: Due Date & Assignee Avatars */}
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1 font-medium">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {task.dueDate}
                            </span>

                            <div className="flex items-center -space-x-1.5">
                              {task.assignees.map((a, idx) => (
                                <div
                                  key={idx}
                                  className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-extrabold text-[9px] flex items-center justify-center ring-2 ring-white dark:ring-slate-900"
                                  title={a.name}
                                >
                                  {a.initials}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <thead className="text-[11px] font-bold text-slate-400 uppercase bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">TASK / INITIATIVE</th>
                  <th className="px-5 py-3.5">MINISTRY</th>
                  <th className="px-5 py-3.5">STATUS</th>
                  <th className="px-5 py-3.5">PRIORITY</th>
                  <th className="px-5 py-3.5">PROGRESS</th>
                  <th className="px-5 py-3.5">DUE DATE</th>
                  <th className="px-5 py-3.5">ASSIGNEES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                      {t.title}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getCategoryColor(t.category)}`}>
                        {t.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-xs text-slate-700 dark:text-slate-300">
                      {t.status.replace('_', ' ')}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${getPriorityBadge(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="w-24">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span>{t.subtasks.completed}/{t.subtasks.total}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            style={{ width: `${Math.round((t.subtasks.completed / (t.subtasks.total || 1)) * 100)}%` }}
                            className="h-full bg-indigo-600 rounded-full"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">{t.dueDate}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center -space-x-1.5">
                        {t.assignees.map((a, idx) => (
                          <div
                            key={idx}
                            className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-extrabold text-[9px] flex items-center justify-center ring-2 ring-white dark:ring-slate-900"
                            title={a.name}
                          >
                            {a.initials}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Operational Metrics Footer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Subteam Output Mini Card */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MINISTRY OUTPUT</p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">Weekly Sub-team Completions</p>
            <div className="flex items-end gap-2 h-14 mt-3">
              {[4, 7, 5, 8, 6, 9].map((val, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    style={{ height: `${val * 5}px` }}
                    className="w-full bg-indigo-500/80 rounded-t-sm"
                  />
                  <span className="text-[9px] text-slate-400">W{idx + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Facility Initiative Highlight */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">FACILITIES INITIATIVE</p>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">Auditorium Acoustic Dampening</p>
              <p className="text-xs text-slate-500 mt-1">
                Installation of acoustic order inlet baffles in secondary balcony for November 28th.
              </p>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mt-2">
              <span>Vendor: SoundCraft Ltd</span>
              <span>ETA: 200 Approved</span>
            </div>
          </div>

          {/* Key Ministry Task Leads */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LEADERSHIP ALLOCATION</p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">Key Ministry Task Leads</p>
            <div className="space-y-2 mt-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Pastor David Chen</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  92% Cap
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Sarah Kim</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  75% Cap
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Marcus Vance</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                  80% Cap
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
