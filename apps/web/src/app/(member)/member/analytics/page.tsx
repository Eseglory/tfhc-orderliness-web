'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '../../../../lib/api';

export default function PerformanceAnalyticsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetchApi('/scoring/my-performance')
      .then((data) => setProfile(data))
      .catch((err) => console.error(err));
  }, []);

  const attRate = profile?.metrics?.attendanceRate ? profile.metrics.attendanceRate.toFixed(1) : '91.7';
  const punctRate = profile?.metrics?.punctualityRate ? profile.metrics.punctualityRate.toFixed(1) : '81.8';
  const compositeScore = profile?.compositeScore ? profile.compositeScore.toFixed(1) : '94.2';

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md pb-[90px]">
      {/* Top App Bar matching Stitch Screen 13 */}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background top-0 z-40 sticky border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Performance Analytics</h1>
        </div>
      </header>

      <main className="flex-1 px-edge-margin py-stack-md flex flex-col gap-section-gap w-full max-w-3xl mx-auto">
        {/* Dual Ring Chart Section matching Stitch Screen 13 */}
        <section className="bg-surface-container-lowest rounded-xl p-6 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 flex flex-col items-center justify-center relative">
          <div className="relative w-48 h-48 flex items-center justify-center my-4">
            <svg className="w-full h-full score-ring" viewBox="0 0 100 100">
              <circle className="score-circle-bg" cx="50" cy="50" r="45"></circle>
              <circle className="score-circle-navy" cx="50" cy="50" r="45"></circle>
              <circle className="score-circle-bg" cx="50" cy="50" r="35"></circle>
              <circle className="score-circle-gold" cx="50" cy="50" r="35"></circle>
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="font-headline-lg text-headline-lg font-bold text-primary">{compositeScore}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Composite Score</span>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary-container"></span>
              <span className="font-label-md text-label-md text-on-surface font-semibold">Attendance ({attRate}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-secondary-container"></span>
              <span className="font-label-md text-label-md text-on-surface font-semibold">Punctuality ({punctRate}%)</span>
            </div>
          </div>
        </section>

        {/* Bento Grid Metrics */}
        <section className="grid grid-cols-2 gap-gutter">
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 flex flex-col justify-between">
            <span className="material-symbols-outlined text-secondary text-3xl">local_fire_department</span>
            <div className="mt-4">
              <div className="font-headline-lg text-headline-lg font-bold text-primary">8</div>
              <div className="font-label-sm text-label-sm text-on-surface-variant">Consecutive Streak</div>
            </div>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 flex flex-col justify-between">
            <span className="material-symbols-outlined text-primary text-3xl">workspace_premium</span>
            <div className="mt-4">
              <div className="font-headline-lg text-headline-lg font-bold text-primary">210</div>
              <div className="font-label-sm text-label-sm text-on-surface-variant">Total Points (Rank #6)</div>
            </div>
          </div>
        </section>

        {/* Formula Breakdown Section */}
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30">
          <h3 className="font-label-md text-label-md text-on-surface-variant uppercase mb-3 font-bold">Scoring Formula Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 rounded bg-surface-container-low">
              <span className="font-body-md text-body-md text-on-surface">Base Attendance</span>
              <span className="font-label-md text-label-md font-bold text-primary">+60 pts</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-surface-container-low">
              <span className="font-body-md text-body-md text-on-surface">Punctuality Bonus</span>
              <span className="font-label-md text-label-md font-bold text-secondary">+25 pts</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-surface-container-low">
              <span className="font-body-md text-body-md text-on-surface">Streak Modifier</span>
              <span className="font-label-md text-label-md font-bold text-tertiary-container">+15 pts</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
