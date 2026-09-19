'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { logout, getAuthToken } from '../../lib/api';
import { IDLE_WARNING_MS, IDLE_GRACE_MS, ACTIVITY_EVENTS } from './config';

/**
 * Signs an inactive user out. After IDLE_WARNING_MS with no activity a modal
 * counts down IDLE_GRACE_MS; "Stay signed in" resets it, otherwise the session
 * ends automatically when countdown reaches zero.
 */
export function IdleTimeoutModal() {
  const router = useRouter();
  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(IDLE_GRACE_MS);

  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef<number>(0);
  const warningRef = useRef(false);
  warningRef.current = warning;

  const endSession = useCallback(async () => {
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
    if (warnTimer.current) {
      clearTimeout(warnTimer.current);
      warnTimer.current = null;
    }
    try {
      await logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      router.replace('/login?reason=idle');
    }
  }, [router]);

  const startCountdown = useCallback(() => {
    setWarning(true);
    const targetTime = Date.now() + IDLE_GRACE_MS;
    deadline.current = targetTime;
    setRemaining(IDLE_GRACE_MS);

    if (tickTimer.current) {
      clearInterval(tickTimer.current);
    }

    tickTimer.current = setInterval(() => {
      const left = deadline.current - Date.now();
      if (left <= 0) {
        if (tickTimer.current) {
          clearInterval(tickTimer.current);
          tickTimer.current = null;
        }
        setRemaining(0);
        void endSession();
      } else {
        setRemaining(left);
      }
    }, 1000);
  }, [endSession]);

  const armIdle = useCallback(() => {
    if (warnTimer.current) {
      clearTimeout(warnTimer.current);
    }
    const delay = Number(
      (typeof window !== 'undefined' &&
        (window as unknown as { __IDLE_WARNING_MS__?: number }).__IDLE_WARNING_MS__) ||
        IDLE_WARNING_MS
    );
    warnTimer.current = setTimeout(startCountdown, delay);
  }, [startCountdown]);

  const onActivity = useCallback(() => {
    if (warningRef.current) return; // Do not reset timer while user is being prompted
    armIdle();
  }, [armIdle]);

  useEffect(() => {
    if (!getAuthToken()) return;

    armIdle();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      if (warnTimer.current) {
        clearTimeout(warnTimer.current);
        warnTimer.current = null;
      }
      if (tickTimer.current) {
        clearInterval(tickTimer.current);
        tickTimer.current = null;
      }
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [armIdle, onActivity]);

  const stay = () => {
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
    setWarning(false);
    armIdle();
  };

  if (!warning) return null;

  const secs = Math.max(0, Math.ceil(remaining / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(1, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Session about to end"
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-7 text-center shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200"
      >
        {/* Subtle decorative glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Icon Badge */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 shadow-sm">
          <Clock className="h-7 w-7 animate-pulse" />
        </div>

        {/* Title & Description */}
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Still there?
        </h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          You&apos;ve been inactive for a while. For your security, you&apos;ll be automatically signed out in
        </p>

        {/* Countdown Badge */}
        <div className="my-5 inline-flex items-center gap-2 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 px-5 py-2.5 shadow-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span className="font-mono text-2xl font-bold tracking-wider text-amber-600 dark:text-amber-400 tabular-nums">
            {mm}:{ss}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 mt-2">
          <button
            type="button"
            onClick={stay}
            className="w-full sm:flex-1 rounded-xl bg-[#f2320c] hover:bg-[#d82a08] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-red-500/20 hover:shadow-lg hover:shadow-red-500/30 transition-all duration-150 active:scale-[0.98]"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={() => void endSession()}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-all duration-150 active:scale-[0.98]"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
