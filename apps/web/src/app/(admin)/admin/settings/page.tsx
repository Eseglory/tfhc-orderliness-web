'use client';

import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  SunMoon,
  Trophy,
  Award,
  Save,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { ChangePasswordCard } from '../../../../components/ChangePasswordCard';
import { ThemeSwitcher } from '../../../../components/ThemeSwitcher';
import { fetchApi } from '../../../../lib/api';

const POLICY_LABELS: Record<string, { label: string; description: string; step?: string }> = {
  earlyPoints: { label: 'Early Arrival Points', description: 'Points awarded when checking in before scheduled start time' },
  onTimePoints: { label: 'On-Time Points', description: 'Points awarded when checking in on time or within grace period' },
  gracePeriodPoints: { label: 'Grace-Period Points', description: 'Points awarded for arrivals within grace window' },
  latePoints: { label: 'Late Arrival Points', description: 'Points awarded (or reduced) for late arrivals' },
  absentPoints: { label: 'Absent Points', description: 'Points awarded or penalty for unexcused absence' },
  excusedPoints: { label: 'Excused Absence Points', description: 'Points assigned when excuse request is approved' },
  attendanceWeight: { label: 'Attendance Weight (0.0 – 1.0)', description: 'Multiplier for attendance rate in leaderboard rank', step: '0.05' },
  punctualityWeight: { label: 'Punctuality Weight (0.0 – 1.0)', description: 'Multiplier for punctuality rate in leaderboard rank', step: '0.05' },
  followUpAbsences: { label: 'Consecutive Absences For Follow-Up', description: 'Triggers welfare & pastoral care follow-up alert' },
  warningAbsences: { label: 'Total Absences For Warning', description: 'Flags member profile for administrative attention' },
  reviewAttendanceBelow: { label: 'Attendance Review Threshold (%)', description: 'Percentage below which member is flagged for review' },
  minimumMeetings: { label: 'Minimum Meetings Before Review', description: 'Number of recorded events required before scoring evaluation' },
  rewardAttendance: { label: 'Recognition Attendance Threshold (%)', description: 'Minimum attendance percentage required for awards' },
  rewardPunctuality: { label: 'Recognition Punctuality Threshold (%)', description: 'Minimum punctuality percentage required for awards' },
};

export default function SettingsPage() {
  const [recognition, setRecognition] = useState<any>(null);
  const [policy, setPolicy] = useState<Record<string, number> | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingRecognition, setLoadingRecognition] = useState(false);

  useEffect(() => {
    fetchApi('/scoring/recognition')
      .then(setRecognition)
      .catch(() => {});
    fetchApi<Record<string, number>>('/reports/settings')
      .then(setPolicy)
      .catch((e: any) => setMessage({ type: 'error', text: e.message || 'Failed to load policy settings' }));
  }, []);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await fetchApi<Record<string, number>>('/reports/settings', {
        method: 'PUT',
        body: JSON.stringify(policy),
      });
      setPolicy(updated);
      setMessage({ type: 'success', text: 'System scoring and follow-up policies updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const refreshRecognition = async () => {
    setLoadingRecognition(true);
    try {
      const data = await fetchApi('/scoring/recognition');
      setRecognition(data);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to refresh recognition eligibility' });
    } finally {
      setLoadingRecognition(false);
    }
  };

  return (
    <AdminLayoutShell>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            SYSTEM ADMINISTRATION
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
            Settings & Policies
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Configure visual appearance, administrative security, scoring rules, and automated pastoral follow-up thresholds.
          </p>
        </div>

        {/* Feedback Alert */}
        {message && (
          <div
            className={`flex items-center gap-3 p-4 rounded-2xl border text-xs sm:text-sm font-medium animate-in fade-in duration-200 ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200/80 dark:border-emerald-800/80'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-200/80 dark:border-rose-800/80'
            }`}
            role="status"
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Section 1: Appearance & Theme Preferences */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <SunMoon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Appearance & Visual Theme</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose your default interface display theme (Light Mode is the default experience).
              </p>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">Theme Selection</p>
            <ThemeSwitcher variant="segmented" className="max-w-md" />
          </div>
        </section>

        {/* Section 2: Account & Security */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Admin Account Security</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Update your administrative password and manage credentials.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <ChangePasswordCard variant="light" />
          </div>
        </section>

        {/* Section 3: Scoring & Follow-Up Policies Form */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Scoring & Follow-Up Rules</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Point changes apply to new attendance entries. Weights and thresholds apply automatically when recalculated.
              </p>
            </div>
          </div>

          {policy ? (
            <form onSubmit={handleSavePolicy} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {Object.entries(POLICY_LABELS).map(([key, meta]) => {
                  const val = policy[key] ?? 0;
                  return (
                    <div
                      key={key}
                      className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1.5"
                    >
                      <label htmlFor={key} className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                        {meta.label}
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        {meta.description}
                      </p>
                      <input
                        id={key}
                        type="number"
                        step={meta.step || '1'}
                        required
                        value={val}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            [key]: Number(e.target.value),
                          })
                        }
                        className="mt-1 block w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all shadow-xs"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-sm shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving Changes...' : 'Save Policy Settings'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">Loading policy configurations...</div>
          )}
        </section>

        {/* Section 4: Members Eligible for Recognition */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Members Eligible For Recognition</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Congregants meeting or exceeding the recognition attendance and punctuality criteria.
                </p>
              </div>
            </div>

            <button
              onClick={refreshRecognition}
              disabled={loadingRecognition}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRecognition ? 'animate-spin' : ''}`} />
              <span>Refresh Eligibility</span>
            </button>
          </div>

          <div className="pt-2">
            {recognition?.members?.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recognition.members.map((m: any) => (
                  <div
                    key={m.memberId}
                    className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {m.attendanceRate}% Attendance • {m.punctualityRate}% Punctuality
                      </p>
                    </div>
                    <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                No members currently meet the recognition criteria for this evaluation period.
              </p>
            )}
          </div>
        </section>
      </div>
    </AdminLayoutShell>
  );
}
