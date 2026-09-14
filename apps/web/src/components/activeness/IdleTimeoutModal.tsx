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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Session about to end"
        className="w-full max-w-sm rounded-2xl bg-surface-container-lowest border border-outline-variant/30 p-6 text-center shadow-2xl"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Clock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-on-surface">Still there?</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          You&apos;ve been inactive for a while. For your security you&apos;ll be signed out in
        </p>
        <p className="my-4 text-3xl font-bold tabular-nums text-primary tracking-tight">
          {mm}:{ss}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={stay}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:opacity-95 transition-opacity"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={() => void endSession()}
            className="rounded-lg border border-outline-variant/40 bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
