'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  User,
  Users,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
  HeartHandshake,
  Award,
  Sparkles,
  Lock,
  ChevronRight,
  Plus,
  Send,
  Download,
  Edit3,
  UserCheck,
  Building2,
  DollarSign,
  TrendingUp,
  FileText,
  MessageSquare,
  ChevronDown,
  Layers,
  ExternalLink,
  Copy,
  Check,
  MoreVertical,
  Activity,
  AlertCircle,
  Home,
  Shield,
  Briefcase,
  Smile,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../../components/admin/AdminLayoutShell';
import { fetchApi } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';

interface NoteItem {
  id: string;
  author: string;
  role: string;
  date: string;
  category: string;
  content: string;
  tags: { label: string; value: string }[];
  avatarInitial?: string;
  avatarBg?: string;
}

interface AttendanceSession {
  date: string;
  sessionTitle: string;
  zone: string;
  channel: string;
  status: string;
}

export default function MemberCRMProfilePage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id as string;
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'attendance' | 'giving' | 'ministry'>('overview');
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);

  // Note submission state
  const [newNote, setNewNote] = useState('');
  const [noteCategory, setNoteCategory] = useState('Pastoral Care Visit');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Notes list state
  const [notes, setNotes] = useState<NoteItem[]>([
    {
      id: 'note-1',
      author: 'Pastor David Chen',
      role: 'Lead Admin',
      date: 'Oct 24, 2026 – 02:48 PM',
      category: 'Annual Pastoral Check-in',
      content:
        'Met for our scheduled annual pastoral check-in over coffee. Marcus expressed immense gratitude for the youth mentorship expansion. Discussed daughter Chloe’s upcoming confirmation classes and readiness. Spiritual health remains strong; Marcus committed to continuing his finance committee leadership for the upcoming capital review.',
      tags: [
        { label: 'Follow-up', value: 'None required' },
        { label: 'Category', value: 'Governance & Family' },
      ],
      avatarInitial: 'DC',
      avatarBg: 'bg-indigo-600',
    },
    {
      id: 'note-2',
      author: 'Pastor Sarah Jenkins',
      role: 'Hospital & Care Visitation',
      date: 'Sep 12, 2026 – 11:15 AM',
      category: 'Hospital & Care Visitation',
      content:
        'Hospital visitation at St. Luke’s Medical Pavilion. Eleanor (spouse) underwent a planned minor outpatient orthopedic procedure. Marcus took temporary leave from work; prayer and communion ministered by bedside. Church Care Team organized an 8-day meal train. Eleanor discharged home in great spirits.',
      tags: [
        { label: 'Meal Train', value: 'Completed' },
        { label: 'Care Team', value: 'West End Parish' },
      ],
      avatarInitial: 'SJ',
      avatarBg: 'bg-amber-600',
    },
    {
      id: 'note-3',
      author: 'Elder Marcus Sterling (Self-Reported)',
      role: 'Governance Retreat Completion',
      date: 'Jun 04, 2026 – 09:00 AM',
      category: 'Governance Retreat Completion',
      content:
        'Successfully completed the 2026 Church Board Governance Training retreat at Lakeview Center. Submitted compliance and conflict-of-interest disclosures to the executive oversight committee.',
      tags: [
        { label: 'Accreditation', value: 'Board Certified' },
        { label: 'Compliance', value: 'Submitted' },
      ],
      avatarInitial: 'MS',
      avatarBg: 'bg-emerald-600',
    },
  ]);

  useEffect(() => {
    async function loadMember() {
      setLoading(true);
      try {
        if (rawId && rawId !== 'undefined' && rawId !== 'sample' && !rawId.startsWith('ORD-')) {
          const data = await fetchApi<any>(`/members/${rawId}`);
          setMember(data);
        } else {
          // Default baseline profile
          setMember({
            id: 'ORD-2041',
            firstName: 'Marcus',
            lastName: 'Sterling',
            prefix: 'Elder',
            email: 'm.sterling@ordaliness.org',
            phoneNumber: '+1 (555) 349-2892',
            address: '742 Evergreen Terrace, Campus Zone 2',
            covenantSince: 'Mar 2021',
            campus: 'Grace Cathedral - Main',
            subTeam: { name: 'Finance Committee Chair' },
            roleInUnit: 'Governing Board - Deacon',
            status: 'ACTIVE',
          });
        }
      } catch (err) {
        // Fallback default
        setMember({
          id: 'ORD-2041',
          firstName: 'Marcus',
          lastName: 'Sterling',
          prefix: 'Elder',
          email: 'm.sterling@ordaliness.org',
          phoneNumber: '+1 (555) 349-2892',
          address: '742 Evergreen Terrace, Campus Zone 2',
          covenantSince: 'Mar 2021',
          campus: 'Grace Cathedral - Main',
          subTeam: { name: 'Finance Committee Chair' },
          roleInUnit: 'Governing Board - Deacon',
          status: 'ACTIVE',
        });
      } finally {
        setLoading(false);
      }
    }
    loadMember();
  }, [rawId]);

  const handleCopyId = (idStr: string) => {
    navigator.clipboard.writeText(idStr);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSubmittingNote(true);

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) +
      ' – ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const authorName = currentUser?.firstName
      ? `${currentUser.firstName} ${currentUser.lastName || ''}`.trim()
      : 'Pastor David Chen';

    const created: NoteItem = {
      id: `note-${Date.now()}`,
      author: authorName,
      role: 'Executive Care Note',
      date: formattedDate,
      category: noteCategory,
      content: newNote.trim(),
      tags: [
        { label: 'Type', value: noteCategory },
        { label: 'Status', value: 'Recorded' },
      ],
      avatarInitial: authorName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      avatarBg: 'bg-indigo-600',
    };

    setNotes([created, ...notes]);
    setNewNote('');
    setSubmittingNote(false);
  };

  const displayId = member?.id?.startsWith('ORD-') ? member.id : `ORD-2041`;
  const fullName = member ? `${member.prefix ? member.prefix + ' ' : ''}${member.firstName} ${member.lastName}` : 'Elder Marcus Sterling';

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumbs and Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/members" className="hover:text-indigo-600 transition-colors">
                PEOPLE
              </Link>
              <span>/</span>
              <Link href="/admin/members" className="hover:text-indigo-600 transition-colors">
                CONGREGANT REGISTRY
              </Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{displayId}</span>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Congregant CRM & Shepherding Intelligence
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Active Covenant
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('notes')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/80 transition-all shadow-sm"
            >
              <FileText className="w-3.5 h-3.5" />
              Log Pastoral Note
            </button>
            <button
              onClick={() => setActiveTab('ministry')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <Briefcase className="w-3.5 h-3.5" />
              Assign Ministry Role
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              Log Care Visit
            </button>
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Profile
            </Link>
          </div>
        </div>

        {/* Member Master Profile Banner Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            {/* Left: Avatar & Identity details */}
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="relative">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-indigo-900/30 border-2 border-white dark:border-slate-800">
                  MS
                </div>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white stroke-[3]" />
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {fullName}
                  </h2>
                  <button
                    onClick={() => handleCopyId(displayId)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors border border-slate-200/80 dark:border-slate-700"
                    title="Copy Congregant ID"
                  >
                    <span>{displayId}</span>
                    {copiedId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                    <Shield className="w-3 h-3" />
                    Governing Board - Deacon
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800">
                    <DollarSign className="w-3 h-3" />
                    Finance Committee Chair
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" />
                    Covenant Member (Since Mar 2021)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <Building2 className="w-3 h-3" />
                    Grace Cathedral - Main
                  </span>
                </div>

                {/* Contact information details */}
                <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-600 dark:text-slate-400 font-medium pt-1">
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-900 dark:text-white">m.sterling@ordaliness.org</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                      Verified
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>+1 (555) 349-2892</span>
                    <span className="text-slate-400 text-[11px]">(Mobile)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>742 Evergreen Terrace, Campus Zone 2</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Key Vital Scorecards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              <div className="px-3 py-2 border-r border-slate-200/80 dark:border-slate-800/80">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  CONSISTENCY
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-slate-900 dark:text-white">96%</span>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">12/12</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Past 90 Days</span>
              </div>

              <div className="px-3 py-2 border-r border-slate-200/80 dark:border-slate-800/80">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  DISCIPLESHIP
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">Tier IV</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Leadership Ac.</span>
              </div>

              <div className="px-3 py-2 border-r border-slate-200/80 dark:border-slate-800/80">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  SMALL GROUP
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-sm font-black text-slate-900 dark:text-white">North Men</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Active Leader</span>
              </div>

              <div className="px-3 py-2">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  STEWARDSHIP
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">Vision &apos;26</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Pledge Partner</span>
              </div>
            </div>
          </div>

          {/* Tab Navigation Strip */}
          <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 mt-6 pt-4 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview & Vitals', icon: Sparkles },
              { key: 'notes', label: 'Pastoral Care & Confidential Notes', count: notes.length, icon: Lock },
              { key: 'attendance', label: 'Attendance & Service Logs', icon: Activity },
              { key: 'giving', label: 'Giving & Pledges', icon: DollarSign },
              { key: 'ministry', label: 'Ministry Teams & Serving', icon: Users },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Master 2-Column Content Grid: 2/3 Left & 1/3 Right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT 2/3 COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Ecclesiastical Journey & Milestones */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Ecclesiastical Journey & Milestones
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Validated sacramental, discipleship, and governance track progress
                  </p>
                </div>
                <button className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  <Plus className="w-3.5 h-3.5" />
                  Add Milestone
                </button>
              </div>

              {/* Milestones Pipeline / Timeline */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {
                    num: '1',
                    date: 'Oct 2020',
                    title: 'First Service Guest',
                    sub: 'Welcome Reception',
                    active: true,
                  },
                  {
                    num: '2',
                    date: 'Jan 2021',
                    title: 'Discipleship Cohort',
                    sub: 'Completed 8-Wk Series',
                    active: true,
                  },
                  {
                    num: '3',
                    date: 'Feb 2021',
                    title: 'Baptism & Creed',
                    sub: 'Public Profession',
                    active: true,
                  },
                  {
                    num: '4',
                    date: 'Mar 2021',
                    title: 'Covenant Member',
                    sub: 'Confirmed by Elder Council',
                    active: true,
                  },
                  {
                    num: '5',
                    date: 'May 2024',
                    title: 'Deacon Ordination',
                    sub: 'Rev. David Chen',
                    active: true,
                    highlight: true,
                  },
                  {
                    num: '6',
                    date: 'CURRENT',
                    title: 'Lead Mentor',
                    sub: 'Young Adult Synod',
                    active: true,
                    current: true,
                  },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-center relative flex flex-col justify-between ${
                      step.current
                        ? 'bg-amber-50/70 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/60'
                        : step.highlight
                        ? 'bg-indigo-50/70 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800'
                        : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <div
                        className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center text-xs font-black mb-1.5 ${
                          step.current
                            ? 'bg-amber-500 text-white'
                            : step.highlight
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {step.num}
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                        {step.date}
                      </span>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white mt-1 leading-tight">
                        {step.title}
                      </h4>
                    </div>
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">
                      {step.sub}
                    </p>
                  </div>
                ))}
              </div>

              {/* Certificate & Formation Banner */}
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-indigo-950/30 p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900 dark:text-white">
                      Spiritual Formation & Leadership Academy
                    </h5>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Three-year doctrinal syllabus fully completed with formal pastoral sign-off.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-sm">
                  Canonical Certificate #CC-001
                </span>
              </div>
            </div>

            {/* 2. Pastoral Care & Confidential Notes */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Pastoral Care & Confidential Notes
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Visible only to Executive Pastors, Campus Directors & Ordained Deacons
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    Restricted Level 4
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Encrypted End-to-End
                  </span>
                </div>
              </div>

              {/* Note Input Box */}
              <form onSubmit={handleAddNote} className="space-y-3 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Recent pastoral observation, hospital visit log, or family counseling memo..."
                  rows={3}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={noteCategory}
                      onChange={(e) => setNoteCategory(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Pastoral Care Visit">Pastoral Care Visit</option>
                      <option value="Annual Pastoral Check-in">Annual Pastoral Check-in</option>
                      <option value="Hospital & Care Visitation">Hospital & Care Visitation</option>
                      <option value="Governance Retreat Completion">Governance Retreat Completion</option>
                      <option value="Family Support & Counseling">Family Support & Counseling</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={submittingNote || !newNote.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Confidential Entry
                  </button>
                </div>
              </form>

              {/* Note Feed */}
              <div className="space-y-4">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px] font-black ${
                            n.avatarBg || 'bg-indigo-600'
                          }`}
                        >
                          {n.avatarInitial || 'PC'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black text-slate-900 dark:text-white">{n.author}</h4>
                            <span className="text-[10px] font-semibold text-slate-400">• {n.category}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">{n.date}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
                      &quot;{n.content}&quot;
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      {n.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        >
                          <span className="font-bold text-slate-700 dark:text-slate-300">{t.label}:</span>
                          <span>{t.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Recent Attendance & Participation */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Recent Attendance & Participation
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Real-time sanctuary check-ins, leadership synods, and small group presence
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                    Filter: Last 90 Days
                  </span>
                  <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Export Log
                  </button>
                </div>
              </div>

              {/* Mini-metrics sparkline row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase">Sunday Services</span>
                    <span className="text-slate-900 dark:text-white">12 / 12 (100%)</span>
                  </div>
                  <div className="flex items-center gap-1 h-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="flex-1 h-full bg-indigo-600 rounded-sm" />
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase">Leadership Synods</span>
                    <span className="text-slate-900 dark:text-white">4 / 4 (100%)</span>
                  </div>
                  <div className="flex items-center gap-1 h-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex-1 h-full bg-indigo-600 rounded-sm" />
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase">Small Group Circles</span>
                    <span className="text-slate-900 dark:text-white">8 / 8 (100%)</span>
                  </div>
                  <div className="flex items-center gap-1 h-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex-1 h-full bg-emerald-500 rounded-sm" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 pr-4">DATE & SESSION</th>
                      <th className="py-2.5 px-4">GATHERING TITLE</th>
                      <th className="py-2.5 px-4">SANCTUARY ZONE</th>
                      <th className="py-2.5 px-4">CHECK-IN CHANNEL</th>
                      <th className="py-2.5 pl-4 text-right">VERIFICATION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {[
                      {
                        date: 'Oct 25, 2026 • 10:00 AM',
                        title: 'Sunday Contemporary Worship',
                        zone: 'Main Sanctuary • Row D',
                        channel: 'In-Person (QR Mobile)',
                        status: 'Verified',
                      },
                      {
                        date: 'Oct 22, 2026 • 07:00 PM',
                        title: 'Midweek Word & Intercession',
                        zone: 'Main Sanctuary',
                        channel: 'RFID Kiosk Check-in',
                        status: 'Verified',
                      },
                      {
                        date: 'Oct 19, 2026 • 10:00 AM',
                        title: 'Harvest Celebration & Baptisms',
                        zone: 'West Hall Overflow',
                        channel: 'Serving Lead (Usher)',
                        status: 'Verified',
                      },
                      {
                        date: 'Oct 12, 2026 • 10:00 AM',
                        title: 'Sunday Contemporary Worship',
                        zone: 'Main Sanctuary',
                        channel: 'In-Person (Mobile)',
                        status: 'Verified',
                      },
                      {
                        date: 'Oct 05, 2026 • 09:00 AM',
                        title: 'Traditional Liturgical Service',
                        zone: 'Historic Chapel',
                        channel: 'Roster Check',
                        status: 'Verified',
                      },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pr-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {row.date}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {row.title}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {row.zone}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {row.channel}
                        </td>
                        <td className="py-3 pl-4 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT 1/3 COLUMN */}
          <div className="space-y-6">
            {/* 1. The Sterling Household */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">The Sterling Household</h3>
                    <span className="text-[10px] text-slate-400">Family Unit #FAM-802</span>
                  </div>
                </div>
                <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Manage Unit
                </button>
              </div>

              <div className="space-y-3">
                {[
                  {
                    name: 'Eleanor Sterling',
                    relation: 'Spouse • Choir Alto',
                    badge: 'Member',
                    initial: 'ES',
                    bg: 'bg-indigo-600',
                  },
                  {
                    name: 'Chloe Sterling',
                    relation: 'Daughter, Age 14 • G-Teens Youth',
                    badge: 'Confirmed',
                    initial: 'CS',
                    bg: 'bg-purple-600',
                  },
                  {
                    name: 'Lucas Sterling',
                    relation: 'Son, Age 11 • Junior Awana',
                    badge: 'Kids Club',
                    initial: 'LS',
                    bg: 'bg-amber-600',
                  },
                ].map((memberItem, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-black ${memberItem.bg}`}
                      >
                        {memberItem.initial}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white">{memberItem.name}</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{memberItem.relation}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {memberItem.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Active Ministry Roles */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Active Ministry Roles</h3>
                    <span className="text-[10px] text-slate-400">Ecclesiastical commitments & charters</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    title: 'Finance Committee',
                    badge: 'Chairperson',
                    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
                    meta: 'Commitment: 4 hrs/wk',
                    term: 'Term: Dec 2027',
                  },
                  {
                    title: 'Deacons Council',
                    badge: 'Board Voting',
                    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                    meta: 'Commitment: 3 hrs/wk',
                    term: 'Quorum Member',
                  },
                  {
                    title: 'Sunday Ushers Guild',
                    badge: 'Team B Lead',
                    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                    meta: 'Commitment: 2 hrs/wk',
                    term: 'Sanctuary Service',
                  },
                ].map((role, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">{role.title}</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${role.badgeColor}`}>
                        {role.badge}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{role.meta}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{role.term}</span>
                    </div>
                  </div>
                ))}

                <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                  <div>
                    <h5 className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Access Level 4 Granted
                    </h5>
                    <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                      Board Governance, Financial Audits & Pastoral Minutes
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Stewardship & Pledges */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Stewardship & Pledges</h3>
                    <span className="text-[10px] text-slate-400">Fiscal Year: 2026 Overview</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                  In Good Standing
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white">Vision 2026 Building Fund</span>
                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">91.3% Fulfilled</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 rounded-full w-[91.3%]" />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Given YTD: <strong className="text-slate-900 dark:text-white">$10,956.00</strong></span>
                    <span>Pledged: <strong className="text-slate-900 dark:text-white">$12,000.00</strong></span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                    <span>General Tithe & Offering</span>
                    <span className="text-emerald-600">Active Recurring</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Automated recurring monthly ACH gift processed on the 1st of every calendar month.
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span>Tax Receipt: <strong>2025 Delivered</strong></span>
                    <span>• <strong>2026 Accruing</strong></span>
                  </div>
                </div>

                <button className="w-full text-center py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  View Financial Ledger (Audited) →
                </button>
              </div>
            </div>

            {/* 4. Assigned Shepherding */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Assigned Shepherding</h3>
                    <span className="text-[10px] text-slate-400">Direct oversight & eldership circle</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  {
                    name: 'Pastor David Chen',
                    role: 'Primary Overseer • Lead Admin',
                    initial: 'DC',
                    bg: 'bg-indigo-600',
                  },
                  {
                    name: 'Elder Samuel Osei',
                    role: 'Care Deacon • West End',
                    initial: 'SO',
                    bg: 'bg-amber-600',
                  },
                ].map((shepherd, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-black ${shepherd.bg}`}
                      >
                        {shepherd.initial}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white">{shepherd.name}</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{shepherd.role}</p>
                      </div>
                    </div>
                    <button className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button className="w-full py-2.5 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm transition-all">
                  <Send className="w-3.5 h-3.5" />
                  Send Secure Message / SMS
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayoutShell>
  );
}
