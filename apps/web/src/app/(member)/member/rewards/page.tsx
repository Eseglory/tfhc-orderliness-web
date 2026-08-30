'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RewardsPage() {
  const router = useRouter();

  return (
    <div className="bg-background text-on-background min-h-screen pb-24 font-body-md">
      {/* TopAppBar matching Stitch Screen 15 */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-edge-margin h-16 bg-background border-b border-outline-variant/10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Rewards &amp; Milestones</h1>
        </div>
        <Link href="/member/notifications" className="text-primary hover:opacity-80 p-2 rounded-full">
          <span className="material-symbols-outlined">notifications</span>
        </Link>
      </header>

      <main className="px-edge-margin max-w-4xl mx-auto space-y-section-gap pt-20">
        {/* Banner matching Stitch Screen 15 */}
        <section>
          <div className="relative w-full h-40 md:h-56 rounded-xl overflow-hidden shadow-[0px_2px_8px_rgba(0,0,0,0.05)] bg-slate-900">
            <div className="absolute inset-0 bg-gradient-to-r from-primary via-slate-900 to-secondary opacity-90 z-10"></div>
            <div className="absolute inset-0 z-20 flex flex-col justify-center px-stack-lg">
              <span className="font-label-md text-label-md text-secondary uppercase tracking-wider mb-2 font-bold">
                Current Period
              </span>
              <h2 className="font-headline-lg text-headline-lg text-white font-bold">August 2026 Recognition Cycle</h2>
              <p className="font-body-md text-body-md text-slate-300 mt-2 max-w-md">
                Your steadfast commitment is noted. Continue your journey of excellence.
              </p>
            </div>
          </div>
        </section>

        {/* Bento Grid: Milestones matching Stitch Screen 15 */}
        <section>
          <h3 className="font-headline-sm text-headline-sm text-primary mb-stack-md font-bold">Your Milestones</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Unlocked Gold Shield */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 flex flex-col justify-between aspect-square relative overflow-hidden group">
              <div className="z-10">
                <span className="material-symbols-outlined text-secondary text-4xl mb-2">shield</span>
                <h4 className="font-label-md text-label-md text-on-surface font-bold">July Punctuality</h4>
              </div>
              <div className="mt-auto z-10">
                <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-tertiary-fixed-variant bg-tertiary-fixed-dim px-2 py-1 rounded-full font-bold">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span> Unlocked
                </span>
              </div>
            </div>

            {/* Unlocked Streak Master */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 flex flex-col justify-between aspect-square relative overflow-hidden group">
              <div className="z-10">
                <span className="material-symbols-outlined text-error text-4xl mb-2">local_fire_department</span>
                <h4 className="font-label-md text-label-md text-on-surface font-bold">Streak Master</h4>
              </div>
              <div className="mt-auto z-10">
                <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-tertiary-fixed-variant bg-tertiary-fixed-dim px-2 py-1 rounded-full font-bold">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span> Unlocked
                </span>
              </div>
            </div>

            {/* In Progress Consistency */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 flex flex-col justify-between aspect-square col-span-2">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="material-symbols-outlined text-primary text-3xl">update</span>
                  <span className="font-label-md text-label-md text-outline">In Progress</span>
                </div>
                <h4 className="font-headline-sm text-headline-sm text-on-surface mb-1 font-bold">Consistency</h4>
                <p className="font-body-md text-body-md text-on-surface-variant">Maintain perfect attendance for the quarter.</p>
              </div>
              <div className="mt-auto pt-4">
                <div className="flex justify-between font-label-sm text-label-sm mb-1">
                  <span className="text-primary font-bold">88% Complete</span>
                  <span className="text-outline">Goal: 100%</span>
                </div>
                <div className="w-full bg-surface-variant rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: '88%' }}></div>
                </div>
              </div>
            </div>

            {/* Locked Early Bird */}
            <div className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/30 flex flex-col justify-between aspect-square opacity-70">
              <div>
                <span className="material-symbols-outlined text-outline text-4xl mb-2">lock</span>
                <h4 className="font-label-md text-label-md text-on-surface font-bold">Early Bird</h4>
              </div>
              <div className="mt-auto">
                <div className="text-center font-label-sm text-label-sm text-on-surface-variant bg-surface-container py-1 rounded-md">
                  3/5 Logins
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Monthly Honorees List matching Stitch Screen 15 */}
        <section>
          <div className="flex justify-between items-end mb-stack-md">
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Monthly Honorees</h3>
            <span className="font-label-md text-label-md text-secondary font-bold">View All</span>
          </div>
          <div className="space-y-gutter">
            <div className="bg-surface-container-lowest p-stack-md rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/20 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-secondary bg-surface-container flex items-center justify-center p-1">
                <img className="w-full h-full object-contain" src="/logo-icon.svg" alt="Honoree" />
              </div>
              <div className="flex-grow">
                <h4 className="font-body-lg text-body-lg text-on-surface font-bold">Sarah Jenkins</h4>
                <p className="font-body-md text-body-md text-on-surface-variant">Exceptional Stewardship</p>
              </div>
              <div className="flex-shrink-0 text-secondary">
                <span className="material-symbols-outlined">workspace_premium</span>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-stack-md rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/20 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-primary-fixed-dim bg-surface-container flex items-center justify-center p-1">
                <img className="w-full h-full object-contain" src="/logo-icon.svg" alt="Honoree" />
              </div>
              <div className="flex-grow">
                <h4 className="font-body-lg text-body-lg text-on-surface font-bold">Marcus Chen</h4>
                <p className="font-body-md text-body-md text-on-surface-variant">Perfect Punctuality</p>
              </div>
              <div className="flex-shrink-0 text-primary-fixed-dim">
                <span className="material-symbols-outlined">star</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
