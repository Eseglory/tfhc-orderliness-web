'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Smile,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Modal } from './ui';
import { fetchApi } from '../lib/api';

export interface HeadcountData {
  id?: string;
  meetingId?: string;
  totalHeadcount: number;
  male?: number | null;
  maleCount?: number | null;
  female?: number | null;
  femaleCount?: number | null;
  children?: number | null;
  childrenCount?: number | null;
  notes?: string | null;
  recordedBy?: { id?: string; name?: string; email?: string; member?: { firstName?: string; lastName?: string } } | null;
  recordedAt?: string;
  lastUpdatedBy?: { id?: string; name?: string; email?: string; member?: { firstName?: string; lastName?: string } } | null;
  updatedAt?: string;
}

interface HeadcountModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting?: {
    id: string;
    title: string;
    startTime: string;
    category?: { name?: string };
    eventType?: { name?: string };
  } | null;
  meetingId?: string;
  meetingTitle?: string;
  meetingDate?: string;
  initialHeadcount?: HeadcountData | null;
  onSaved?: (saved: any) => void;
  onSuccess?: () => void;
}

export function HeadcountModal({
  isOpen,
  onClose,
  meeting,
  meetingId,
  meetingTitle,
  meetingDate,
  initialHeadcount,
  onSaved,
  onSuccess,
}: HeadcountModalProps) {
  const targetId = meeting?.id || meetingId || '';
  const targetTitle = meeting?.title || meetingTitle || 'Church Service';
  const targetDate = meeting?.startTime || meetingDate || '';

  const [totalHeadcount, setTotalHeadcount] = useState<string>('');
  const [maleCount, setMaleCount] = useState<string>('');
  const [femaleCount, setFemaleCount] = useState<string>('');
  const [childrenCount, setChildrenCount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialHeadcount) {
      const m = initialHeadcount.maleCount ?? initialHeadcount.male;
      const f = initialHeadcount.femaleCount ?? initialHeadcount.female;
      const c = initialHeadcount.childrenCount ?? initialHeadcount.children;

      setTotalHeadcount(String(initialHeadcount.totalHeadcount ?? ''));
      setMaleCount(m !== null && m !== undefined ? String(m) : '');
      setFemaleCount(f !== null && f !== undefined ? String(f) : '');
      setChildrenCount(c !== null && c !== undefined ? String(c) : '');
      setNotes(initialHeadcount.notes ?? '');
    } else {
      setTotalHeadcount('');
      setMaleCount('');
      setFemaleCount('');
      setChildrenCount('');
      setNotes('');
    }
    setError('');
  }, [initialHeadcount, isOpen]);

  const numTotal = parseInt(totalHeadcount, 10) || 0;
  const numMale = parseInt(maleCount, 10) || 0;
  const numFemale = parseInt(femaleCount, 10) || 0;
  const numChildren = parseInt(childrenCount, 10) || 0;

  const demographicSum = numMale + numFemale + numChildren;
  const isDemographicSumExceeded = demographicSum > numTotal && numTotal > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    if (totalHeadcount.trim() === '' || isNaN(numTotal) || numTotal < 0) {
      setError('Please enter a valid total headcount number');
      return;
    }
    if (isDemographicSumExceeded) {
      setError(`Sum of male (${numMale}), female (${numFemale}), and children (${numChildren}) (${demographicSum}) cannot exceed total headcount (${numTotal})`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        meetingId: targetId,
        totalHeadcount: numTotal,
        maleCount: maleCount.trim() !== '' ? numMale : null,
        femaleCount: femaleCount.trim() !== '' ? numFemale : null,
        childrenCount: childrenCount.trim() !== '' ? numChildren : null,
        notes: notes.trim() || null,
      };

      const res = await fetchApi<any>('/attendance/headcount', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (onSaved) onSaved(res);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record official headcount.');
    } finally {
      setSaving(false);
    }
  };

  const recordedByName = useMemo(() => {
    if (!initialHeadcount?.recordedBy) return null;
    const m = initialHeadcount.recordedBy.member;
    return m ? `${m.firstName} ${m.lastName}` : initialHeadcount.recordedBy.email;
  }, [initialHeadcount]);

  const lastUpdatedByName = useMemo(() => {
    if (!initialHeadcount?.lastUpdatedBy) return null;
    const m = initialHeadcount.lastUpdatedBy.member;
    return m ? `${m.firstName} ${m.lastName}` : initialHeadcount.lastUpdatedBy.email;
  }, [initialHeadcount]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialHeadcount ? 'Update Official Service Headcount' : 'Record Official Service Headcount'}
      description={
        targetDate
          ? `${targetTitle} • ${new Date(targetDate).toLocaleDateString(undefined, {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}`
          : targetTitle || 'Record official physical headcount'
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm animate-shake">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Informational Banner */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs sm:text-sm">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-blue-200">Official Physical Attendance:</strong> Enter the physical headcount taken during service. This includes everyone physically in attendance.
          </div>
        </div>

        {/* Total Physical Headcount Primary Input */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border-2 border-emerald-500/30 shadow-lg shadow-emerald-500/5">
          <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span className="text-base">Total Official Headcount</span>
              <span className="text-rose-400 font-bold">*</span>
            </span>
            <span className="text-xs font-normal text-emerald-400/80 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Primary Metric
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              required
              autoFocus
              placeholder="e.g. 347"
              value={totalHeadcount}
              onChange={(e) => setTotalHeadcount(e.target.value)}
              className="w-full bg-slate-950 border-2 border-emerald-500/50 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/20 text-slate-100 font-bold text-3xl sm:text-4xl px-4 py-3 rounded-xl transition placeholder:text-slate-600 text-center sm:text-left"
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            The total physical headcount is the authoritative number representing everyone physically present in the auditorium.
          </p>
        </div>

        {/* Demographic Breakdown Section (Optional) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Demographic Breakdown (Optional)
            </h4>
            {numTotal > 0 && demographicSum > 0 && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                  isDemographicSumExceeded
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : demographicSum === numTotal
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                Sum: {demographicSum} / {numTotal} {demographicSum === numTotal && '✓ Exact'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Male */}
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                Male Attendees
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={maleCount}
                onChange={(e) => setMaleCount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 text-slate-100 text-lg font-semibold px-3 py-2 rounded-lg transition text-center sm:text-left"
              />
            </div>

            {/* Female */}
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-pink-400 inline-block" />
                Female Attendees
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={femaleCount}
                onChange={(e) => setFemaleCount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-pink-400 focus:ring-2 focus:ring-pink-500/20 text-slate-100 text-lg font-semibold px-3 py-2 rounded-lg transition text-center sm:text-left"
              />
            </div>

            {/* Children */}
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-amber-400" />
                Children / Minors
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={childrenCount}
                onChange={(e) => setChildrenCount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 text-slate-100 text-lg font-semibold px-3 py-2 rounded-lg transition text-center sm:text-left"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Headcount Notes / Ledger Remarks
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Gallery count, overflow section notes, or weather remarks..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 text-slate-100 text-sm px-3.5 py-2.5 rounded-xl transition placeholder:text-slate-600 resize-none"
          />
        </div>

        {/* Audit History Information (when updating) */}
        {initialHeadcount && (
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/60 text-xs text-slate-400 space-y-1">
            {recordedByName && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  Originally recorded by <strong className="text-slate-300">{recordedByName}</strong>
                  {initialHeadcount.recordedAt && ` on ${new Date(initialHeadcount.recordedAt).toLocaleString()}`}
                </span>
              </div>
            )}
            {lastUpdatedByName && (
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  Last modified by <strong className="text-slate-300">{lastUpdatedByName}</strong>
                  {initialHeadcount.updatedAt && ` on ${new Date(initialHeadcount.updatedAt).toLocaleString()}`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 font-medium text-sm transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || isDemographicSumExceeded}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving Headcount…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {initialHeadcount ? 'Update Headcount' : 'Save Official Headcount'}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
