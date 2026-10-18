'use client';

import React from 'react';
import Image from 'next/image';

export interface LoadingScreenProps {
  message?: string;
  subtext?: string;
  secondaryMessage?: string;
  progress?: number;
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingScreen({
  message = 'Loading your account…',
  subtext = "The Father's House Church",
  secondaryMessage,
  progress,
  fullScreen = true,
  size = 'md',
}: LoadingScreenProps) {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  // Sizing definitions
  const containerDim = isSm ? 'w-24 h-24' : isLg ? 'w-36 h-36' : 'w-28 h-28';
  const outerRingDim = isSm ? 'w-28 h-28 -top-2 -left-2' : isLg ? 'w-44 h-44 -top-4 -left-4' : 'w-36 h-36 -top-4 -left-4';
  const innerRingDim = isSm ? 'w-24 h-24 -top-0 -left-0' : isLg ? 'w-36 h-36 -top-0 -left-0' : 'w-30 h-30 -top-1 -left-1';
  const auraDim = isSm ? 'w-32 h-32 -top-4 -left-4' : isLg ? 'w-48 h-48 -top-6 -left-6' : 'w-40 h-40 -top-6 -left-6';
  const badgeDim = isSm ? 'w-20 h-20 rounded-2xl' : isLg ? 'w-28 h-28 rounded-3xl' : 'w-24 h-24 rounded-[26px]';
  const logoDim = isSm ? 44 : isLg ? 68 : 54;

  const content = (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center text-center select-none relative z-10 transition-all duration-300"
      style={{ width: '100%', maxWidth: '380px', margin: '0 auto' }}
    >
      {/* ------------------------------------------------------------- */}
      {/* Dynamic Orbital Gyro & 3D Glass Crest                          */}
      {/* ------------------------------------------------------------- */}
      <div className={`relative flex items-center justify-center mb-6 ${containerDim}`}>
        {/* Layer 1: Multi-Staged Radial Energy Aura Halo */}
        <div
          className={`absolute rounded-full bg-gradient-to-tr from-red-600/35 via-orange-500/40 to-amber-400/35 blur-2xl animate-aura-glow pointer-events-none ${auraDim}`}
        />
        <div
          className={`absolute rounded-full bg-gradient-to-br from-amber-500/20 via-orange-600/25 to-red-600/20 blur-xl animate-pulse pointer-events-none ${containerDim}`}
        />

        {/* Layer 2: Outer Celestial Conic Orbital Ring (Clockwise) */}
        <div
          className={`absolute rounded-full border border-transparent animate-orbital-cw pointer-events-none ${outerRingDim}`}
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(242, 50, 12, 0.1) 90deg, rgba(249, 115, 22, 0.85) 180deg, rgba(251, 191, 36, 1) 270deg, transparent 360deg) border-box',
            WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        >
          {/* Orbital Leading Light Node */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_3px_rgba(251,191,36,0.9)]"
          />
        </div>

        {/* Layer 3: Inner Counter-Rotating Gyro Track (Counter-Clockwise) */}
        <div
          className={`absolute rounded-full border border-dashed border-orange-500/30 dark:border-amber-400/30 animate-orbital-ccw pointer-events-none ${innerRingDim}`}
        >
          {/* Secondary Orbital Node */}
          <div
            className="absolute bottom-0 right-1/4 translate-x-1/2 translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.9)]"
          />
        </div>

        {/* Layer 4: 3D Floating Glassmorphic Pedestal Badge */}
        <div
          className={`relative ${badgeDim} animate-crest-float flex items-center justify-center backdrop-blur-2xl overflow-hidden transition-all duration-300
            bg-white/85 dark:bg-slate-900/85
            border border-white/60 dark:border-white/10
            shadow-[0_20px_40px_-15px_rgba(242,50,12,0.35),0_0_0_1px_rgba(255,255,255,0.3)_inset,0_2px_4px_0_rgba(255,255,255,0.4)_inset]
            dark:shadow-[0_20px_45px_-12px_rgba(242,50,12,0.45),0_0_0_1px_rgba(255,255,255,0.08)_inset,0_1px_2px_0_rgba(255,255,255,0.15)_inset]`}
        >
          {/* Specular Diagonal Light Sweep Beam */}
          <div className="absolute inset-0 w-[50%] h-full bg-gradient-to-r from-transparent via-white/40 dark:via-white/20 to-transparent pointer-events-none animate-specular-glint" />

          {/* Internal Radial Sheen */}
          <div className="absolute inset-0 bg-radial-gradient from-amber-500/10 via-transparent to-transparent pointer-events-none" />

          {/* Core TFHC Flame Emblem */}
          <div className="relative flex items-center justify-center p-2 z-10">
            <Image
              src="/logo-icon.svg"
              alt="TFHC Logo"
              width={logoDim}
              height={logoDim}
              priority
              unoptimized
              className="object-contain drop-shadow-[0_4px_12px_rgba(242,50,12,0.45)] transition-transform duration-300 hover:scale-105"
              style={{ width: `${logoDim}px`, height: `${logoDim}px` }}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Brand Header with Shimmering Metallic Typography             */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-1.5 mb-4">
        <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center justify-center gap-1.5 leading-none">
          <span className="bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 bg-clip-text text-transparent drop-shadow-xs">
            TFHC
          </span>
          <span className="bg-gradient-to-r from-slate-900 via-orange-600 to-slate-900 dark:from-white dark:via-amber-300 dark:to-white bg-clip-text text-transparent animate-text-shine">
            ORDERLINESS
          </span>
        </h2>
        <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
          {subtext}
        </p>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Dynamic Status Capsule with Pulsing Beacon & Wave Dots        */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col items-center gap-2 mb-4">
        <div
          suppressHydrationWarning
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md shadow-xs text-xs font-semibold text-slate-700 dark:text-slate-200"
        >
          {/* Live Pulsing Beacon Orb */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-gradient-to-r from-red-500 to-orange-500" />
          </span>

          {/* Dynamic Status Label */}
          <span suppressHydrationWarning className="tracking-tight">
            {message.replace(/[.…]+$/, '')}
          </span>

          {/* Synchronized Fluid Wave Dots */}
          <span className="inline-flex items-center tracking-tighter font-black text-orange-500 text-sm leading-none">
            <span className="animate-wave-dot-1">.</span>
            <span className="animate-wave-dot-2">.</span>
            <span className="animate-wave-dot-3">.</span>
          </span>
        </div>

        {secondaryMessage && (
          <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 animate-fade-in max-w-xs">
            {secondaryMessage}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* High-Tech Fluid Progress Bar Track                           */}
      {/* ------------------------------------------------------------- */}
      <div
        className="h-1.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-full overflow-hidden relative shadow-inner w-44"
        style={{ minWidth: '176px' }}
      >
        {typeof progress === 'number' ? (
          // Determinate Mode (if progress value 0-100 is passed)
          <div
            className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(249,115,22,0.8)]"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        ) : (
          // Indeterminate Mode (Fluid dynamic light beam)
          <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-transparent via-orange-500 to-amber-300 shadow-[0_0_12px_2px_rgba(249,115,22,0.6)] animate-fluid-track" />
        )}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50/90 dark:bg-slate-950/92 backdrop-blur-2xl transition-all duration-300 p-4"
        style={{ minHeight: '100vh', minWidth: '100vw' }}
      >
        {/* Subtle Ambient Radial Spotlight */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(242,50,12,0.07)_0%,rgba(11,28,48,0.02)_60%,transparent_100%)] pointer-events-none" />
        {content}
      </div>
    );
  }

  return (
    <div
      className="w-full flex items-center justify-center p-8 transition-all duration-300"
      style={{ minHeight: '300px' }}
    >
      {content}
    </div>
  );
}
