'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout, getAuthToken } from '../../lib/api';
import { IDLE_WARNING_MS, IDLE_GRACE_MS, ACTIVITY_EVENTS } from './config';

/**
 * Signs an inactive user out. After IDLE_WARNING_MS with no activity a modal
 * counts down IDLE_GRACE_MS; "Stay signed in" resets it, otherwise the session
 * ends. Mounted on both the member and admin shells.
 */
export function IdleTimeoutModal() {
  const router = useRouter();
  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(IDLE_GRACE_MS);
  const warnTimer = useRef<ReturnType<typeof setTimeout>>();
  const tick = useRef<ReturnType<typeof setInterval>>();
  const deadline = useRef(0);

  const endSession = useCallback(() => {
    window.clearInterval(tick.current);
    void logout().finally(() => router.replace('/login?reason=idle'));
  }, [router]);

  const startCountdown = useCallback(() => {
    setWarning(true);
    deadline.current = Date.now() + IDLE_GRACE_MS;
    setRemaining(IDLE_GRACE_MS);
    tick.current = setInterval(() => {
      const left = deadline.current - Date.now();
      setRemaining(left);
      if (left <= 0) endSession();
    }, 1000);
  }, [endSession]);

  const armIdle = useCallback(() => {
    window.clearTimeout(warnTimer.current);
    // Test seam: e2e sets a short threshold so the warning is reachable.
    const delay = Number((typeof window !== 'undefined' && (window as unknown as { __IDLE_WARNING_MS__?: number }).__IDLE_WARNING_MS__) || IDLE_WARNING_MS);
    warnTimer.current = setTimeout(startCountdown, delay);
  }, [startCountdown]);

  const onActivity = useCallback(() => {
    if (warning) return; // ignore until the user answers the prompt
    armIdle();
  }, [warning, armIdle]);

  useEffect(() => {
    if (!getAuthToken()) return;
    armIdle();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      window.clearTimeout(warnTimer.current);
      window.clearInterval(tick.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [armIdle, onActivity]);

  const stay = () => {
    window.clearInterval(tick.current);
    setWarning(false);
    armIdle();
  };

  if (!warning) return null;
  const secs = Math.max(0, Math.ceil(remaining / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(1, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" aria-label="Session about to end" className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <span className="material-symbols-outlined">timer</span>
        </div>
        <h2 className="text-lg font-bold text-slate-900">Still there?</h2>
        <p className="mt-1 text-sm text-slate-600">
          You&apos;ve been inactive for a while. For your security you&apos;ll be signed out in
        </p>
        <p className="my-3 text-3xl font-bold tabular-nums text-slate-900">{mm}:{ss}</p>
        <div className="flex gap-2">
          <button onClick={stay} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
            Stay signed in
          </button>
          <button onClick={endSession} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
