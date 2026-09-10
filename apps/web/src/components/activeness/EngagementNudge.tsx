'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../lib/api';
import { ENGAGEMENT_LOOKBACK, ENGAGEMENT_MISS_THRESHOLD } from './config';

/** ISO week key so the nudge shows at most once per week per browser. */
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

const DISMISS_KEY = 'tfhc_engagement_nudge_week';

/**
 * A gentle "we've missed you" prompt when a member has been absent from most of
 * the recent gatherings. Dismissed for the rest of the ISO week.
 */
export function EngagementNudge() {
  const [misses, setMisses] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === weekKey());
    } catch {
      setDismissed(false);
    }
    fetchApi<{ recentRecords?: { status: string }[] }>('/scoring/my-performance')
      .then((p) => {
        const recent = (p?.recentRecords ?? []).slice(0, ENGAGEMENT_LOOKBACK);
        setMisses(recent.filter((r) => r.status === 'ABSENT').length);
      })
      .catch(() => setMisses(0));
  }, []);

  if (dismissed || misses < ENGAGEMENT_MISS_THRESHOLD) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, weekKey()); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div className="flex w-full items-start gap-3 rounded-xl border border-indigo-300/60 bg-indigo-50 px-4 py-3 text-indigo-900">
      <span className="material-symbols-outlined mt-0.5 text-[20px]">favorite</span>
      <div className="flex-1 text-sm">
        <p className="font-semibold">We&apos;ve missed you</p>
        <p className="mt-0.5 text-indigo-800">
          You&apos;ve been away from the last {misses} gatherings. Everything okay?{' '}
          <Link href="/member/submit-excuse" className="font-semibold underline">Let us know</Link>
          {' '}or{' '}
          <Link href="/member/meetings" className="font-semibold underline">see what&apos;s coming up</Link>.
        </p>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-indigo-700 hover:text-indigo-900">
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
    </div>
  );
}
