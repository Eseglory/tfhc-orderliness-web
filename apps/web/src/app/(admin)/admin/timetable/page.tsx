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
  Share2,
  Printer,
  Copy,
  Eye,
  ArrowLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Bell,
  Search,
  Filter,
  Star,
  Trash2,
  RotateCw,
  Armchair,
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
  leadUsher?: {
    id: string;
    name: string;
    role?: string;
    position?: string;
    profilePhotoUrl?: string | null;
  } | null;
  chairArrangement?: {
    group: string;
    groupName: string;
    members?: any[];
    note?: string;
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
    platformOwner?: OfficialReviewerStatusItem;
    allApprovers?: OfficialReviewerStatusItem[];
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
  const [activeTab, setActiveTab] = useState<'current' | 'eligibility' | 'reviewers' | 'history' | 'analytics' | 'special_events' | 'monthly_rotation' | 'chair_groups'>('current');
  const [detailedSession, setDetailedSession] = useState<TimetableSession | null>(null);
  const [selectedPeriodOption, setSelectedPeriodOption] = useState<string>('CURRENT');
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

  // Monthly Member Rotation state
  const [monthlyRotationData, setMonthlyRotationData] = useState<any>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [monthlyFilter, setMonthlyFilter] = useState<'ALL' | 'TARGET_MET' | 'ONE_MORE_NEEDED' | 'NOT_YET_SCHEDULED'>('ALL');
  const [monthlySearch, setMonthlySearch] = useState('');

  // Saturday Chair Arrangement Groups state
  const [chairGroupsData, setChairGroupsData] = useState<any>(null);
  const [loadingChair, setLoadingChair] = useState(false);
  const [savingChair, setSavingChair] = useState(false);
  const [newMemberA, setNewMemberA] = useState('');
  const [newMemberB, setNewMemberB] = useState('');

  // Notify Reviewers state
  const [sendingReviewReminders, setSendingReviewReminders] = useState(false);

  // Load ministers list
  const loadMinisters = useCallback(async () => {
    try {
      const res = await fetchApi<any[]>('/timetable/admin/supervising-ministers');
      setMinisters(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load ministers', err);
    }
  }, []);

  // Load monthly rotation analytics
  const loadMonthlyRotation = useCallback(async () => {
    setLoadingMonthly(true);
    try {
      const res = await fetchApi<any>('/timetable/admin/monthly-rotation');
      setMonthlyRotationData(res);
    } catch (err) {
      console.error('Failed to load monthly rotation', err);
    } finally {
      setLoadingMonthly(false);
    }
  }, []);

  // Load Saturday Chair Arrangement teams
  const loadChairGroups = useCallback(async () => {
    setLoadingChair(true);
    try {
      const res = await fetchApi<any>('/timetable/admin/chair-groups');
      setChairGroupsData(res);
    } catch (err) {
      console.error('Failed to load chair groups', err);
    } finally {
      setLoadingChair(false);
    }
  }, []);

  // Save Saturday Chair Arrangement teams
  const handleSaveChairGroups = async (groupAIds: string[], groupBIds: string[]) => {
    setSavingChair(true);
    setActionSuccess('');
    setError('');
    try {
      const res = await fetchApi<any>('/timetable/admin/chair-groups', {
        method: 'POST',
        body: JSON.stringify({ groupA: groupAIds, groupB: groupBIds }),
      });
      setChairGroupsData(res);
      setActionSuccess('Saturday Chair Arrangement teams saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save chair teams');
    } finally {
      setSavingChair(false);
    }
  };

  // Notify all 4 approvers (email + in-app)
  const handleNotifyReviewers = async () => {
    if (!data?.version?.id) return;
    setSendingReviewReminders(true);
    setActionSuccess('');
    setError('');
    try {
      await fetchApi('/timetable/admin/notify-reviewers', {
        method: 'POST',
        body: JSON.stringify({ versionId: data.version.id }),
      });
      setActionSuccess('Review notifications sent via email and in-app alerts to all 4 required approvers (Aanu Oyeniran, Daniel Oguamanam, Paseda Oluwafemi, and Platform Owner)!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send review reminders');
    } finally {
      setSendingReviewReminders(false);
    }
  };

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
    Promise.all([
      loadCurrent(),
      loadEligibility(),
      loadHistory(),
      loadMinisters(),
      loadMonthlyRotation(),
      loadChairGroups(),
    ]).finally(() => {
      setLoading(false);
    });
  }, [loadCurrent, loadEligibility, loadHistory, loadMinisters, loadMonthlyRotation, loadChairGroups]);

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

  const handlePublish = async (force: boolean | React.MouseEvent = false) => {
    const isForce = typeof force === 'boolean' ? force : false;
    if (!data?.version?.id) return;
    if (!confirm('Are you sure you want to publish this timetable? It will become visible to all members.')) {
      return;
    }
    setActionSuccess('');
    setError('');
    try {
      await fetchApi(`/timetable/admin/version/${data.version.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ force: isForce || user?.isSuperAdmin }),
      });
      setActionSuccess('Timetable has been published successfully and is now live for all members!');
      await loadCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const getFullRosterWhatsAppText = (): string => {
    if (!data) return '';
    const periodLabel = data.period?.weekLabel || (data.period as any)?.label || 'Current Week';
    let text = `🏛️ *THE FATHER'S HOUSE CHURCH (TFHC)*\n`;
    text += `📋 *USHERING DEPARTMENT WEEKLY ROSTER*\n`;
    text += `📅 *${periodLabel}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const sessions = data.sessions || [];
    sessions.forEach((s, idx) => {
      const title = s.serviceTitle || (s as any).serviceName || `Service #${idx + 1}`;
      const date = formatSessionDate(s.serviceDate || s.startTime);
      const times = formatSessionTime(s.startTime, s.endTime);
      const location = s.locationName || (s as any).location || 'Main Sanctuary';
      const minister = s.supervisingMinister
        ? `${s.supervisingMinister.name || `${(s.supervisingMinister as any).firstName || ''} ${(s.supervisingMinister as any).lastName || ''}`.trim()}${s.supervisingMinister.roleInUnit ? ` (${s.supervisingMinister.roleInUnit})` : ''}`
        : 'To be assigned';
      const list = s.assignments || [];

      text += `🔹 *${date} — ${title}*\n`;
      if (times) text += `   ⏰ Time: ${times} WAT\n`;
      text += `   📍 Venue: ${location}\n`;
      text += `   🛡️ Minister: ${minister}\n`;
      text += `   👥 Ushers (${list.length}):\n`;
      if (list.length === 0) {
        text += `      _No ushers assigned yet_\n`;
      } else {
        list.forEach((a, uIdx) => {
          const uName = a.fullName || (a as any).usherName || (a as any).member?.firstName ? `${(a as any).member?.firstName || ''} ${(a as any).member?.lastName || ''}`.trim() : 'Usher';
          const uCode = a.memberCode || (a as any).usherCode || (a as any).member?.memberCode ? ` [${a.memberCode || (a as any).usherCode || (a as any).member?.memberCode}]` : '';
          const uPos = a.position || a.roleTitle || (a as any).positionRole ? ` • ${a.position || a.roleTitle || (a as any).positionRole}` : '';
          text += `      ${uIdx + 1}. ${uName}${uCode}${uPos}\n`;
        });
      }
      text += `\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `• Please arrive and check in at least 30 minutes before service.\n`;
    text += `• Promptness, dedication, and excellence in God's house. 🙏\n`;
    return text;
  };

  const getServiceRosterWhatsAppText = (s: TimetableSession): string => {
    const title = s.serviceTitle || (s as any).serviceName || 'Church Service';
    const date = formatSessionDate(s.serviceDate || s.startTime);
    const times = formatSessionTime(s.startTime, s.endTime);
    const location = s.locationName || (s as any).location || 'Main Sanctuary';
    const minister = s.supervisingMinister
      ? `${s.supervisingMinister.name || `${(s.supervisingMinister as any).firstName || ''} ${(s.supervisingMinister as any).lastName || ''}`.trim()}${s.supervisingMinister.roleInUnit ? ` (${s.supervisingMinister.roleInUnit})` : ''}`
      : 'To be assigned';
    const list = s.assignments || [];

    let text = `🏛️ *TFHC USHERING ROSTER — ${title.toUpperCase()}*\n`;
    text += `📅 *${date}*\n`;
    if (times) text += `⏰ Time: ${times} WAT\n`;
    text += `📍 Venue: ${location}\n`;
    text += `🛡️ Supervising Minister: ${minister}\n\n`;
    text += `👥 *Assigned Ushers (${list.length}):*\n`;
    list.forEach((a, i) => {
      const uName = a.fullName || (a as any).usherName || (a as any).member?.firstName ? `${(a as any).member?.firstName || ''} ${(a as any).member?.lastName || ''}`.trim() : 'Usher';
      const uCode = a.memberCode || (a as any).usherCode || (a as any).member?.memberCode ? ` [${a.memberCode || (a as any).usherCode || (a as any).member?.memberCode}]` : '';
      const uPos = a.position || a.roleTitle || (a as any).positionRole ? ` • ${a.position || a.roleTitle || (a as any).positionRole}` : '';
      text += `${i + 1}. ${uName}${uCode}${uPos}\n`;
    });
    return text;
  };

  const copyOrShareText = async (text: string, title: string, successMsg: string) => {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text });
        setActionSuccess(successMsg);
        return;
      } catch (err) {}
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setActionSuccess(successMsg);
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

  // 3.2 Dashboard Summary Metrics
  const totalScheduledServices = data?.sessions?.length || 0;
  const totalAssignedUshers = data?.sessions?.reduce((sum, s) => sum + (s.assignments?.length || 0), 0) || 0;
  const uniqueMembersAssigned = React.useMemo(() => {
    const ids = new Set<string>();
    data?.sessions?.forEach((s) => s.assignments?.forEach((a) => a.memberId && ids.add(a.memberId)));
    return ids.size;
  }, [data]);
  const totalEligibleMembers = eligibility?.summary?.totalEligibleActive ?? 0;
  const pendingReviewerApprovals = Math.max(0, requiredApprovals - approvals.length);
  const timetablePublicationStatusText = isPublished ? 'Published' : isApproved ? 'Approved' : isRejected ? 'Rejected' : data?.version ? 'Pending Review' : 'Not Generated';

  const handleSelectPeriod = async (periodVal: string) => {
    setSelectedPeriodOption(periodVal);
    setDetailedSession(null);
    if (periodVal === 'CURRENT') {
      setLoading(true);
      await loadCurrent();
      setLoading(false);
      return;
    }
    if (periodVal === 'NEXT') {
      setTargetWeekOption('NEXT');
      return;
    }
    // Load historical period / version
    const foundPeriod = history.find((p) => p.id === periodVal);
    if (foundPeriod) {
      const latestVer = foundPeriod.versions?.[0];
      if (latestVer) {
        setLoading(true);
        try {
          const ver = await fetchApi<any>('/timetable/admin/version/' + latestVer.id);
          setData({
            period: foundPeriod,
            version: ver,
            sessions: ver.sessions || [],
            reviewers: data?.reviewers || [],
            reviews: ver.reviews || [],
            isReviewer: data?.isReviewer || false,
            canPublish: can('timetable.publish'),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load historical version');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  return (
    <AdminLayoutShell>
      <div className="flex flex-col gap-6 pb-20">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Calendar className="h-7 w-7 text-red-600 shrink-0" />
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                Ushering Timetable Management
              </h1>
              <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-800">
                Current Week
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                  isPublished
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                    : isApproved
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300'
                    : isRejected
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                }`}
              >
                {isPublished ? 'Published' : isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending Review'}
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Manage weekly ushering schedules, service assignments, reviewer approvals and timetable reports.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Week Selector */}
            <select
              value={selectedPeriodOption}
              onChange={(e) => handleSelectPeriod(e.target.value)}
              className="text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-white"
            >
              <option value="CURRENT">Current Week ({data?.period?.weekLabel || 'Active'})</option>
              <option value="NEXT">Upcoming (Next) Week</option>
              {history.length > 0 && (
                <optgroup label="Historical Rosters">
                  {history.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label || p.weekLabel || (p.periodType === 'SPECIAL_EVENT' ? 'Special Event' : 'Week of ' + new Date(p.weekStart).toLocaleDateString())} ({p.status})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              onClick={() => setActiveTab('special_events')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>Special Events</span>
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

            {data?.sessions && data.sessions.length > 0 && (
              <button
                onClick={() => copyOrShareText(getFullRosterWhatsAppText(), 'TFHC Ushering Roster', 'Weekly roster copied! Ready to paste into WhatsApp.')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
                title="Share complete weekly roster to WhatsApp or social"
              >
                <Share2 className="h-4 w-4" />
                <span>Share WhatsApp Roster</span>
              </button>
            )}

            {data?.version && !isPublished && (user?.isSuperAdmin || can('timetable.publish')) && (
              <button
                onClick={() => handlePublish(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
                title="Publish timetable immediately for all members"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Publish Roster</span>
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
              onClick={() => { if (typeof window !== 'undefined') window.print(); }}
              className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="Print Timetable"
            >
              <Printer className="h-4 w-4" />
            </button>

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

        {/* Tab Navigation - 6 Clearly Labelled Sections */}
        <div data-testid="timetable-tabs" className="flex border-b border-slate-200 dark:border-slate-800 gap-4 sm:gap-6 overflow-x-auto pb-0.5">
          <button
            onClick={() => { setActiveTab('current'); setDetailedSession(null); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'current'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Current Timetable</span>
          </button>

          <button
            onClick={() => { setActiveTab('eligibility'); setDetailedSession(null); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'eligibility'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Member Eligibility</span>
            {eligibility?.summary?.totalEligibleActive != null && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                {eligibility.summary.totalEligibleActive} Eligible
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('reviewers'); setDetailedSession(null); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'reviewers'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Reviewer Management</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              4 Approvers
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('monthly_rotation'); setDetailedSession(null); loadMonthlyRotation(); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'monthly_rotation'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <RotateCw className="h-4 w-4" />
            <span>Monthly Rotation</span>
            {monthlyRotationData?.summary?.complianceRate != null && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                {monthlyRotationData.summary.complianceRate}% Met
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('chair_groups'); setDetailedSession(null); loadChairGroups(); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'chair_groups'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Armchair className="h-4 w-4" />
            <span>Saturday Chair Teams</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
              Group A & B
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('history'); setDetailedSession(null); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Version History</span>
            {history.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {history.length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('analytics'); setDetailedSession(null); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'analytics'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Analytics & Reports</span>
          </button>

          <button
            onClick={() => { setActiveTab('special_events'); setDetailedSession(null); }}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'special_events'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <CalendarPlus className="h-4 w-4" />
            <span>Special Events</span>
            {history.filter((p) => p.periodType === 'SPECIAL_EVENT').length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                {history.filter((p) => p.periodType === 'SPECIAL_EVENT').length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Current Timetable */}
        {activeTab === 'current' && (
          <div className="flex flex-col gap-6">
            {/* 3.2 Dashboard Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Card 1: Total Scheduled Services */}
              <div
                onClick={() => {
                  const el = document.getElementById('services-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Services</span>
                  <Calendar className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {totalScheduledServices}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Scheduled Sessions</p>
                </div>
              </div>

              {/* Card 2: Total Assigned Usher Positions */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Positions</span>
                  <Users className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {totalAssignedUshers}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Assigned Ushers</p>
                </div>
              </div>

              {/* Card 3: Unique Members Assigned */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Members</span>
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {uniqueMembersAssigned}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Unique Ushers Serving</p>
                </div>
              </div>

              {/* Card 4: Eligible Active Members */}
              <div
                onClick={() => setActiveTab('eligibility')}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Eligible Pool</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                    {totalEligibleMembers}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Active & Qualified</p>
                </div>
              </div>

              {/* Card 5: Pending Reviewer Approvals */}
              <div
                onClick={() => setActiveTab('reviewers')}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Approvals</span>
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {approvals.length} / 3
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {pendingReviewerApprovals === 0 ? 'Fully Approved' : `${pendingReviewerApprovals} Pending`}
                  </p>
                </div>
              </div>

              {/* Card 6: Timetable Publication Status */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Status</span>
                  <FileCheck className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className={`text-sm font-black uppercase truncate ${
                    isPublished
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : isApproved
                      ? 'text-blue-700 dark:text-blue-400'
                      : isRejected
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {timetablePublicationStatusText}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {data?.version ? `v${data.version.versionNumber}` : 'Draft'}
                  </p>
                </div>
              </div>
            </div>

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

                {/* Service Sessions & Ushers / Detailed Service View */}
                {detailedSession ? (
                  <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-md flex flex-col gap-6 animate-in fade-in">
                    {/* Header with Back button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDetailedSession(null)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          title="Back to Weekly Timetable"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Service Detail View</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-xs text-slate-400 font-semibold">{data.period?.weekLabel || 'Current Week'}</span>
                          </div>
                          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                            {detailedSession.serviceTitle || (detailedSession as any).serviceName || 'Service Details'}
                          </h2>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyOrShareText(getServiceRosterWhatsAppText(detailedSession), `${detailedSession.serviceTitle || (detailedSession as any).serviceName || 'Service'} Roster`, 'Service roster copied!')}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
                        >
                          <Share2 className="h-4 w-4" />
                          <span>Share WhatsApp Roster</span>
                        </button>
                        <button
                          onClick={() => setDetailedSession(null)}
                          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
                        >
                          Back to Weekly Timetable
                        </button>
                      </div>
                    </div>

                    {/* Service Meta Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Date & Time */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-black uppercase text-slate-400">Date & Time</span>
                        <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                          {formatSessionDate(detailedSession.serviceDate)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatSessionTime(detailedSession.startTime, detailedSession.endTime)} WAT
                        </p>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{detailedSession.locationName || 'Main Sanctuary'}</span>
                        </p>
                      </div>

                      {/* Staffing Status */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-black uppercase text-slate-400">Staffing Status</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl font-black text-slate-900 dark:text-white">
                            {detailedSession.assignments?.length || 0}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">
                            / {detailedSession.requiredUshers} Required
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-2">
                          <div
                            className={`h-full ${detailedSession.assignments?.length >= detailedSession.requiredUshers ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, ((detailedSession.assignments?.length || 0) / (detailedSession.requiredUshers || 1)) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          {detailedSession.assignments?.length >= detailedSession.requiredUshers ? 'Fully Staffed' : 'Partial Staffing'}
                        </p>
                      </div>

                      {/* Supervising Minister */}
                      <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            Supervising Minister
                          </span>
                          <div className="flex items-center gap-2.5 mt-2">
                            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                              {detailedSession.supervisingMinister?.profilePhotoUrl ? (
                                <img src={detailedSession.supervisingMinister.profilePhotoUrl} alt="Minister" className="w-full h-full object-cover" />
                              ) : (
                                <Crown className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {detailedSession.supervisingMinister ? (detailedSession.supervisingMinister.name || `${(detailedSession.supervisingMinister as any).firstName || ''} ${(detailedSession.supervisingMinister as any).lastName || ''}`.trim()) : 'Not assigned'}
                              </p>
                              <p className="text-[10px] text-amber-600 dark:text-amber-400">Pastoral Supervision</p>
                            </div>
                          </div>
                        </div>

                        {!isPublished && (can('timetable.manage') || data.isReviewer || user?.isSuperAdmin) && (
                          <button
                            onClick={() => {
                              setMinisterModalSession(detailedSession);
                              setSelectedMinisterId(detailedSession.supervisingMinister?.id || '');
                              setMinisterReason('');
                            }}
                            className="mt-2 text-left text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
                          >
                            Change Minister →
                          </button>
                        )}
                      </div>

                      {/* Lead Position or Saturday Chair Arrangement */}
                      {detailedSession.sessionKey === 'SATURDAY_SEATS' || detailedSession.chairArrangement ? (
                        <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/40 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400">
                              Saturday Chair Team
                            </span>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                <Armchair className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-purple-950 dark:text-purple-100 truncate">
                                  {detailedSession.chairArrangement?.groupName || 'Group A (Week 1)'}
                                </p>
                                <p className="text-[10px] text-purple-700 dark:text-purple-300">Alternating Team</p>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => { setActiveTab('chair_groups'); loadChairGroups(); }}
                            className="mt-2 text-left text-[11px] font-bold text-purple-800 dark:text-purple-300 hover:underline cursor-pointer"
                          >
                            Manage Teams →
                          </button>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
                              Lead Usher
                            </span>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                <Star className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-blue-950 dark:text-blue-100 truncate">
                                  {detailedSession.leadUsher?.name || detailedSession.assignments?.[0]?.fullName || 'Lead Designated'}
                                </p>
                                <p className="text-[10px] text-blue-700 dark:text-blue-300">Floor Coordinator</p>
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-2">
                            Slot 1 Lead Designation
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Validation & Conflict Check Banner */}
                    <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span>Eligibility Verified: All assigned ushers satisfy the 5-point active criteria.</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
                        <ShieldCheck className="h-4 w-4 text-blue-500" />
                        <span>No duplicate assignments or scheduling conflicts detected for this service.</span>
                      </div>
                    </div>

                    {/* Ushers Table */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          Assigned Ushering Team ({detailedSession.assignments?.length || 0} Ushers)
                        </h4>
                        {!isPublished && (can('timetable.manage') || data.isReviewer || user?.isSuperAdmin) && (
                          <button
                            onClick={() => setShowSwapModal(true)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
                          >
                            Swap Ushers
                          </button>
                        )}
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="p-3">Position / Duty</th>
                              <th className="p-3">Member</th>
                              <th className="p-3">Member Code</th>
                              <th className="p-3">Eligibility</th>
                              <th className="p-3">Status</th>
                              {!isPublished && (can('timetable.manage') || data.isReviewer || user?.isSuperAdmin) && (
                                <th className="p-3 text-right">Actions</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {detailedSession.assignments?.map((a) => {
                              const usherName = a.fullName || ((a as any).member ? `${(a as any).member.firstName || ''} ${(a as any).member.lastName || ''}`.trim() : 'Usher');
                              const usherCode = a.memberCode || (a as any).member?.memberCode || '';
                              const usherPhoto = a.profilePhotoUrl || (a as any).member?.profilePhotoUrl || null;

                              return (
                                <tr key={a.id || a.memberId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                  <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px]">
                                      {a.position || a.role || 'General Usher'}
                                    </span>
                                  </td>
                                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center font-bold text-[11px]">
                                        {usherPhoto ? <img src={usherPhoto} alt={usherName} className="w-full h-full object-cover" /> : usherName?.charAt(0)}
                                      </div>
                                      <span>{usherName}</span>
                                    </div>
                                  </td>
                                  <td className="p-3 text-slate-500 font-mono text-[11px]">{usherCode}</td>
                                  <td className="p-3">
                                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      <span>Verified Active</span>
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-500 font-medium">Scheduled</td>
                                  {!isPublished && (can('timetable.manage') || data.isReviewer || user?.isSuperAdmin) && (
                                    <td className="p-3 text-right">
                                      <div className="flex items-center justify-end gap-1">
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
                                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                                        >
                                          Position
                                        </button>
                                        <button
                                          onClick={() => {
                                            setAdjustSession(detailedSession);
                                            setAdjustOldMemberId(a.memberId);
                                            setAdjustNewMemberId('');
                                            setAdjustReason('');
                                          }}
                                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                                        >
                                          Replace
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div id="services-section" className="flex flex-col gap-4">
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
                                <button
                                  onClick={() => setDetailedSession(session)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                                  title="View full service details, requirements, validation, and history"
                                >
                                  <Eye className="h-3.5 w-3.5 text-blue-600" />
                                  <span>View Details</span>
                                </button>
                                <button
                                  onClick={() => copyOrShareText(getServiceRosterWhatsAppText(session), `${session.serviceTitle || (session as any).serviceName || 'Service'} Roster`, 'Service roster copied! Ready to paste into WhatsApp.')}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                                  title="Copy or share this service roster for WhatsApp"
                                >
                                  <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Share</span>
                                </button>
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold border border-emerald-200 dark:border-emerald-800">
                                  Assigned: {session.assignments?.length || 0} / {session.requiredUshers}
                                </span>
                              </div>
                            </div>

                          {/* Supervising Minister & Lead Usher Row */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                  <span>Change</span>
                                </button>
                              )}
                            </div>

                            {/* Lead Usher */}
                            {session.leadUsher ? (
                              <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                                    {session.leadUsher.profilePhotoUrl ? (
                                      <img src={session.leadUsher.profilePhotoUrl} alt="Lead" className="w-full h-full object-cover" />
                                    ) : (
                                      <Star className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
                                      Lead Usher
                                    </span>
                                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                      {session.leadUsher.name}
                                    </p>
                                    <p className="text-[10px] text-slate-400">{session.leadUsher.position || 'Service Coordinator'}</p>
                                  </div>
                                </div>

                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                                  Designated Lead
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                                <span className="text-[11px]">General Ushering Team</span>
                              </div>
                            )}
                          </div>

                          {/* Saturday Chair Arrangement Block */}
                          {(session.sessionKey === 'SATURDAY_SEATS' || session.chairArrangement) && (
                            <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                  <Armchair className="h-4 w-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-purple-950 dark:text-purple-100">
                                      Saturday Chair Arrangement: {session.chairArrangement?.groupName || 'Group A (Alternating Team)'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-200 text-purple-800 uppercase">
                                      Responsible Team
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mt-0.5">
                                    {session.chairArrangement?.note || 'Alternating seat arrangement group responsible for preparing sanctuary chairs.'}
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={() => { setActiveTab('chair_groups'); loadChairGroups(); }}
                                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors shrink-0 cursor-pointer"
                              >
                                Manage Chair Teams →
                              </button>
                            </div>
                          )}

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
                )}
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

        {/* Tab 3: Designated Reviewers & Required Approvers */}
        {activeTab === 'reviewers' && (
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Official TFHC Timetable Reviewers & Required Approvers
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Every generated weekly ushering timetable requires independent inspection and approval from all 3 designated reviewers and the Platform Owner before official publication.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNotifyReviewers}
                  disabled={sendingReviewReminders || !data?.version?.id}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors shrink-0 shadow-xs cursor-pointer"
                  title="Send email and in-app review notifications to all 4 required approvers"
                >
                  <Bell className={`h-3.5 w-3.5 ${sendingReviewReminders ? 'animate-bounce' : ''}`} />
                  <span>{sendingReviewReminders ? 'Sending Alerts...' : 'Notify Approvers / Send Reminders'}</span>
                </button>
                <button
                  onClick={handleSyncOfficial}
                  disabled={syncingOfficial}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingOfficial ? 'animate-spin' : ''}`} />
                  <span>Re-sync Reviewers</span>
                </button>
              </div>
            </div>

            {/* 4 Required Approver Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(data?.officialReviewersStatus?.allApprovers || [
                { name: 'Aanu Oyeniran', officialEmail: 'aanuoyeniran@gmail.com', orderIndex: 1, matched: false, isDesignatedActiveReviewer: false, notes: 'Designated Official Reviewer' },
                { name: 'Daniel Oguamanam', officialEmail: 'danoguamanam@gmail.com', orderIndex: 2, matched: true, isDesignatedActiveReviewer: true, notes: 'Designated Official Reviewer' },
                { name: 'Paseda Oluwafemi', officialEmail: 'folashadeogunlade86@gmail.com', orderIndex: 3, matched: false, isDesignatedActiveReviewer: false, notes: 'Designated Official Reviewer' },
                { name: 'Glory Eseosa', officialEmail: 'engreseglory@gmail.com', orderIndex: 4, matched: true, isDesignatedActiveReviewer: true, notes: 'Platform Owner / Super Admin Approver' },
              ]).map((r) => {
                const userReviews = data?.reviews || [];
                const reviewerDecision = userReviews.find((rev) => rev.reviewer?.email?.toLowerCase() === r.officialEmail?.toLowerCase() || rev.reviewerUserId === r.userId);

                return (
                  <div
                    key={r.officialEmail}
                    className={`p-5 rounded-2xl border flex flex-col justify-between gap-3 ${
                      reviewerDecision?.decision === 'APPROVE'
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : reviewerDecision?.decision === 'REJECT'
                        ? 'border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20'
                        : r.isDesignatedActiveReviewer
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900'
                        : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                            reviewerDecision?.decision === 'APPROVE'
                              ? 'bg-emerald-600 text-white'
                              : r.orderIndex === 4
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {r.orderIndex}
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          r.orderIndex === 4
                            ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {r.orderIndex === 4 ? 'Platform Owner' : 'Reviewer'}
                        </span>
                      </div>

                      <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {r.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                        {r.officialEmail}
                      </p>

                      {/* Current Version Review Decision */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                          Current Decision
                        </span>
                        {reviewerDecision?.decision === 'APPROVE' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Approved Version {data?.version?.versionNumber}</span>
                          </span>
                        ) : reviewerDecision?.decision === 'REJECT' ? (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold text-xs">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Changes Requested</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-xs">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Awaiting Decision</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        {r.notes || (r.isDesignatedActiveReviewer ? 'Verified active reviewer account.' : 'Awaiting mobile app registration.')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="font-bold text-slate-900 dark:text-white">Publication Rule:</strong> A timetable is strictly kept in pending review and hidden from ordinary members until all 4 required approvers (Aanu Oyeniran, Daniel Oguamanam, Paseda Oluwafemi, and the Platform Owner) have formally recorded their approval on the final version. Any subsequent edit or substitution resets previous approvals and dispatches fresh review alerts.
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

        {/* Tab 5: Analytics & Reports */}
        {activeTab === 'analytics' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-6 w-6 text-red-600" />
                  Timetable Analytics & Management Reports
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                  In-depth attendance correlation, assignment fairness distribution, service staffing coverage, and management PDF & Excel exports.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/admin/timetable/analytics"
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors shadow-sm"
                >
                  <span>Open Full Analytics Suite</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Quick KPI Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scheduled Services</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalScheduledServices}</p>
                <p className="text-[10px] text-slate-400 mt-1">Regular & special sessions</p>
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assigned Positions</p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{totalAssignedUshers}</p>
                <p className="text-[10px] text-slate-400 mt-1">Assigned usher shifts</p>
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Serving Ushers</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{uniqueMembersAssigned}</p>
                <p className="text-[10px] text-slate-400 mt-1">Unique members scheduled</p>
              </div>
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Eligible Pool</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalEligibleMembers}</p>
                <p className="text-[10px] text-slate-400 mt-1">5-point active criteria</p>
              </div>
            </div>

            {/* Export Shortcuts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Executive PDF Report</h4>
                    <p className="text-[11px] text-slate-500">Official management report with executive KPIs and service breakdowns.</p>
                  </div>
                </div>
                <Link
                  href="/admin/timetable/analytics"
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                >
                  Export PDF
                </Link>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Excel Workbook Export</h4>
                    <p className="text-[11px] text-slate-500">Multi-tab structured workbook with assignments, attendance, and ministers.</p>
                  </div>
                </div>
                <Link
                  href="/admin/timetable/analytics"
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  Export Excel
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Special Events */}
        {activeTab === 'special_events' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarPlus className="h-6 w-6 text-purple-600" />
                  Special-Event Timetable Management
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                  Create and manage dedicated ushering rosters for special services, vigils, conferences, and conventions. Independent of regular weekly schedules.
                </p>
              </div>

              <button
                onClick={() => setShowSpecialModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer shrink-0"
              >
                <CalendarPlus className="h-4 w-4" />
                <span>+ Create Special Event Timetable</span>
              </button>
            </div>

            {/* Special Event List */}
            <div className="grid grid-cols-1 gap-4">
              {history.filter((p) => p.periodType === 'SPECIAL_EVENT').length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
                  <CalendarPlus className="h-12 w-12 text-slate-400 mb-3" />
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                    No Special Events Created Yet
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mt-1 mb-4">
                    Special events run as independent rosters without overwriting regular Tuesday, Thursday, Saturday or Sunday services.
                  </p>
                  <button
                    onClick={() => setShowSpecialModal(true)}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
                  >
                    Create First Special Event
                  </button>
                </div>
              ) : (
                history
                  .filter((p) => p.periodType === 'SPECIAL_EVENT')
                  .map((period) => (
                    <div
                      key={period.id}
                      className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                            {period.label || period.weekLabel || 'Special Event'}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                            period.status === 'PUBLISHED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : period.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {period.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Event Date: {period.weekStart ? new Date(period.weekStart).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                          {' • '}{period.versions?.length || 1} version(s) recorded
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const latestVersion = period.versions?.[0];
                            if (latestVersion) {
                              setLoading(true);
                              fetchApi<any>('/timetable/admin/version/' + latestVersion.id)
                                .then((ver) => {
                                  setData({
                                    period: period,
                                    version: ver,
                                    sessions: ver.sessions || [],
                                    reviewers: data?.reviewers || [],
                                    reviews: ver.reviews || [],
                                    isReviewer: data?.isReviewer || false,
                                    canPublish: can('timetable.publish'),
                                  });
                                  setActiveTab('current');
                                })
                                .finally(() => setLoading(false));
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                        >
                          View Timetable Roster
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* Tab 7: Monthly Member Rotation & Fairness */}
        {activeTab === 'monthly_rotation' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <RotateCw className="h-6 w-6 text-red-600" />
                  Monthly Member Rotation (Target: ≥ 2 Shifts/Month)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Tracks individual assignment counts across the current calendar month ({monthlyRotationData?.monthName || 'Current Month'} {monthlyRotationData?.year || 2026}). Prioritizes members with fewer than 2 assignments to ensure equitable distribution across the department.
                </p>
              </div>

              <button
                onClick={loadMonthlyRotation}
                disabled={loadingMonthly}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingMonthly ? 'animate-spin' : ''}`} />
                <span>Refresh Rotation</span>
              </button>
            </div>

            {/* Rotation KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Eligible Pool</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {monthlyRotationData?.summary?.totalEligible ?? 0}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Active serving ushers</p>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 shadow-xs">
                <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Target Met (≥ 2)</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {monthlyRotationData?.summary?.targetMetCount ?? 0}
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">≥ 2 assignments this month</p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 shadow-xs">
                <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">1 More Needed</p>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {monthlyRotationData?.summary?.oneNeededCount ?? 0}
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">Currently has 1 assignment</p>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 shadow-xs">
                <p className="text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider">Not Yet Scheduled</p>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                  {monthlyRotationData?.summary?.notScheduledCount ?? 0}
                </p>
                <p className="text-[10px] text-rose-700 dark:text-rose-400 mt-0.5">0 assignments this month</p>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 shadow-xs col-span-2 sm:col-span-1">
                <p className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">Compliance Rate</p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                  {monthlyRotationData?.summary?.complianceRate ?? 0}%
                </p>
                <p className="text-[10px] text-indigo-700 dark:text-indigo-400 mt-0.5">Department target coverage</p>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'TARGET_MET', 'ONE_MORE_NEEDED', 'NOT_YET_SCHEDULED'] as const).map((filterKey) => {
                  const labels = {
                    ALL: `All (${monthlyRotationData?.members?.length || 0})`,
                    TARGET_MET: `Target Met (${monthlyRotationData?.summary?.targetMetCount || 0})`,
                    ONE_MORE_NEEDED: `1 More Needed (${monthlyRotationData?.summary?.oneNeededCount || 0})`,
                    NOT_YET_SCHEDULED: `Not Scheduled (${monthlyRotationData?.summary?.notScheduledCount || 0})`,
                  };
                  const isSel = monthlyFilter === filterKey;
                  return (
                    <button
                      key={filterKey}
                      onClick={() => setMonthlyFilter(filterKey)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isSel
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {labels[filterKey]}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by name or code..."
                  value={monthlySearch}
                  onChange={(e) => setMonthlySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Members Roster Table */}
            <div className="overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3.5">Member</th>
                      <th className="p-3.5">Member Code</th>
                      <th className="p-3.5 text-center">Monthly Assignments</th>
                      <th className="p-3.5">Rotation Target Status</th>
                      <th className="p-3.5">Scheduled Services This Month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingMonthly ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400 mb-2" />
                          <span>Loading monthly rotation data...</span>
                        </td>
                      </tr>
                    ) : (monthlyRotationData?.members || [])
                      .filter((m: any) => {
                        if (monthlyFilter === 'TARGET_MET' && m.status !== 'TARGET_MET') return false;
                        if (monthlyFilter === 'ONE_MORE_NEEDED' && m.status !== 'ONE_MORE_NEEDED') return false;
                        if (monthlyFilter === 'NOT_YET_SCHEDULED' && m.status !== 'NOT_YET_SCHEDULED') return false;
                        if (monthlySearch) {
                          const q = monthlySearch.toLowerCase();
                          const mName = (m.fullName || m.name || `${m.firstName || ''} ${m.lastName || ''}`).toLowerCase();
                          return mName.includes(q) || (m.memberCode && m.memberCode.toLowerCase().includes(q));
                        }
                        return true;
                      })
                      .map((m: any) => {
                        const isMet = m.status === 'TARGET_MET';
                        const isOne = m.status === 'ONE_MORE_NEEDED';
                        const memberName = m.fullName || m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Member';
                        const initial = memberName.charAt(0) || 'M';
                        const count = m.scheduledCount ?? m.assignmentCount ?? 0;
                        return (
                          <tr key={m.memberId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 flex items-center justify-center font-bold text-xs">
                                  {m.profilePhotoUrl ? (
                                    <img src={m.profilePhotoUrl} alt={memberName} className="w-full h-full object-cover" />
                                  ) : (
                                    <span>{initial}</span>
                                  )}
                                </div>
                                <span>{memberName}</span>
                              </div>
                            </td>
                            <td className="p-3.5 font-mono text-[11px] text-slate-500">{m.memberCode || 'N/A'}</td>
                            <td className="p-3.5 text-center">
                              <span className={`inline-block px-3 py-1 rounded-xl text-xs font-black ${
                                isMet
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : isOne
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}>
                                {count} / 2
                              </span>
                            </td>
                            <td className="p-3.5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isMet
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : isOne
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isMet ? 'bg-emerald-500' : isOne ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                {m.statusLabel || m.status}
                              </span>
                            </td>
                            <td className="p-3.5">
                              {m.assignments?.length === 0 ? (
                                <span className="text-slate-400 text-[11px] italic">No shifts assigned yet this month</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {m.assignments.map((a: any, aIdx: number) => (
                                    <span
                                      key={a.id || aIdx}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                      title={a.serviceName || a.serviceTitle || 'Service'}
                                    >
                                      <span>{a.serviceName || a.serviceTitle || 'Service'}</span>
                                      <span className="text-[10px] text-slate-400">({a.serviceDate ? new Date(a.serviceDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''})</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 8: Saturday Chair Arrangement (Group A and Group B) */}
        {activeTab === 'chair_groups' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Armchair className="h-6 w-6 text-purple-600" />
                  Saturday Chair Arrangement (Two Alternating Teams)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Dedicated Saturday seat arrangement teams that alternate weekly (Group A on Week 1, Group B on Week 2). Managed separately from ordinary ushering positions.
                </p>
              </div>

              <button
                onClick={loadChairGroups}
                disabled={loadingChair}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingChair ? 'animate-spin' : ''}`} />
                <span>Refresh Teams</span>
              </button>
            </div>

            {/* Current Turn Notification Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/15 via-indigo-500/10 to-transparent border border-purple-300 dark:border-purple-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shrink-0">
                  <Armchair className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    Active Rotation Schedule
                  </span>
                  <h3 className="text-base font-extrabold text-purple-950 dark:text-purple-100">
                    This Week on Duty: {chairGroupsData?.activeGroupName || 'Group A'}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Teams alternate automatically each Saturday. Group A: {chairGroupsData?.groupA?.length || 0} members • Group B: {chairGroupsData?.groupB?.length || 0} members.
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-purple-600 text-white uppercase tracking-wider shrink-0">
                Alternating Weekly
              </span>
            </div>

            {/* Side-by-side Group A and Group B Management Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Group A Card */}
              <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-black text-xs">
                      A
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Group A Team ({chairGroupsData?.groupA?.length || 0} Members)
                    </h3>
                  </div>
                  {chairGroupsData?.activeGroup === 'GROUP_A' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                      On Duty This Saturday
                    </span>
                  )}
                </div>

                {/* Add Member Dropdown for Group A */}
                <div className="flex gap-2">
                  <select
                    value={newMemberA}
                    onChange={(e) => setNewMemberA(e.target.value)}
                    className="flex-1 p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">Select member to add to Group A...</option>
                    {(eligibility?.activeMembers || [])
                      .filter((m) => !(chairGroupsData?.groupA || []).some((gm: any) => gm.id === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.firstName} {m.lastName} ({m.memberCode})
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!newMemberA) return;
                      const updatedA = [...(chairGroupsData?.groupA || []).map((m: any) => m.id), newMemberA];
                      const currentB = (chairGroupsData?.groupB || []).map((m: any) => m.id);
                      handleSaveChairGroups(updatedA, currentB);
                      setNewMemberA('');
                    }}
                    disabled={!newMemberA || savingChair}
                    className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 text-white font-bold text-xs shrink-0 cursor-pointer"
                  >
                    + Add to Team
                  </button>
                </div>

                {/* Member Roster for Group A */}
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {(chairGroupsData?.groupA || []).map((m: any) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center font-bold text-[11px] shrink-0">
                          {m.profilePhotoUrl ? <img src={m.profilePhotoUrl} alt="" className="w-full h-full object-cover" /> : (m.firstName || m.name || m.fullName || 'M').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate">{m.fullName || `${m.firstName} ${m.lastName}`}</p>
                          <p className="text-[10px] text-slate-400">{m.memberCode}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const updatedA = (chairGroupsData?.groupA || []).filter((gm: any) => gm.id !== m.id).map((gm: any) => gm.id);
                          const currentB = (chairGroupsData?.groupB || []).map((gm: any) => gm.id);
                          handleSaveChairGroups(updatedA, currentB);
                        }}
                        disabled={savingChair}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        title="Remove from Group A"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Group B Card */}
              <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-black text-xs">
                      B
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Group B Team ({chairGroupsData?.groupB?.length || 0} Members)
                    </h3>
                  </div>
                  {chairGroupsData?.activeGroup === 'GROUP_B' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                      On Duty This Saturday
                    </span>
                  )}
                </div>

                {/* Add Member Dropdown for Group B */}
                <div className="flex gap-2">
                  <select
                    value={newMemberB}
                    onChange={(e) => setNewMemberB(e.target.value)}
                    className="flex-1 p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">Select member to add to Group B...</option>
                    {(eligibility?.activeMembers || [])
                      .filter((m) => !(chairGroupsData?.groupB || []).some((gm: any) => gm.id === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.firstName} {m.lastName} ({m.memberCode})
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!newMemberB) return;
                      const currentA = (chairGroupsData?.groupA || []).map((m: any) => m.id);
                      const updatedB = [...(chairGroupsData?.groupB || []).map((m: any) => m.id), newMemberB];
                      handleSaveChairGroups(currentA, updatedB);
                      setNewMemberB('');
                    }}
                    disabled={!newMemberB || savingChair}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold text-xs shrink-0 cursor-pointer"
                  >
                    + Add to Team
                  </button>
                </div>

                {/* Member Roster for Group B */}
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {(chairGroupsData?.groupB || []).map((m: any) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center font-bold text-[11px] shrink-0">
                          {m.profilePhotoUrl ? <img src={m.profilePhotoUrl} alt="" className="w-full h-full object-cover" /> : (m.firstName || m.name || m.fullName || 'M').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate">{m.fullName || `${m.firstName} ${m.lastName}`}</p>
                          <p className="text-[10px] text-slate-400">{m.memberCode}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const currentA = (chairGroupsData?.groupA || []).map((gm: any) => gm.id);
                          const updatedB = (chairGroupsData?.groupB || []).filter((gm: any) => gm.id !== m.id).map((gm: any) => gm.id);
                          handleSaveChairGroups(currentA, updatedB);
                        }}
                        disabled={savingChair}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        title="Remove from Group B"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
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
