'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotificationsPage() {
  const router = useRouter();
  const [markedAllRead, setMarkedAllRead] = useState(false);

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md pb-24">
      {/* TopAppBar matching Stitch Screen 14 */}
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 top-0 sticky z-50 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:opacity-80 transition-all duration-200 active:scale-95 bg-surface-container-high text-on-surface"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Activity</h1>
        </div>
        <button
          onClick={() => setMarkedAllRead(true)}
          disabled={markedAllRead}
          className={`font-label-md text-label-md transition-all duration-200 active:scale-95 ${
            markedAllRead ? 'text-outline opacity-50' : 'text-secondary font-bold'
          }`}
        >
          {markedAllRead ? 'All read' : 'Mark all read'}
        </button>
      </header>

      {/* Main Content matching Stitch Screen 14 */}
      <main className="flex-1 px-edge-margin py-stack-md overflow-y-auto no-scrollbar flex flex-col gap-section-gap max-w-3xl mx-auto w-full">
        {/* Today Section */}
        <section className="flex flex-col gap-stack-md">
          <h2 className="font-label-md text-label-md text-outline uppercase tracking-wider font-bold">Today</h2>
          {/* Check-in Notification (Unread) */}
          <div className="notification-card bg-surface-container-lowest rounded-xl p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-surface-container-high relative overflow-hidden">
            {!markedAllRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary-container"></div>}
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary-fixed-dim/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-secondary">qr_code_scanner</span>
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-body-md text-body-md font-semibold text-primary">Meeting check-in OPEN</h3>
                  <span className="font-label-sm text-label-sm text-outline">15m ago</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  The check-in window for the Annual General Meeting is now open. Please tap here to scan your QR code.
                </p>
                <button
                  onClick={() => router.push('/member/check-in')}
                  className="mt-2 self-start font-label-md text-label-md bg-primary text-on-primary px-4 py-2 rounded-full active:scale-95 transition-transform font-bold"
                >
                  Check In Now
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Earlier Section */}
        <section className="flex flex-col gap-stack-md">
          <h2 className="font-label-md text-label-md text-outline uppercase tracking-wider font-bold">Earlier</h2>
          {/* Excuse Approved */}
          <div className="notification-card bg-surface-container-lowest rounded-xl p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] flex gap-4 border border-outline-variant/20">
            <div className="w-12 h-12 rounded-full bg-tertiary-fixed-dim/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-tertiary-container">check_circle</span>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex justify-between items-start">
                <h3 className="font-body-md text-body-md font-semibold text-primary">Excuse APPROVED</h3>
                <span className="font-label-sm text-label-sm text-outline">2d ago</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Your absence excuse for the Leadership Summit has been reviewed and approved.
              </p>
            </div>
          </div>

          {/* Streak Milestone */}
          <div className="notification-card bg-surface-container-lowest rounded-xl p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] flex gap-4 border border-outline-variant/20">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-secondary-container">local_fire_department</span>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex justify-between items-start">
                <h3 className="font-body-md text-body-md font-semibold text-primary">Streak Milestone!</h3>
                <span className="font-label-sm text-label-sm text-outline">4d ago</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Congratulations! You&apos;ve attended 10 consecutive mandatory meetings.
              </p>
            </div>
          </div>
        </section>

        {/* Warnings Section */}
        <section className="flex flex-col gap-stack-md">
          <h2 className="font-label-md text-label-md text-outline uppercase tracking-wider font-bold">Warnings</h2>
          {/* Absence Reminder */}
          <div className="notification-card bg-error-container/30 rounded-xl p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-error-container flex gap-4">
            <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-error-container">warning</span>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex justify-between items-start">
                <h3 className="font-body-md text-body-md font-semibold text-error">1 unexcused absence</h3>
                <span className="font-label-sm text-label-sm text-outline">6d ago</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                You missed the Weekly Sync. Please submit an excuse within 24 hours to avoid penalties.
              </p>
              <button
                onClick={() => router.push('/member/my-attendance')}
                className="mt-2 self-start font-label-md text-label-md border border-error text-error px-4 py-2 rounded-full active:scale-95 transition-transform bg-surface-container-lowest font-semibold"
              >
                Submit Excuse
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
