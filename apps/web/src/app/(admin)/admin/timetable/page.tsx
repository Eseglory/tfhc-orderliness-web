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
      const res = await fetchApi<EligibilityData>('/timetable/admin/eligibility');
      setEligibility(res);
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
    Promise.all([loadCurrent(), loadEligibility(), loadHistory()]).finally(() => {
      setLoading(false);
    });
  }, [loadCurrent, loadEligibility, loadHistory]);

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

  const approvals = data?.reviews?.filter((r) => r.decision === 'APPROVE') || [];
  const rejections = data?.reviews?.filter((r) => r.decision === 'REJECT') || [];
  const requiredApprovals = 3;
  const isApproved = approvals.length >= requiredApprovals;
  const isPublished = data?.version?.status === 'PUBLISHED';
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
            {eligibility && (
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
                        {data.period?.weekLabel}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Period: {new Date(data.period?.startDate || '').toLocaleDateString('en-GB')} –{' '}
                        {new Date(data.period?.endDate || '').toLocaleDateString('en-GB')} WAT
                      </p>
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
                        const review = data.reviews?.find((rev) => rev.reviewerUserId === r.userId);
                        const isApprovedByThis = review?.decision === 'APPROVE';
                        const isRejectedByThis = review?.decision === 'REJECT';

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
                                  {session.serviceTitle}
                                </h4>
                                {!isComplete && (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-black uppercase">
                                    Partial Coverage ({session.assignments?.length}/{session.requiredUshers})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {session.serviceDate}
                                </span>
                                <span>•</span>
                                <span>{session.startTime} – {session.endTime} WAT</span>
                                <span>•</span>
                                <span>{session.locationName || 'Main Sanctuary'}</span>
                              </p>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                              <span>Assigned: {session.assignments?.length || 0} / {session.requiredUshers}</span>
                            </div>
                          </div>

                          {/* Ushers Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {session.assignments?.map((a) => (
                              <div
                                key={a.id || a.memberId}
                                className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-2.5"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center text-xs font-bold">
                                    {a.profilePhotoUrl ? (
                                      <img src={a.profilePhotoUrl} alt={a.fullName} className="w-full h-full object-cover" />
                                    ) : (
                                      <span>{a.fullName?.charAt(0) || 'U'}</span>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                      {a.fullName}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {a.memberCode}
                                    </p>
                                  </div>
                                </div>

                                {/* Replace / Swap Button (for Admins) */}
                                {(can('timetable.manage') || user?.isSuperAdmin) && !isPublished && (
                                  <button
                                    onClick={() => {
                                      setAdjustSession(session);
                                      setAdjustOldMemberId(a.memberId);
                                      setAdjustNewMemberId('');
                                      setAdjustReason('');
                                    }}
                                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                                    title="Replace Usher"
                                  >
                                    Swap
                                  </button>
                                )}
                              </div>
                            ))}
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
              {eligibility && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Total in Lookup</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.totalInLookupTable}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Profile Created</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.registeredProfiles}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Credentials Active</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.credentialsRegistered}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Signed In ≥ 1</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.signedInApp}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Clocked In ≥ 1</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                      {eligibility.summary.clockedInAttempted}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Eligible Active</p>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                      {eligibility.summary.totalEligibleActive}
                    </p>
                  </div>
                </div>
              )}

              {/* Exclusion Reasons Breakdown */}
              {eligibility && (
                <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex flex-col gap-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
                    Exclusion Breakdown ({eligibility.summary.totalExcluded} Members Excluded)
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
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-5">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Three Designated Reviewers
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                Every generated weekly timetable requires approval from all 3 designated reviewers before it can be published.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data?.reviewers?.map((r, idx) => (
                <div
                  key={r.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-start gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {r.fullName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {r.email}
                    </p>
                    <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                      Designated Reviewer
                    </span>
                  </div>
                </div>
              ))}
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

        {/* Modal: Swap / Adjust Usher */}
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
      </div>
    </AdminLayoutShell>
  );
}
