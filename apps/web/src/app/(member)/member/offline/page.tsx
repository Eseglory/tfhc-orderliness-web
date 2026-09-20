'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OfflineStorage } from '../../../../components/OfflineStorage';
import { PushSettings } from '../../../../components/PushSettings';

export default function OfflinePage() {
  const router = useRouter();

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
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Offline &amp; Device Settings</h1>
        </div>
      </header>

      <main className="flex-1 px-edge-margin py-stack-md flex flex-col gap-section-gap w-full max-w-3xl mx-auto space-y-4">
        {/* Quick Link to Comprehensive Settings */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0b1c30] to-[#162a42] text-white flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#f2320c] text-2xl">settings</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300">New Settings Centre</p>
              <h2 className="text-sm font-extrabold text-white">Full Settings &amp; Device Permissions</h2>
            </div>
          </div>
          <Link
            href="/member/settings"
            className="px-3 py-1.5 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] text-white text-xs font-bold shrink-0 transition-all active:scale-95"
          >
            Open Settings
          </Link>
        </div>
        {/* PWA Installation Guidance */}
        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-[0px_2px_8px_rgba(0,0,0,0.05)] space-y-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">install_mobile</span>
            <h2 className="font-headline-sm text-base font-bold text-primary">Install TFHC App</h2>
          </div>
          <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
            For the best experience, install TFHC Tracker to your home screen. On iPhone or iPad, tap <strong>Share</strong> in Safari and select <strong>Add to Home Screen</strong>. On Android and Chrome, tap the <strong>Install</strong> banner in your browser address bar.
          </p>
        </section>

        {/* Offline Storage Component */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-[0px_2px_8px_rgba(0,0,0,0.05)]">
          <OfflineStorage />
        </div>

        {/* Push Notification Settings Component */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-[0px_2px_8px_rgba(0,0,0,0.05)]">
          <PushSettings />
        </div>

        {/* Sync & Reliability Notice */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-on-surface-variant space-y-1">
          <p className="font-bold text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">sync</span> Sync &amp; Network Reliability
          </p>
          <p className="leading-relaxed">
            Check-ins and payments require an active internet connection to ensure accurate timestamps. Drafts and pending notifications are saved locally on this device and synced automatically once you are back online.
          </p>
        </div>

        {/* Quick Link to Files */}
        <div className="pt-2">
          <Link
            href="/member/files"
            className="flex items-center justify-between p-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container-low transition-colors shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-500/10 text-slate-600 flex items-center justify-center">
                <span className="material-symbols-outlined">folder_open</span>
              </div>
              <div>
                <p className="font-label-md font-bold text-primary">File Inbox</p>
                <p className="text-xs text-on-surface-variant">Review staged files received from device sharing</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
