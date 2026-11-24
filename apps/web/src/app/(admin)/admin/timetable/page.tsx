'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Users,
  AlertTriangle,
  Send,
  FileCheck,
  UserCheck,
  UserX,
  History,
  Sliders,
  Sparkles,
  BarChart3,
  UserCog,
  ArrowLeftRight,
  PlusCircle,
  Crown,
  MapPin,
  CalendarPlus,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { PageLoader } from '../../../../components/ui';

interface TimetableAssignment {
  id: string;
  memberId: string;
  fullName: string;
  memberCode: string;
  profilePhotoUrl?: string | null;
  roleTitle?: string;
  position?: string;
  role?: string;
  assignedAt: string;
}

interface TimetableSession {
  id: string;
  sessionKey: string;
  serviceTitle: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  locationName: string;
  requiredUshers: number;
  supervisingMinister?: {
    id: string;
    name: string;
    preferredName?: string;
    roleInUnit?: string;
    profilePhotoUrl?: string | null;
  } | null;
  assignments: TimetableAssignment[];
}

interface Reviewer {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  profilePhotoUrl?: string | null;
  isActive: boolean;
}

interface Review {
  id: string;
  reviewerUserId: string;
  decision: 'APPROVE' | 'REJECT';
  comments?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  reviewer?: {
    email: string;
    member?: {
      firstName: string;
      lastName: string;
    } | null;
  };
}

interface OfficialReviewerStatusItem {
  name: string;
  officialEmail: string;
  orderIndex: number;
  matched: boolean;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  hasReviewerAccessRole?: boolean;
  isDesignatedActiveReviewer: boolean;
  notes?: string;
}

interface CurrentTimetableResponse {
  period: {
    id: string;
    weekLabel: string;
    startDate: string;
    endDate: string;
    targetWeek: string;
    status: string;
  } | null;
  version: {
    id: string;
    versionNumber: number;
    status: string;
    generationType: string;
    publishedAt?: string | null;
    createdAt: string;
    metadata?: any;
  } | null;
  sessions: TimetableSession[];
  reviewers: Reviewer[];
  reviews: Review[];
  officialReviewersStatus?: {
    officialReviewers: OfficialReviewerStatusItem[];
    matchedCount: number;
    unmatchedCount: number;
    allConfigured: boolean;
  };
  isReviewer: boolean;
  userReview?: Review | null;
  canPublish: boolean;
}

interface EligibilityData {
  summary: {
    totalInLookupTable: number;
    registeredProfiles: number;
    credentialsRegistered: number;
    signedInApp: number;
    clockedInAttempted: number;
    totalEligibleActive: number;
    totalExcluded: number;
  };
  breakdownByReason: Record<string, number>;
  activeMembers: Array<{
    id: string;
    memberCode: string;
    firstName: string;
    lastName: string;
  }>;
  excludedMembers?: Array<{
    id: string;
    memberCode: string;
    firstName: string;
    lastName: string;
    reason: string;
  }>;
}

function formatSessionDate(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSessionTime(start?: string | Date, end?: string | Date): string {
  const formatTime = (t?: string | Date) => {
    if (!t) return '';
    const s = String(t);
    if (!s.includes('T')) return s;
    const d = new Date(t);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const startFmt = formatTime(start);
  const endFmt = formatTime(end);
  if (startFmt && endFmt) return `${startFmt} – ${endFmt}`;
  return startFmt || endFmt || '';
}

export default function AdminTimetablePage() {
  const { user, can } = useAuth();
  const [activeTab, setActiveTab] = useState<'current' | 'eligibility' | 'reviewers' | 'history'>('current');
  const [data, setData] = useState<CurrentTimetableResponse | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Review modal / form state
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewComments, setReviewComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Generate state
  const [targetWeekOption, setTargetWeekOption] = useState<'CURRENT' | 'NEXT'>('CURRENT');
  const [generating, setGenerating] = useState(false);

  // Swap / Adjust state
  const [adjustSession, setAdjustSession] = useState<TimetableSession | null>(null);
  const [adjustOldMemberId, setAdjustOldMemberId] = useState('');
  const [adjustNewMemberId, setAdjustNewMemberId] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Supervising Minister state
  const [ministers, setMinisters] = useState<Array<{ id: string; firstName: string; lastName: string; roleInUnit: string }>>([]);
  const [ministerModalSession, setMinisterModalSession] = useState<TimetableSession | null>(null);
  const [selectedMinisterId, setSelectedMinisterId] = useState('');
  const [ministerReason, setMinisterReason] = useState('');
  const [submittingMinister, setSubmittingMinister] = useState(false);

  // Swap Two Ushers state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapAssignmentId1, setSwapAssignmentId1] = useState('');
  const [swapAssignmentId2, setSwapAssignmentId2] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [submittingSwap, setSubmittingSwap] = useState(false);

  // Position & Role update state
  const [positionModalAssignment, setPositionModalAssignment] = useState<{ id: string; name: string; position: string; role: string } | null>(null);
  const [editPosition, setEditPosition] = useState('');
  const [editRole, setEditRole] = useState('USHER');
  const [positionReason, setPositionReason] = useState('');
  const [submittingPosition, setSubmittingPosition] = useState(false);

  // Special Event state
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [specialTitle, setSpecialTitle] = useState('');
  const [specialDate, setSpecialDate] = useState('');
  const [specialStartTime, setSpecialStartTime] = useState('09:00');
  const [specialEndTime, setSpecialEndTime] = useState('12:00');
  const [specialRequiredUshers, setSpecialRequiredUshers] = useState(6);
  const [specialMinisterId, setSpecialMinisterId] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [submittingSpecial, setSubmittingSpecial] = useState(false);

  // Load ministers list
  const loadMinisters = useCallback(async () => {
    try {
      const res = await fetchApi<any[]>('/timetable/admin/supervising-ministers');
      setMinisters(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load ministers', err);
    }
  }, []);

  // Load current timetable
  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetchApi<CurrentTimetableResponse>('/timetable/admin/current');
      setData(res);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timetable');
    }
  }, []);

  // Load eligibility stats
  const loadEligibility = useCallback(async () => {
    try {
      const res = await fetchApi<any>('/timetable/admin/eligibility');
      if (res) {
        const stats = res.stats;
        const eligibleMembers = res.eligibleMembers || [];
        const excludedMembers = res.excludedMembers || [];

        const summary = res.summary || {
          totalInLookupTable: stats?.totalLookupMembers ?? 0,
          registeredProfiles: stats?.totalRegisteredMembers ?? 0,
          credentialsRegistered: stats?.totalRegisteredMembers ?? 0,
          signedInApp: stats?.totalRegisteredMembers ?? 0,
          clockedInAttempted: stats?.totalEligibleActiveMembers ?? 0,
          totalEligibleActive: stats?.totalEligibleActiveMembers ?? eligibleMembers.length ?? 0,
          totalExcluded: stats?.totalExcludedMembers ?? excludedMembers.length ?? 0,
        };

        let breakdownByReason: Record<string, number> = res.breakdownByReason || {};
        if (!Object.keys(breakdownByReason).length && Array.isArray(stats?.reasonsBreakdown)) {
          for (const item of stats.reasonsBreakdown) {
            breakdownByReason[item.reason] = item.count;
          }
        }

        const activeMembers = res.activeMembers || eligibleMembers.map((m: any) => ({
          id: m.memberId || m.id,
          memberCode: m.memberCode,
          firstName: m.name ? m.name.split(' ')[0] : m.firstName || '',
          lastName: m.name ? m.name.split(' ').slice(1).join(' ') : m.lastName || '',
        }));

        setEligibility({
          summary,
          breakdownByReason,
          activeMembers,
          excludedMembers: res.excludedMembers || [],
        });
      }
    } catch (err) {
      console.error('Failed to load eligibility audit', err);
    }
  }, []);

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetchApi<any[]>('/timetable/admin/history');
      setHistory(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadCurrent(), loadEligibility(), loadHistory(), loadMinisters()]).finally(() => {
      setLoading(false);
    });
  }, [loadCurrent, loadEligibility, loadHistory, loadMinisters]);

  const handleGenerate = async () => {
    if (!confirm(`Generate ushering timetable for ${targetWeekOption === 'CURRENT' ? 'the CURRENT week' : 'NEXT week'}?`)) {
      return;
    }
    setGenerating(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/generate', {
        method: 'POST',
        body: JSON.stringify({ targetWeek: targetWeekOption }),
      });
      setActionSuccess('Timetable successfully generated and submitted for 3-reviewer approval!');
      await loadCurrent();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const [syncingOfficial, setSyncingOfficial] = useState(false);

  const handleSyncOfficial = async () => {
    setSyncingOfficial(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/reviewers/sync-official', { method: 'POST' });
      setActionSuccess('Official reviewers synchronized successfully!');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync official reviewers');
    } finally {
      setSyncingOfficial(false);
    }
  };

  const handlePublish = async () => {
    if (!data?.version?.id) return;
    if (!confirm('Are you sure you want to publish this timetable? It will become visible to all members.')) {
      return;
    }
    setActionSuccess('');
    setError('');
    try {
      await fetchApi(`/timetable/admin/version/${data.version.id}/publish`, {
        method: 'POST',
      });
      setActionSuccess('Timetable has been published successfully!');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const handleSubmitReview = async () => {
    if (!data?.version?.id) return;
    if (reviewDecision === 'REJECT' && !rejectionReason.trim()) {
      alert('Please provide a reason for rejecting the timetable.');
      return;
    }
    setSubmittingReview(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi(`/timetable/admin/version/${data.version.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision: reviewDecision,
          comments: reviewComments.trim() || undefined,
          rejectionReason: reviewDecision === 'REJECT' ? rejectionReason.trim() : undefined,
        }),
      });
      setShowReviewModal(false);
      setReviewComments('');
      setRejectionReason('');
      setActionSuccess(`Review submitted successfully (${reviewDecision === 'APPROVE' ? 'Approved' : 'Rejected'})!`);
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review submission failed');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAdjustAssignment = async () => {
    if (!adjustSession || !adjustOldMemberId || !adjustNewMemberId || !adjustReason.trim()) {
      alert('Please fill out all fields including the reason for replacement.');
      return;
    }
    setSubmittingAdjust(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/adjust', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: adjustSession.id,
          existingMemberId: adjustOldMemberId,
          newMemberId: adjustNewMemberId,
          reason: adjustReason.trim(),
        }),
      });
      setAdjustSession(null);
      setAdjustOldMemberId('');
      setAdjustNewMemberId('');
      setAdjustReason('');
      setActionSuccess('Usher successfully replaced and recorded in the audit log!');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const handleChangeMinister = async () => {
    if (!ministerModalSession || !selectedMinisterId) {
      alert('Please select a supervising minister.');
      return;
    }
    setSubmittingMinister(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/session-supervising-minister', {
        method: 'PATCH',
        body: JSON.stringify({
          sessionId: ministerModalSession.id,
          supervisingMinisterId: selectedMinisterId,
          reason: ministerReason.trim() || undefined,
        }),
      });
      setMinisterModalSession(null);
      setSelectedMinisterId('');
      setMinisterReason('');
      setActionSuccess('Supervising minister updated successfully! Prior approvals have been reset for fresh review.');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update minister');
    } finally {
      setSubmittingMinister(false);
    }
  };

  const handleSwap = async () => {
    if (!swapAssignmentId1 || !swapAssignmentId2) {
      alert('Please select both ushers to swap.');
      return;
    }
    if (swapAssignmentId1 === swapAssignmentId2) {
      alert('Cannot swap an usher with themselves. Please pick two different ushers.');
      return;
    }
    setSubmittingSwap(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/swap-assignments', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId1: swapAssignmentId1,
          assignmentId2: swapAssignmentId2,
          reason: swapReason.trim() || undefined,
        }),
      });
      setShowSwapModal(false);
      setSwapAssignmentId1('');
      setSwapAssignmentId2('');
      setSwapReason('');
      setActionSuccess('Ushers swapped successfully! Prior approvals have been reset for fresh review.');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to swap ushers');
    } finally {
      setSubmittingSwap(false);
    }
  };

  const handleUpdatePosition = async () => {
    if (!positionModalAssignment) return;
    setSubmittingPosition(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/assignment-position', {
        method: 'PATCH',
        body: JSON.stringify({
          assignmentId: positionModalAssignment.id,
          position: editPosition.trim() || undefined,
          role: editRole,
          reason: positionReason.trim() || undefined,
        }),
      });
      setPositionModalAssignment(null);
      setEditPosition('');
      setPositionReason('');
      setActionSuccess('Position & role updated successfully! Prior approvals have been reset for fresh review.');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update position');
    } finally {
      setSubmittingPosition(false);
    }
  };

  const handleCreateSpecialEvent = async () => {
    if (!specialTitle.trim() || !specialDate || !specialStartTime) {
      alert('Please provide event title, date, and start time.');
      return;
    }
    setSubmittingSpecial(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/special-event', {
        method: 'POST',
        body: JSON.stringify({
          title: specialTitle.trim(),
          eventDate: specialDate,
          startTime: `${specialDate}T${specialStartTime}:00Z`,
          endTime: specialEndTime ? `${specialDate}T${specialEndTime}:00Z` : undefined,
          requiredUshers: Number(specialRequiredUshers),
          supervisingMinisterId: specialMinisterId || undefined,
          notes: specialNotes.trim() || undefined,
        }),
      });
      setShowSpecialModal(false);
      setSpecialTitle('');
      setSpecialDate('');
      setSpecialNotes('');
      setActionSuccess('Special Event timetable created and submitted for review!');
      await loadCurrent();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create special event');
    } finally {
      setSubmittingSpecial(false);
    }
  };

  const allReviews: Review[] = data?.reviews || (data as any)?.approvals?.reviews || [];
  const approvals = allReviews.filter((r) => r.decision === 'APPROVE' || (r.decision as string) === 'APPROVED');
  const rejections = allReviews.filter((r) => r.decision === 'REJECT' || (r.decision as string) === 'REJECTED');
  const requiredApprovals = (data as any)?.approvals?.required || 3;
  const isApproved = (data as any)?.approvals?.isFullyApproved ?? approvals.length >= requiredApprovals;
  const isPublished = data?.version?.status === 'PUBLISHED' || Boolean((data as any)?.approvals?.isPublished);
  const isRejected = (data?.version?.status as string) === 'REJECTED' || rejections.length > 0;

  return (
    <AdminLayoutShell>
      <div className="flex flex-col gap-6 pb-20">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Calendar className="h-7 w-7 text-red-600" />
              Ushering Timetable Management
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Automated weekly scheduling, 3-person reviewer approvals, and active member eligibility tracking.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <select
              value={targetWeekOption}
              onChange={(e) => setTargetWeekOption(e.target.value as any)}
              className="text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-white"
            >
              <option value="CURRENT">Current Week</option>
              <option value="NEXT">Upcoming (Next) Week</option>
            </select>

            {(can('timetable.generate') || user?.isSuperAdmin) && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                <span>{generating ? 'Generating...' : 'Generate Timetable'}</span>
              </button>
            )}

            <button
              onClick={() => setShowSpecialModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors shadow-sm"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>+ Special Event</span>
            </button>

            {data?.sessions && data.sessions.length > 0 && !isPublished && (
              <button
                onClick={() => setShowSwapModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors shadow-sm"
              >
                <ArrowLeftRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Swap Ushers</span>
              </button>
            )}

            <Link
              href="/admin/timetable/analytics"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs transition-colors border border-slate-300 dark:border-slate-700"
            >
              <BarChart3 className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span>Analytics & Reports</span>
            </Link>

            <button
              onClick={() => {
                setLoading(true);
                loadCurrent().then(() => setLoading(false));
              }}
              className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Action Alerts */}
        {actionSuccess && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm font-semibold">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-sm font-semibold">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab('current')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'current'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Current Timetable</span>
          </button>

          <button
            onClick={() => setActiveTab('eligibility')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'eligibility'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Active Member Eligibility Audit</span>
            {eligibility?.summary?.totalEligibleActive != null && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                {eligibility.summary.totalEligibleActive} Eligible
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('reviewers')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'reviewers'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Designated Reviewers</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Version History</span>
          </button>
        </div>

        {/* Tab 1: Current Timetable */}
        {activeTab === 'current' && (
          <div className="flex flex-col gap-6">
            {loading ? (
              <div className="py-16">
                <PageLoader message="Loading timetable details..." />
              </div>
            ) : !data?.version ? (
              <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
                <Calendar className="h-12 w-12 text-slate-400 mb-3" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  No Timetable Generated for {data?.period?.weekLabel || 'This Week'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-1 mb-5">
                  The automated Saturday generator runs every Saturday at 18:00 WAT. You can also trigger an immediate catch-up generation right now.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{generating ? 'Generating...' : 'Generate Now'}</span>
                </button>
              </div>
            ) : (
              <>
                {/* Status & Review Progress Card */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                            isPublished
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                              : isApproved
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300'
                              : isRejected
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                          }`}
                        >
                          {isPublished
                            ? 'Approved & Published'
                            : isApproved
                            ? 'Fully Approved (Ready to Publish)'
                            : isRejected
                            ? 'Changes Requested (Rejected)'
                            : 'Pending 3-Reviewer Approval'}
                        </span>
                        <span className="text-xs text-slate-400 font-semibold">
                          Version {data.version.versionNumber} ({data.version.generationType})
                        </span>
                      </div>
                      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1.5">
                        {data.period?.weekLabel || (data.period as any)?.label || 'Current Week'}
                      </h2>
                      {(() => {
                        const periodStart = data.period?.startDate || (data.period as any)?.weekStart;
                        const periodEnd = data.period?.endDate;
                        const startText = periodStart ? new Date(periodStart).toLocaleDateString('en-GB') : '';
                        const endText = periodEnd
                          ? new Date(periodEnd).toLocaleDateString('en-GB')
                          : periodStart
                          ? new Date(new Date(periodStart).getTime() + 6 * 24 * 3600 * 1000).toLocaleDateString('en-GB')
                          : '';
                        return (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Period: {startText} – {endText} WAT
                          </p>
                        );
                      })()}
                    </div>

                    {/* Publish Action Button */}
                    <div className="flex items-center gap-3">
                      {!isPublished && (can('timetable.publish') || user?.isSuperAdmin) && (
                        <button
                          onClick={handlePublish}
                          disabled={!isApproved}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 font-bold text-xs transition-colors shadow-sm cursor-pointer disabled:cursor-not-allowed"
                          title={!isApproved ? 'Requires 3 reviewer approvals before publishing' : 'Publish to members'}
                        >
                          <Send className="h-4 w-4" />
                          <span>Publish Timetable</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3-Reviewer Approval Progress Bar */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-slate-500" />
                        Three-Person Approval Progress
                      </span>
                      <span className="text-slate-900 dark:text-white">
                        {approvals.length} of {requiredApprovals} Approvals Required
                      </span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (approvals.length / requiredApprovals) * 100)}%` }}
                      />
                    </div>

                    {/* Reviewers List */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      {data.reviewers?.map((r) => {
                        const review = allReviews.find((rev) => rev.reviewerUserId === r.userId);
                        const isApprovedByThis = review?.decision === 'APPROVE' || (review?.decision as string) === 'APPROVED';
                        const isRejectedByThis = review?.decision === 'REJECT' || (review?.decision as string) === 'REJECTED';

                        return (
                          <div
                            key={r.id}
                            className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                              isApprovedByThis
                                ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/30'
                                : isRejectedByThis
                                ? 'border-rose-300 bg-rose-50/50 dark:bg-rose-950/30'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                            }`}
                          >
                            <div className="mt-0.5">
                              {isApprovedByThis ? (
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                              ) : isRejectedByThis ? (
                                <XCircle className="h-4 w-4 text-rose-600" />
                              ) : (
                                <Clock className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {r.fullName}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                {isApprovedByThis
                                  ? 'Approved'
                                  : isRejectedByThis
                                  ? 'Rejected / Revise'
                                  : 'Pending Review'}
                              </p>
                              {review?.rejectionReason && (
                                <p className="text-[10px] text-rose-600 font-semibold mt-1 italic">
                                  &ldquo;{review.rejectionReason}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Review Action Banner for Reviewer */}
                  {data.isReviewer && !isPublished && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                          {data.userReview ? 'Update Your Review Decision' : 'Reviewer Action Required'}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          {data.userReview
                            ? `You previously ${data.userReview.decision === 'APPROVE' ? 'approved' : 'rejected'} this timetable. You may change your decision.`
                            : 'You are one of the 3 designated reviewers. Please inspect the schedule below and submit your approval or rejection.'}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setReviewDecision('APPROVE');
                          setShowReviewModal(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 shadow-sm"
                      >
                        <FileCheck className="h-4 w-4" />
                        <span>Submit Review</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Service Sessions & Ushers */}
                <div className="flex flex-col gap-4">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white px-1">
                    Scheduled Services & Assigned Ushers ({data.sessions?.length || 0})
                  </h3>

                  <div className="grid grid-cols-1 gap-4">
                    {data.sessions?.map((session) => {
                      const isComplete = session.assignments?.length >= session.requiredUshers;
                      return (
                        <div
                          key={session.id}
                          className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                                  {session.serviceTitle || (session as any).serviceName || (session as any).specialEventTitle || 'Church Service'}
                                </h4>
                                {!isComplete && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-black uppercase">
                                    Partial Coverage ({session.assignments?.length}/{session.requiredUshers})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {formatSessionDate(session.serviceDate)}
                                </span>
                                <span>•</span>
                                <span>{formatSessionTime(session.startTime, session.endTime)} WAT</span>
                                <span>•</span>
                                <span>{session.locationName || 'Main Sanctuary'}</span>
                              </p>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                              <span>Assigned: {session.assignments?.length || 0} / {session.requiredUshers}</span>
                            </div>
                          </div>

                          {/* Supervising Minister Section */}
                          <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                                {session.supervisingMinister?.profilePhotoUrl ? (
                                  <img src={session.supervisingMinister.profilePhotoUrl} alt="Minister" className="w-full h-full object-cover" />
                                ) : (
                                  <Crown className="h-4 w-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                  Supervising Minister
                                </span>
                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {session.supervisingMinister ? (session.supervisingMinister.name || `${(session.supervisingMinister as any).firstName || ''} ${(session.supervisingMinister as any).lastName || ''}`.trim()) : 'Not yet assigned'}
                                </p>
                              </div>
                            </div>

                            {!isPublished && (can('timetable.manage') || data.isReviewer || user?.isSuperAdmin) && (
                              <button
                                onClick={() => {
                                  setMinisterModalSession(session);
                                  setSelectedMinisterId(session.supervisingMinister?.id || '');
                                  setMinisterReason('');
                                }}
                                className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1 shadow-xs cursor-pointer"
                              >
                                <UserCog className="h-3.5 w-3.5" />
                                <span>Change Minister</span>
                              </button>
                            )}
                          </div>

                          {/* Ushers Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {session.assignments?.map((a) => {
                              const usherName = a.fullName || ((a as any).member ? `${(a as any).member.firstName || ''} ${(a as any).member.lastName || ''}`.trim() : 'Usher');
                              const usherCode = a.memberCode || (a as any).member?.memberCode || '';
                              const usherPhoto = a.profilePhotoUrl || (a as any).member?.profilePhotoUrl || null;

                              return (
                              <div
                                key={a.id || a.memberId}
                                className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-2.5"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center text-xs font-bold">
                                    {usherPhoto ? (
                                      <img src={usherPhoto} alt={usherName} className="w-full h-full object-cover" />
                                    ) : (
                                      <span>{usherName?.charAt(0) || 'U'}</span>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                      {usherName}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {usherCode} {a.position ? `• ${a.position}` : ''}
                                    </p>
                                  </div>
                                </div>

                                {/* Modifier Action Buttons */}
                                {!isPublished && (can('timetable.manage') || data.isReviewer || user?.isSuperAdmin) && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => {
                                        setPositionModalAssignment({
                                          id: a.id,
                                          name: usherName,
                                          position: a.position || '',
                                          role: a.role || 'USHER',
                                        });
                                        setEditPosition(a.position || '');
                                        setEditRole(a.role || 'USHER');
                                        setPositionReason('');
                                      }}
                                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                      title="Edit Position / Role"
                                    >
                                      Position
                                    </button>
                                    <button
                                      onClick={() => {
                                        setAdjustSession(session);
                                        setAdjustOldMemberId(a.memberId);
                                        setAdjustNewMemberId('');
                                        setAdjustReason('');
                                      }}
                                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                      title="Replace Usher"
                                    >
                                      Replace
                                    </button>
                                  </div>
                                )}
                              </div>
                            ); })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Active Member Eligibility Audit */}
        {activeTab === 'eligibility' && (
          <div className="flex flex-col gap-6">
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Active Member Eligibility Audit
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  To ensure quality and reliability, the timetable algorithm strictly schedules only active members who meet all 5 mandatory conditions: lookup table presence, completed profile, registered credentials, signed in app ≥ 1, and attempted clock-in ≥ 1.
                </p>
              </div>

              {/* 5-Criteria Metrics Grid */}
              {eligibility?.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Total in Lookup</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.totalInLookupTable ?? 0}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Profile Created</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.registeredProfiles ?? 0}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Credentials Active</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.credentialsRegistered ?? 0}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Signed In ≥ 1</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.signedInApp ?? 0}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Clocked In ≥ 1</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.clockedInAttempted ?? 0}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Eligible Active</p>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                      {eligibility.summary.totalEligibleActive ?? 0}
                    </p>
                  </div>
                </div>
              )}

              {/* Exclusion Reasons Breakdown */}
              {eligibility?.breakdownByReason && Object.keys(eligibility.breakdownByReason).length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex flex-col gap-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
                    Exclusion Breakdown ({eligibility?.summary?.totalExcluded ?? 0} Members Excluded)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {Object.entries(eligibility.breakdownByReason).map(([reason, count]) => (
                      <div key={reason} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-900/50">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{reason}</p>
                        <p className="text-base font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* List of Eligible Active Ushers */}
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Pool of Eligible Active Ushers ({eligibility?.activeMembers?.length || 0})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {eligibility?.activeMembers?.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center gap-2.5"
                    >
                      <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{m.memberCode}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Designated Reviewers */}
        {activeTab === 'reviewers' && (
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Official TFHC Timetable Reviewers
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Every generated weekly ushering timetable requires independent inspection and approval from all 3 designated reviewers before official publication.
                </p>
              </div>
              <button
                onClick={handleSyncOfficial}
                disabled={syncingOfficial}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingOfficial ? 'animate-spin' : ''}`} />
                <span>Re-sync Official Reviewers</span>
              </button>
            </div>

            {/* Official Reviewer Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(data?.officialReviewersStatus?.officialReviewers || [
                { name: 'Aanu Oyeniran', officialEmail: 'aanuoyeniran@gmail.com', orderIndex: 1, matched: false, isDesignatedActiveReviewer: false },
                { name: 'Daniel Oguamanam', officialEmail: 'danoguamanam@gmail.com', orderIndex: 2, matched: true, isDesignatedActiveReviewer: true },
                { name: 'Paseda Oluwafemi', officialEmail: 'folashadeogunlade86@gmail.com', orderIndex: 3, matched: false, isDesignatedActiveReviewer: false },
              ]).map((r) => (
                <div
                  key={r.officialEmail}
                  className={`p-5 rounded-2xl border flex flex-col justify-between gap-3 ${
                    r.isDesignatedActiveReviewer
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20'
                      : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        r.isDesignatedActiveReviewer
                          ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {r.orderIndex}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {r.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                        {r.officialEmail}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {r.isDesignatedActiveReviewer ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          <CheckCircle className="h-3 w-3" />
                          <span>Active Reviewer</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          <Clock className="h-3 w-3" />
                          <span>Awaiting App Registration</span>
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                      {r.notes ||
                        (r.isDesignatedActiveReviewer
                          ? 'Account verified and designated with timetable review authority.'
                          : 'Documented in church directory. Will automatically bind upon mobile app registration.')}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="font-bold text-slate-900 dark:text-white">Note on Official Account Binding:</strong> To prevent duplicate member accounts and ensure identity integrity, reviewer permissions are strictly bound to official directory email addresses. As soon as unregistered reviewers complete account setup in the mobile application, their reviewer designation and permissions automatically activate.
            </div>
          </div>
        )}

        {/* Tab 4: Version History */}
        {activeTab === 'history' && (
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-5">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Timetable History
            </h3>

            <div className="flex flex-col gap-3">
              {history.map((period) => (
                <div
                  key={period.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {period.weekLabel}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                        {period.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {period.versions?.length || 0} version{period.versions?.length === 1 ? '' : 's'} recorded
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {period.versions?.map((v: any) => (
                      <span
                        key={v.id}
                        className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border ${
                          v.status === 'PUBLISHED'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 border-emerald-300'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        v{v.versionNumber} ({v.status})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal: Submit Review */}
        {showReviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Submit Timetable Review
                </h3>
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReviewDecision('APPROVE')}
                  className={`flex-1 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border-2 transition-all ${
                    reviewDecision === 'APPROVE'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>Approve Timetable</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReviewDecision('REJECT')}
                  className={`flex-1 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border-2 transition-all ${
                    reviewDecision === 'REJECT'
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <span>Reject / Request Changes</span>
                </button>
              </div>

              {reviewDecision === 'REJECT' && (
                <div>
                  <label className="text-xs font-bold text-rose-800 dark:text-rose-300 block mb-1">
                    Rejection Reason (Required)
                  </label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Describe what needs adjustment before this timetable can be approved..."
                    className="w-full rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Comments / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  placeholder="Optional review feedback..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={submittingReview}
                  className={`px-5 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 ${
                    reviewDecision === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  <span>{submittingReview ? 'Submitting...' : 'Confirm Decision'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Replace Usher */}
        {adjustSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Replace Usher
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{adjustSession.serviceTitle}</p>
                </div>
                <button
                  onClick={() => setAdjustSession(null)}
                  className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Replacement Usher (Active Eligible Members Only)
                </label>
                <select
                  value={adjustNewMemberId}
                  onChange={(e) => setAdjustNewMemberId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                >
                  <option value="">-- Choose eligible member --</option>
                  {eligibility?.activeMembers
                    ?.filter((m) => m.id !== adjustOldMemberId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.firstName} {m.lastName} ({m.memberCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Adjustment (Recorded in Audit Trail)
                </label>
                <textarea
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Member requested swap due to travel..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustSession(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdjustAssignment}
                  disabled={submittingAdjust}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{submittingAdjust ? 'Updating...' : 'Confirm Replacement'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Change Supervising Minister */}
        {ministerModalSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amber-500" />
                    Change Supervising Minister
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{ministerModalSession.serviceTitle}</p>
                </div>
                <button
                  onClick={() => setMinisterModalSession(null)}
                  className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Supervising Minister (Executive / Disciplinary Committee)
                </label>
                <select
                  value={selectedMinisterId}
                  onChange={(e) => setSelectedMinisterId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                >
                  <option value="">-- Choose supervising minister --</option>
                  {ministers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName} {m.roleInUnit ? `(${m.roleInUnit})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Change (Optional)
                </label>
                <textarea
                  rows={2}
                  value={ministerReason}
                  onChange={(e) => setMinisterReason(e.target.value)}
                  placeholder="e.g. Assigned to supervise Divine Intervention service..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-900 dark:text-amber-200">
                Note: Updating the supervising minister resets prior approvals so all 3 designated reviewers can re-verify.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setMinisterModalSession(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleChangeMinister}
                  disabled={submittingMinister || !selectedMinisterId}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{submittingMinister ? 'Saving...' : 'Save Minister'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Swap Two Ushers */}
        {showSwapModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ArrowLeftRight className="h-5 w-5 text-indigo-500" />
                    Swap Two Assigned Ushers
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Select two ushers to exchange their assignments</p>
                </div>
                <button
                  onClick={() => setShowSwapModal(false)}
                  className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Usher 1
                </label>
                <select
                  value={swapAssignmentId1}
                  onChange={(e) => setSwapAssignmentId1(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                >
                  <option value="">-- Choose First Usher --</option>
                  {data?.sessions?.flatMap((s) =>
                    s.assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {s.serviceTitle}: {a.fullName} ({a.memberCode})
                      </option>
                    )),
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Usher 2
                </label>
                <select
                  value={swapAssignmentId2}
                  onChange={(e) => setSwapAssignmentId2(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                >
                  <option value="">-- Choose Second Usher --</option>
                  {data?.sessions?.flatMap((s) =>
                    s.assignments
                      .filter((a) => a.id !== swapAssignmentId1)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {s.serviceTitle}: {a.fullName} ({a.memberCode})
                        </option>
                      )),
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Swap (Optional)
                </label>
                <textarea
                  rows={2}
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="e.g. Mutual swap requested by both members..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-[11px] text-indigo-900 dark:text-indigo-200">
                Note: Swapping assignments resets prior approvals so all 3 designated reviewers can re-verify.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSwapModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={submittingSwap || !swapAssignmentId1 || !swapAssignmentId2}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{submittingSwap ? 'Swapping...' : 'Confirm Swap'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Update Position / Role */}
        {positionModalAssignment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Update Position & Role
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{positionModalAssignment.name}</p>
                </div>
                <button
                  onClick={() => setPositionModalAssignment(null)}
                  className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Assigned Section / Position
                </label>
                <input
                  type="text"
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  placeholder="e.g. Main Sanctuary Lead, Altar Area, Gallery, Left Wing"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Main Sanctuary Lead', 'Altar Area', 'Gallery / Balcony', 'Left Wing', 'Right Wing', 'Entrance Gate'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditPosition(preset)}
                      className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                >
                  <option value="USHER">USHER</option>
                  <option value="LEAD_USHER">LEAD_USHER</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Adjustment (Optional)
                </label>
                <textarea
                  rows={2}
                  value={positionReason}
                  onChange={(e) => setPositionReason(e.target.value)}
                  placeholder="e.g. Assigned as section lead for this service..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPositionModalAssignment(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdatePosition}
                  disabled={submittingPosition}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{submittingPosition ? 'Saving...' : 'Save Position'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create Special Event */}
        {showSpecialModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <CalendarPlus className="h-5 w-5 text-purple-600" />
                    Create Special Event Timetable
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Separate workflow for special programmes and events</p>
                </div>
                <button
                  onClick={() => setShowSpecialModal(false)}
                  className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Event Title (Required)
                </label>
                <input
                  type="text"
                  value={specialTitle}
                  onChange={(e) => setSpecialTitle(e.target.value)}
                  placeholder="e.g. Night of Worship, Thanksgiving Banquet"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Event Date
                  </label>
                  <input
                    type="date"
                    value={specialDate}
                    onChange={(e) => setSpecialDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={specialStartTime}
                    onChange={(e) => setSpecialStartTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={specialEndTime}
                    onChange={(e) => setSpecialEndTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Required Ushers
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={specialRequiredUshers}
                    onChange={(e) => setSpecialRequiredUshers(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Supervising Minister (Optional)
                  </label>
                  <select
                    value={specialMinisterId}
                    onChange={(e) => setSpecialMinisterId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-800 dark:text-white"
                  >
                    <option value="">-- Auto-select from Committee --</option>
                    {ministers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.firstName} {m.lastName} {m.roleInUnit ? `(${m.roleInUnit})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Notes / Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="Special instructions or event details..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSpecialModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSpecialEvent}
                  disabled={submittingSpecial || !specialTitle.trim() || !specialDate}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{submittingSpecial ? 'Generating...' : 'Generate Special Event'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}
