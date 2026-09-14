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
  Calendar,
  ExternalLink,
  Check,
  X,
  Radio,
  Sparkles,
  Link as LinkIcon,
  Unlink,
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
  followUpAbsences: { label: 'Consecutive Absences For Follow-Up', description: 'Triggers member follow-up alert' },
  warningAbsences: { label: 'Total Absences For Warning', description: 'Flags member profile for administrative attention' },
  reviewAttendanceBelow: { label: 'Attendance Review Threshold (%)', description: 'Percentage below which member is flagged for review' },
  minimumMeetings: { label: 'Minimum Meetings Before Review', description: 'Number of recorded events required before scoring evaluation' },
  rewardAttendance: { label: 'Recognition Attendance Threshold (%)', description: 'Minimum attendance percentage required for awards' },
  rewardPunctuality: { label: 'Recognition Punctuality Threshold (%)', description: 'Minimum punctuality percentage required for awards' },
};

interface GoogleIntegrationStatus {
  connected: boolean;
  id?: string;
  googleEmail?: string;
  calendarId?: string;
  calendarSummary?: string;
  syncStatus?: 'NOT_CONNECTED' | 'SYNCED' | 'SYNCING' | 'PENDING' | 'FAILED';
  lastSyncedAt?: string;
  lastError?: string | null;
  autoSyncMeetings?: boolean;
  autoSyncEvents?: boolean;
  autoSyncAppointments?: boolean;
  syncedEventsCount?: number;
}

export default function SettingsPage() {
  const [recognition, setRecognition] = useState<any>(null);
  const [policy, setPolicy] = useState<Record<string, number> | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingRecognition, setLoadingRecognition] = useState(false);

  const loadGoogleStatus = async () => {
    setLoadingGoogle(true);
    try {
      const status = await fetchApi<GoogleIntegrationStatus>('/calendar/integrations/google/status');
      setGoogleStatus(status);
    } catch {
      setGoogleStatus({ connected: false, syncStatus: 'NOT_CONNECTED' });
    } finally {
      setLoadingGoogle(false);
    }
  };

  useEffect(() => {
    fetchApi('/scoring/recognition')
      .then(setRecognition)
      .catch(() => {});
    fetchApi<Record<string, number>>('/reports/settings')
      .then(setPolicy)
      .catch((e: any) => setMessage({ type: 'error', text: e.message || 'Failed to load policy settings' }));

    loadGoogleStatus();

    // Check for OAuth callback in query parameters
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code && window.location.search.includes('google_calendar')) {
        handleConnectWithCode(code);
      }
    }
  }, []);

  const handleConnectWithCode = async (code: string) => {
    setLoadingGoogle(true);
    setMessage({ type: 'success', text: 'Connecting Google Calendar account...' });
    try {
      await fetchApi('/calendar/integrations/google/connect', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      setMessage({ type: 'success', text: 'Google Calendar integration connected successfully!' });
      await loadGoogleStatus();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Google Calendar' });
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleStartGoogleOAuth = async () => {
    try {
      const { authUrl } = await fetchApi<{ authUrl: string }>('/calendar/integrations/google/auth-url');
      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to initiate Google authorization' });
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm('Are you sure you want to disconnect Google Calendar? Internal meetings, events, and appointments will remain intact.')) {
      return;
    }
    setLoadingGoogle(true);
    try {
      await fetchApi('/calendar/integrations/google/disconnect', { method: 'POST' });
      setMessage({ type: 'success', text: 'Google Calendar disconnected. Internal records have been preserved.' });
      await loadGoogleStatus();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect Google Calendar' });
    } finally {
      setLoadingGoogle(false);
    }
  };

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
            Configure visual appearance, administrative security, external integrations, scoring rules, and automated follow-up thresholds.
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

        {/* Section 1: Integrations & Google Calendar */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Google Calendar Integration</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Synchronize scheduled meetings, attendee invitations, and Google Meet conferences with Google Calendar.
                </p>
              </div>
            </div>

            <button
              onClick={loadGoogleStatus}
              disabled={loadingGoogle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingGoogle ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>

          <div className="pt-2">
            {googleStatus?.connected ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <Check className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Connected:</span>
                        <span className="text-indigo-600 dark:text-indigo-400">{googleStatus.googleEmail}</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Primary Calendar • {googleStatus.syncedEventsCount || 0} events mapped & synchronized
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                      <Radio className="w-3 h-3 animate-pulse" /> Live Synchronized
                    </span>
                    <button
                      onClick={handleDisconnectGoogle}
                      disabled={loadingGoogle}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold transition-all"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Meeting Invites</p>
                    <p className="text-slate-900 dark:text-white font-bold mt-0.5">Google Meet + Invites</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Last Synchronized</p>
                    <p className="text-slate-900 dark:text-white font-bold mt-0.5">
                      {googleStatus.lastSyncedAt ? new Date(googleStatus.lastSyncedAt).toLocaleTimeString() : 'Just now'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Conflict Protection</p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">Active</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Connect Your Google Calendar</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">Recommended</span>
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xl">
                    Authorize Google Calendar to automatically dispatch real calendar invitations to meeting participants and generate instant Google Meet video conference links.
                  </p>
                </div>

                <button
                  onClick={handleStartGoogleOAuth}
                  disabled={loadingGoogle}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95 shrink-0"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Connect Google Calendar</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Appearance & Theme Preferences */}
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

        {/* Section 3: Account & Security */}
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

        {/* Section 4: Scoring & Follow-Up Policies Form */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Scoring Weights & Follow-Up Thresholds</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure points awarded per attendance category and consecutive absence triggers.
              </p>
            </div>
          </div>

          {policy ? (
            <form onSubmit={handleSavePolicy} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {Object.entries(POLICY_LABELS).map(([key, config]) => {
                  const val = policy[key] ?? 0;
                  return (
                    <div
                      key={key}
                      className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1.5"
                    >
                      <label htmlFor={key} className="text-xs font-bold text-slate-900 dark:text-white block">
                        {config.label}
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        {config.description}
                      </p>
                      <input
                        id={key}
                        type="number"
                        step={config.step || '1'}
                        value={val}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            [key]: parseFloat(e.target.value) || 0,
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

        {/* Section 5: Members Eligible for Recognition */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Members Eligible For Recognition</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Members meeting or exceeding the recognition attendance and punctuality criteria.
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
