'use client';
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogoIcon } from '../../components/LogoIcon';
import { fetchApi, saveAuthToken } from '../../lib/api';

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const missingToken = !token || token.length < 20;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 12) return setError('Choose a password of at least 12 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      const res = await fetchApi<{ accessToken: string }>('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      saveAuthToken(res.accessToken, true);
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate your account.');
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container p-1">
            <LogoIcon alt="The Father's House" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold text-primary">THE FATHER&apos;S HOUSE</p>
            <p className="text-xs text-on-surface-variant">Orderliness — Admin access</p>
          </div>
        </div>

        {missingToken ? (
          <div className="space-y-2">
            <h1 className="text-lg font-bold text-on-surface">Invitation link is incomplete</h1>
            <p className="text-sm text-on-surface-variant">
              Open the link from your invitation email again, or ask a Super Admin to resend it.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-lg font-bold text-on-surface">Set your password</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                Create a password to activate your administrator account.
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-on-surface">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="block text-xs text-on-surface-variant">At least 12 characters.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-on-surface">Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-error">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Activating…' : 'Activate account'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm text-on-surface-variant">Loading…</main>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
