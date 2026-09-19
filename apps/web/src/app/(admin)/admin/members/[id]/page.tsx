'use client';

import React, { useState, useEffect } from 'react';
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
  ArrowLeft,
  Cake,
} from 'lucide-react';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast, Spinner, EmptyState, Badge, Button } from '@/components/ui';
import { formatBirthdayDDMM } from '@tfhc/shared';

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

export default function MemberCRMProfilePage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id as string;
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const isSuperOwner = currentUser?.email?.toLowerCase() === 'engreseglory@gmail.com';

  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'attendance'>('overview');
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);

  // Note submission state
  const [newNote, setNewNote] = useState('');
  const [noteCategory, setNoteCategory] = useState('Check-in Visit');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    async function loadMember() {
      if (!rawId || rawId === 'undefined') {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchApi<any>(`/members/${rawId}`);
        setMember(data);
      } catch (err) {
        console.error('Could not load member details', err);
        setMember(null);
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
    const formattedDate =
      now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) +
      ' – ' +
      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const authorName = currentUser?.firstName
      ? `${currentUser.firstName} ${currentUser.lastName || ''}`.trim()
      : 'Administrator';

    const created: NoteItem = {
      id: `note-${Date.now()}`,
      author: authorName,
      role: currentUser?.role || 'Admin',
      date: formattedDate,
      category: noteCategory,
      content: newNote.trim(),
      tags: [
        { label: 'Type', value: noteCategory },
        { label: 'Status', value: 'Recorded' },
      ],
      avatarInitial: authorName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      avatarBg: 'bg-indigo-600',
    };

    setNotes([created, ...notes]);
    setNewNote('');
    setSubmittingNote(false);
    notify('Note recorded successfully.', 'success');
  };

  const handleSendInvite = async () => {
    if (!member) return;
    setInviting(true);
    try {
      const res = await fetchApi<{ status: string; message: string }>(`/members/${member.id}/invite`, {
        method: 'POST',
      });
      notify(res.message || 'Platform invitation sent successfully.', 'success');
      if (rawId) {
        const updated = await fetchApi<any>(`/members/${rawId}`);
        setMember(updated);
      }
    } catch (err: any) {
      notify(err.message || 'Failed to send platform invitation.', 'error');
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayoutShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Spinner />
          <p className="text-sm text-slate-500 font-medium">Loading member profile...</p>
        </div>
      </AdminLayoutShell>
    );
  }

  if (!member) {
    return (
      <AdminLayoutShell>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Members
            </Link>
          </div>
          <EmptyState
            title="Member Not Found"
            description="The requested member profile could not be found or has been removed."
            action={
              <Button onClick={() => router.push('/admin/members')}>
                Return to Members Roster
              </Button>
            }
          />
        </div>
      </AdminLayoutShell>
    );
  }

  const displayId = member.memberCode || member.id;
  const fullName = `${member.prefix ? member.prefix + ' ' : ''}${member.firstName || ''} ${member.middleName ? member.middleName + ' ' : ''}${member.lastName || ''}`.trim() || 'Church Member';
  const lookupEmail = member.approvedMember?.email || 'Not in lookup table';
  const userEmail = member.user?.email || null;
  const phone = member.phoneNumber && member.phoneNumber !== 'UNVERIFIED' ? member.phoneNumber : null;
  const address = member.address?.trim() || null;
  const attendanceList = member.attendanceRecords || [];
  const duesList = member.duesAssignments || [];
  const excuseList = member.excuseRequests || [];
  const isRegistered = Boolean(member.user?.emailVerifiedAt || member.user?.googleSubject || member.user?.passwordAuthEnabled);
  const photoUrl = member.profilePhotoUrl || member.photoUrl || member.avatarUrl || member.user?.profilePhotoUrl || member.user?.photoUrl || member.approvedMember?.photoUrl || null;
  const isExecutive = member.roleInUnit === 'Executive' || ['ADMIN', 'LEADER'].includes(member.user?.role) || member.user?.isSuperAdmin;

  return (
    <AdminLayoutShell>
      <div className="space-y-6 pb-16">
        {/* Top Breadcrumbs and Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
              <Link href="/admin/members" className="hover:text-indigo-600 transition-colors">
                Members
              </Link>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{displayId}</span>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {fullName}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  member.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                }`}
              >
                {member.status || 'ACTIVE'}
              </span>
              {isExecutive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30 shadow-xs">
                  <Shield className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>Executive</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {isSuperOwner && !isRegistered && (
              <button
                onClick={handleSendInvite}
                disabled={inviting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                title="Send Platform Invitation Email"
              >
                <Send className="w-3.5 h-3.5" />
                {inviting ? 'Sending Invite...' : 'Send Platform Invite'}
              </button>
            )}
            <button
              onClick={() => setActiveTab('notes')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                activeTab === 'notes'
                  ? 'bg-indigo-600 text-white shadow-indigo-600/20'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Log Note
            </button>
            <button
              onClick={() => router.push('/admin/chat')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Send Message
            </button>
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 shadow-sm transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Members Roster
            </Link>
          </div>
        </div>

        {/* Master Profile Banner Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm relative overflow-hidden">
          {member.bannerPhotoUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-30 dark:opacity-25 pointer-events-none transition-opacity"
              style={{ backgroundImage: `url(${member.bannerPhotoUrl})` }}
            />
          ) : (
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            {/* Left: Avatar & Identity details */}
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="relative shrink-0">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={fullName}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shadow-lg shadow-indigo-900/20 border-2 border-white dark:border-slate-800 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-indigo-900/30 border-2 border-white dark:border-slate-800 shrink-0">
                    {`${member.firstName?.[0] || 'M'}${member.lastName?.[0] || ''}`}
                  </div>
                )}
                {isRegistered && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center" title="Registered User">
                    <Check className="w-3 h-3 text-white stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {fullName}
                  </h2>
                  <button
                    onClick={() => handleCopyId(displayId)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors border border-slate-200/80 dark:border-slate-700 cursor-pointer"
                    title="Copy Member ID"
                  >
                    <span>{displayId}</span>
                    {copiedId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                </div>

                {/* Badges & Role */}
                <div className="flex flex-wrap items-center gap-2">
                  {isExecutive ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30 shadow-xs">
                      <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Executive</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                      <Shield className="w-3 h-3" />
                      <span>{member.roleInUnit || 'Member'}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <Building2 className="w-3 h-3" />
                    The Father’s House Church
                  </span>
                  {member.subTeam?.name && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      <Users className="w-3 h-3" />
                      {member.subTeam.name}
                    </span>
                  )}
                </div>

                {/* Contact & Bio Attributes */}
                <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-600 dark:text-slate-400 font-medium pt-1">
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-900 dark:text-white">{lookupEmail}</span>
                  </div>
                  {phone && (
                    <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:underline">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono font-semibold">{phone}</span>
                    </a>
                  )}
                  {member.profession && (
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold">{member.profession}</span>
                    </div>
                  )}
                  {member.birthday && (
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <Cake className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatBirthdayDDMM(member.birthday)}</span>
                    </div>
                  )}
                  {address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Vital Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              <div
                onClick={() => setActiveTab('attendance')}
                className="px-3 py-2 border-r border-slate-200/80 dark:border-slate-800/80 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-slate-900/50 rounded-lg transition-colors"
                title="View Attendance History"
              >
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  ATTENDANCE
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {attendanceList.length}
                  </span>
                  <span className="text-[10px] text-slate-400">Services</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Recorded</span>
              </div>

              <div className="px-3 py-2 border-r border-slate-200/80 dark:border-slate-800/80">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  EXCUSES
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                    {excuseList.length}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Submitted</span>
              </div>

              <div className="px-3 py-2">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  DUES ASSIGNED
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {duesList.length}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">Months</span>
              </div>
            </div>
          </div>

          {/* Tab Navigation Strip */}
          <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 mt-6 pt-4 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview & Profile', icon: Sparkles },
              { key: 'attendance', label: 'Attendance History', count: attendanceList.length, icon: Activity },
              { key: 'notes', label: 'Member Notes', count: notes.length, icon: Lock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 ring-2 ring-indigo-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
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

        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & PROFILE                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left 2/3: Profile Details & Records Preview */}
            <div className="lg:col-span-2 space-y-6">
              {/* Comprehensive Profile Info Card */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Personal &amp; Ministry Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Full Legal Name</span>
                    <p className="font-black text-slate-900 dark:text-white text-sm">{fullName}</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Unit Designation</span>
                    <p className="font-black text-slate-900 dark:text-white text-sm">
                      {member.roleInUnit || 'Member'} {isExecutive ? '• Executive Team' : ''}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Occupation / Profession</span>
                    <p className="font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
                      {member.profession || 'Not Specified'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Birthday</span>
                    <p className="font-extrabold text-slate-900 dark:text-white text-sm">
                      {formatBirthdayDDMM(member.birthday) || 'Not Specified'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Phone Number</span>
                    <p className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {phone || 'Not Provided'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Sub-Team Assignment</span>
                    <p className="font-extrabold text-slate-900 dark:text-white text-sm">
                      {member.subTeam?.name || 'General Orderliness'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Attendance Preview Section */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Recent Attendance Records
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Most recent service participation</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('attendance')}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    View All Attendance Logs &rarr;
                  </button>
                </div>

                {attendanceList.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6 italic">No attendance records logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                          <th className="py-2.5 pr-4">DATE</th>
                          <th className="py-2.5 px-4">SERVICE</th>
                          <th className="py-2.5 px-4">METHOD</th>
                          <th className="py-2.5 pl-4 text-right">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                        {attendanceList.slice(0, 5).map((rec: any) => (
                          <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 pr-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {new Date(rec.createdAt || rec.meeting?.startsAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: '2-digit',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                              {rec.meeting?.title || 'Worship Service'}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                              {rec.method || 'GPS Check-in'}
                            </td>
                            <td className="py-2.5 pl-4 text-right">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                {rec.status || 'PRESENT'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right 1/3: Account & Directory Card */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">Account &amp; Directory</h3>
                      <span className="text-[10px] text-slate-400">Identity &amp; Lookup Table</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Lookup Table Email:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{lookupEmail}</span>
                  </div>
                  {userEmail && (
                    <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Login Email:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{userEmail}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">System Role:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{member.user?.role || 'MEMBER'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Phone Number:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{phone || 'Not Provided'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Occupation:</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{member.profession || 'Not Specified'}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Birthday:</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatBirthdayDDMM(member.birthday) || 'Not Specified'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ATTENDANCE HISTORY                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Attendance &amp; Service Logs
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Complete check-in records and worship attendance logs
                  </p>
                </div>
                <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  Total Services: {attendanceList.length}
                </span>
              </div>

              {attendanceList.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <Activity className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No attendance records logged yet</p>
                  <p className="text-xs text-slate-500">Attendance check-ins will appear here automatically.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-800/60">
                        <th className="py-3 px-4">DATE</th>
                        <th className="py-3 px-4">SERVICE / MEETING</th>
                        <th className="py-3 px-4">CHECK-IN METHOD</th>
                        <th className="py-3 px-4 text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {attendanceList.map((rec: any) => (
                        <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {new Date(rec.createdAt || rec.meeting?.startsAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: '2-digit',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                            {rec.meeting?.title || 'Sunday Worship Service'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                            {rec.method || 'Geo Check-in'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {rec.status || 'PRESENT'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: MEMBER NOTES                                                       */}
        {/* ========================================================================= */}
        {activeTab === 'notes' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Member Notes &amp; Observations
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Notes, check-in records, and observations
                  </p>
                </div>
              </div>

              {/* Note Input Box */}
              <form onSubmit={handleAddNote} className="space-y-3 bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter observation, check-in notes, or memo..."
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
                      <option value="Check-in Visit">Check-in Visit</option>
                      <option value="Annual Check-in">Annual Check-in</option>
                      <option value="Hospital Visitation">Hospital Visitation</option>
                      <option value="Family Support">Family Support</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={submittingNote || !newNote.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Save Note
                  </button>
                </div>
              </form>

              {/* Note Feed */}
              {notes.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 italic">No notes recorded for this member yet.</p>
              ) : (
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
