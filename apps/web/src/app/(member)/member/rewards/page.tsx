'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';

export default function RewardsPage() {
  const router = useRouter();
  const [performance, setPerformance] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchApi('/scoring/my-performance')
      .then(setPerformance)
      .catch((e) => setError(e.message || 'Could not load your milestones.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md pb-28 antialiased">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background top-0 z-40 sticky border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Milestones & Rewards</h1>
        </div>
        <Link
          href="/member/leaderboard"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-label-md text-label-md font-bold hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-base">emoji_events</span>
          <span className="hidden sm:inline">Leaderboard</span>
        </Link>
      </header>

      <main className="flex-1 px-edge-margin py-stack-md flex flex-col gap-section-gap w-full max-w-3xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
            <p className="font-body-md">Loading milestones…</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-error-container text-on-error-container text-center">
            <p role="alert">{error}</p>
          </div>
        ) : !performance ? (
          <p className="text-center py-12 text-on-surface-variant">No performance data found.</p>
        ) : (
          <>
            {/* Recognition Eligibility Banner */}
            <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-[0px_2px_8px_rgba(0,0,0,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-2xl">workspace_premium</span>
                    <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Recognition Eligibility</h2>
                  </div>
                  <p className="mt-2 font-body-md text-on-surface-variant">
                    {performance.recognition?.eligible
                      ? '🎉 Congratulations! You meet the current recognition criteria for your dedication and consistency.'
                      : 'Keep participating and attending upcoming gatherings to qualify for the recognition award.'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-bold shrink-0 ${
                    performance.recognition?.eligible
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'
                  }`}
                >
                  {performance.recognition?.eligible ? 'Eligible' : 'In Progress'}
                </span>
              </div>

              <div className="mt-4 pt-4 border-t border-outline-variant/20 grid grid-cols-3 gap-2 text-center">
                <div className="bg-surface-container-low rounded-lg p-2.5">
                  <span className="font-label-sm text-xs text-on-surface-variant block">Min Gatherings</span>
                  <span className="font-headline-sm text-base font-bold text-primary">
                    {performance.expectedCount ?? 0} / {performance.recognition?.minimumMeetings ?? 0}
                  </span>
                </div>
                <div className="bg-surface-container-low rounded-lg p-2.5">
                  <span className="font-label-sm text-xs text-on-surface-variant block">Req. Attendance</span>
                  <span className="font-headline-sm text-base font-bold text-primary">
                    {performance.attendanceRate?.toFixed(0) ?? 0}% / {performance.recognition?.attendanceThreshold ?? 0}%
                  </span>
                </div>
                <div className="bg-surface-container-low rounded-lg p-2.5">
                  <span className="font-label-sm text-xs text-on-surface-variant block">Req. Punctuality</span>
                  <span className="font-headline-sm text-base font-bold text-primary">
                    {performance.punctualityRate?.toFixed(0) ?? 0}% / {performance.recognition?.punctualityThreshold ?? 0}%
                  </span>
                </div>
              </div>
            </section>

            {/* Core Achievement Grid */}
            <section className="grid grid-cols-2 gap-3">
              {[
                {
                  label: 'Total Points',
                  value: performance.totalPoints ?? 0,
                  icon: 'stars',
                  color: 'text-amber-600 bg-amber-500/10',
                  desc: 'Accumulated participation points',
                },
                {
                  label: 'Gatherings Attended',
                  value: performance.attendedCount ?? 0,
                  icon: 'event_available',
                  color: 'text-primary bg-primary/10',
                  desc: `Out of ${performance.expectedCount ?? 0} scheduled`,
                },
                {
                  label: 'Current Streak',
                  value: `${performance.currentAttendanceStreak ?? 0} in a row`,
                  icon: 'local_fire_department',
                  color: 'text-rose-600 bg-rose-500/10',
                  desc: 'Consecutive attendances',
                },
                {
                  label: 'On-Time Streak',
                  value: `${performance.currentOnTimeStreak ?? 0} in a row`,
                  icon: 'alarm_on',
                  color: 'text-emerald-600 bg-emerald-500/10',
                  desc: 'Consecutive punctual check-ins',
                },
              ].map((m) => (
                <article
                  key={m.label}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-xs font-bold text-on-surface-variant uppercase">{m.label}</span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.color}`}>
                      <span className="material-symbols-outlined text-lg">{m.icon}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="font-headline-md text-2xl font-extrabold text-primary">{m.value}</p>
                    <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{m.desc}</p>
                  </div>
                </article>
              ))}
            </section>

            {/* Seamless Cross-Navigation Links */}
            <section className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/member/leaderboard"
                className="flex-1 flex items-center justify-between p-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <span className="material-symbols-outlined">emoji_events</span>
                  </div>
                  <div>
                    <p className="font-label-md font-bold text-primary">Leaderboard</p>
                    <p className="text-xs text-on-surface-variant">See where you stand among your peers</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
              </Link>

              <Link
                href="/member/analytics"
                className="flex-1 flex items-center justify-between p-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined">monitoring</span>
                  </div>
                  <div>
                    <p className="font-label-md font-bold text-primary">Performance Analytics</p>
                    <p className="text-xs text-on-surface-variant">View composite score and formula breakdown</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
