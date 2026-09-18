'use client';

import React from 'react';
import Image from 'next/image';

interface LoadingScreenProps {
  message?: string;
  subtext?: string;
  fullScreen?: boolean;
}

export function LoadingScreen({
  message = 'Loading your account…',
  subtext = "The Father's House Church",
  fullScreen = true,
}: LoadingScreenProps) {
  const content = (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center text-center select-none"
      style={{ width: '100%', maxWidth: '340px', margin: '0 auto' }}
    >
      {/* Power Logo Animation Container */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: '100px', height: '100px', marginBottom: '24px' }}
      >
        {/* Layer 1: Ambient Pulsing Multi-Color Radial Glow Aura */}
        <div
          className="absolute rounded-full bg-gradient-to-tr from-amber-500/30 via-orange-500/35 to-red-600/30 blur-xl animate-pulse"
          style={{ width: '120px', height: '120px', top: '-10px', left: '-10px' }}
        />

        {/* Layer 2: Outer Rotating Orbital Gradient Ring */}
        <div
          className="absolute rounded-full border-2 border-transparent border-t-amber-500 border-r-orange-500 border-b-transparent border-l-red-500/50 animate-spin [animation-duration:3s]"
          style={{ width: '112px', height: '112px', top: '-6px', left: '-6px' }}
        />

        {/* Layer 3: Glass Shield Vessel */}
        <div
          className="relative rounded-2xl bg-white/95 dark:bg-slate-900/95 shadow-xl border border-orange-500/20 dark:border-orange-400/20 flex items-center justify-center backdrop-blur-md overflow-hidden"
          style={{ width: '96px', height: '96px' }}
        >
          {/* Logo Mark with Constrained Dimensions */}
          <div
            className="relative flex items-center justify-center animate-pulse"
            style={{ width: '64px', height: '64px' }}
          >
            <Image
              src="/logo-icon.svg"
              alt="TFHC Logo"
              width={64}
              height={64}
              priority
              unoptimized
              className="object-contain drop-shadow-[0_2px_8px_rgba(249,115,22,0.4)]"
              style={{ width: '64px', height: '64px', maxWidth: '64px', maxHeight: '64px' }}
            />
          </div>
        </div>
      </div>

      {/* Brand Header */}
      <div className="space-y-1" style={{ marginBottom: '16px' }}>
        <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
          <span className="text-orange-500">TFHC</span>
          <span>ORDERLINESS</span>
        </h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          {subtext}
        </p>
      </div>

      {/* Dynamic Status Label with Animated Wave Dots */}
      <div suppressHydrationWarning className="flex items-center justify-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <span suppressHydrationWarning>{message.replace(/[.…]+$/, '')}</span>
        <span className="inline-flex tracking-tight font-black text-orange-500">
          <span className="animate-[bounce_1.4s_infinite_0ms]">.</span>
          <span className="animate-[bounce_1.4s_infinite_200ms]">.</span>
          <span className="animate-[bounce_1.4s_infinite_400ms]">.</span>
        </span>
      </div>

      {/* Shimmering Progress Bar Track */}
      <div
        className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner"
        style={{ width: '160px', marginTop: '16px' }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500 to-transparent w-full animate-[shimmer_1.8s_infinite] -translate-x-full" />
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-2xl transition-all duration-300 p-4"
        style={{ minHeight: '100vh', minWidth: '100vw' }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="w-full flex items-center justify-center p-8"
      style={{ minHeight: '320px' }}
    >
      {content}
    </div>
  );
}
