'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../lib/api';
import { REQUIRED_PROFILE_FIELDS } from './config';

const DISMISS_KEY = 'tfhc_profile_reminder_dismissed';

/**
 * Dismissible banner shown until a member has filled the fields the unit needs.
 * Dismissal lasts the browser session; it returns on the next sign-in.
 */
export function ProfileCompletionReminder() {
  const [missing, setMissing] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
    fetchApi<Record<string, unknown>>('/members/me/profile')
      .then((p) => {
        setMissing(
          REQUIRED_PROFILE_FIELDS.filter((f) => {
            const v = p?.[f.key];
            return v === null || v === undefined || v === '';
          }).map((f) => f.label),
        );
      })
      .catch(() => setMissing([]));
  }, []);

  if (dismissed || missing.length === 0) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div className="flex w-full items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-900">
      <span className="material-symbols-outlined mt-0.5 text-[20px]">badge</span>
      <div className="flex-1 text-sm">
        <p className="font-semibold">Complete your profile</p>
        <p className="mt-0.5 text-amber-800">
          Still needed: {missing.join(', ')}.{' '}
          <Link href="/member/profile" className="font-semibold underline">Update now</Link>
        </p>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-amber-700 hover:text-amber-900">
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
    </div>
  );
}
