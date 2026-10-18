'use client';

import React from 'react';
import Image from 'next/image';

export interface PageLoaderProps {
  message?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  minHeight?: string | number;
  variant?: 'card' | 'inline' | 'clean';
  className?: string;
}

export function PageLoader({
  message = 'Loading records…',
  description,
  size = 'md',
  compact = false,
  minHeight = 240,
  variant = 'card',
  className = '',
}: PageLoaderProps) {
  const isSm = size === 'sm' || compact;
  const isLg = size === 'lg';

  const badgeSize = isSm ? 'w-12 h-12 rounded-xl' : isLg ? 'w-20 h-20 rounded-2xl' : 'w-16 h-16 rounded-2xl';
  const logoDim = isSm ? 28 : isLg ? 46 : 36;
  const ringSize = isSm ? 'w-16 h-16 -top-2 -left-2' : isLg ? 'w-24 h-24 -top-2 -left-2' : 'w-20 h-20 -top-2 -left-2';

  const content = (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center text-center select-none py-6 px-4 animate-in fade-in duration-300"
    >
      {/* Compact Orbital Energy Crest */}
      <div className="relative flex items-center justify-center mb-4">
        {/* Ambient Halo */}
        <div
          className={`absolute rounded-full bg-gradient-to-tr from-orange-500/30 to-amber-400/25 blur-lg animate-aura-glow pointer-events-none ${badgeSize}`}
        />

        {/* Counter-Clockwise Outer Track */}
        <div
          className={`absolute rounded-full border border-orange-500/35 border-t-amber-400 border-r-transparent animate-orbital-cw pointer-events-none ${ringSize}`}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
        </div>

        {/* Glass Plaque */}
        <div
          className={`relative ${badgeSize} animate-crest-float flex items-center justify-center backdrop-blur-xl overflow-hidden
            bg-white/90 dark:bg-slate-900/90
            border border-orange-500/25 dark:border-white/10
            shadow-[0_10px_25px_-8px_rgba(242,50,12,0.3),0_0_0_1px_rgba(255,255,255,0.4)_inset]`}
        >
          {/* Specular Sweep */}
          <div className="absolute inset-0 w-[60%] h-full bg-gradient-to-r from-transparent via-white/40 dark:via-white/20 to-transparent pointer-events-none animate-specular-glint" />

          {/* Logo */}
          <Image
            src="/logo-icon.svg"
            alt="TFHC"
            width={logoDim}
            height={logoDim}
            priority
            unoptimized
            className="object-contain drop-shadow-[0_2px_8px_rgba(242,50,12,0.35)]"
            style={{ width: `${logoDim}px`, height: `${logoDim}px` }}
          />
        </div>
      </div>

      {/* Status Capsule */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-2xs mb-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500" />
        </span>
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
          {message.replace(/[.…]+$/, '')}
        </span>
        <span className="inline-flex items-center text-orange-500 font-black text-xs leading-none">
          <span className="animate-wave-dot-1">.</span>
          <span className="animate-wave-dot-2">.</span>
          <span className="animate-wave-dot-3">.</span>
        </span>
      </div>

      {description && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs mb-3 font-medium">
          {description}
        </p>
      )}

      {/* Progress Track */}
      <div className="h-1 bg-slate-200/80 dark:bg-slate-800/80 rounded-full overflow-hidden relative w-32 shadow-inner">
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-transparent via-orange-500 to-amber-300 shadow-[0_0_8px_rgba(249,115,22,0.6)] animate-fluid-track" />
      </div>
    </div>
  );

  if (variant === 'card') {
    return (
      <div
        className={`w-full flex items-center justify-center rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-sm shadow-xs ${className}`}
        style={{ minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }}
      >
        {content}
      </div>
    );
  }

  if (variant === 'clean') {
    return (
      <div
        className={`w-full flex items-center justify-center ${className}`}
        style={{ minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }}
      >
        {content}
      </div>
    );
  }

  return (
    <div className={`w-full flex items-center justify-center py-6 ${className}`}>
      {content}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TableSkeleton: Shimmering data table placeholder                           */
/* -------------------------------------------------------------------------- */
export function TableSkeleton({
  rows = 5,
  cols = 5,
  showHeader = true,
  className = '',
}: {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs ${className}`}
    >
      {showHeader && (
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="h-4 w-36 rounded-md animate-skeleton-shimmer" />
          <div className="h-7 w-24 rounded-lg animate-skeleton-shimmer" />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-5 py-3.5">
                  <div
                    className="h-3 rounded animate-skeleton-shimmer"
                    style={{ width: `${Math.max(40, 90 - (i % 3) * 20)}%` }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="px-5 py-4">
                    <div
                      className="h-3.5 rounded-md animate-skeleton-shimmer"
                      style={{
                        width: c === 0 ? '75%' : `${Math.max(30, 80 - ((r + c) % 4) * 15)}%`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  CardSkeleton: Shimmering stat / KPI cards placeholder                      */
/* -------------------------------------------------------------------------- */
export function CardSkeleton({
  count = 4,
  gridCols = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  className = '',
}: {
  count?: number;
  gridCols?: string;
  className?: string;
}) {
  return (
    <div className={`grid ${gridCols} gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 rounded animate-skeleton-shimmer" />
            <div className="w-8 h-8 rounded-xl animate-skeleton-shimmer" />
          </div>
          <div className="h-8 w-28 rounded-lg animate-skeleton-shimmer" />
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="h-2.5 w-16 rounded animate-skeleton-shimmer" />
            <div className="h-2.5 w-12 rounded animate-skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ListSkeleton: Shimmering feed / list placeholder                           */
/* -------------------------------------------------------------------------- */
export function ListSkeleton({
  count = 4,
  className = '',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-full animate-skeleton-shimmer shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3.5 w-40 rounded animate-skeleton-shimmer" />
            <div className="h-2.5 w-24 rounded animate-skeleton-shimmer" />
          </div>
          <div className="h-6 w-16 rounded-full animate-skeleton-shimmer shrink-0" />
        </div>
      ))}
    </div>
  );
}
