'use client';
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogoIcon } from '../../components/LogoIcon';
import { fetchApi, saveAuthToken, saveAuthUser } from '../../lib/api';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const missingToken = !token || token.length < 20;

  const handleSuccessfulAuth = (data: any) => {
    if (data?.accessToken) {
      saveAuthToken(data.accessToken, true);
      if (data.user) {
        saveAuthUser(
          {
            userId: data.user.id,
            email: data.user.email,
            role: data.user.role,
            memberId: data.user.member?.id,
            memberCode: data.user.member?.memberCode,
            firstName: data.user.member?.firstName,
            lastName: data.user.member?.lastName,
            permissions: data.user.permissions ?? data.permissions ?? [],
            accessRoles: data.user.accessRoles ?? data.accessRoles ?? [],
            isSuperAdmin: Boolean(data.user.isSuperAdmin ?? data.isSuperAdmin),
          },
          true,
        );
      }
      if (data.user?.role === 'MEMBER') {
        router.replace('/member');
      } else {
        router.replace('/admin');
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 12) return setError('Choose a password of at least 12 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      const res = await fetchApi<{ accessToken: string; user?: any }>('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      handleSuccessfulAuth(res);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not activate your account.');
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setSubmitting(true);
    setError('');
    try {
      const data = await fetchApi<any>('/auth/google/member', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      handleSuccessfulAuth(data);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
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
            <p className="text-xs text-on-surface-variant">Orderliness — Join & Access</p>
          </div>
        </div>

        {missingToken ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-bold text-on-surface">Get Started with TFHC Orderliness</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                You can join instantly using Google Sign-In or create your password.
              </p>
            </div>

            <div className="pt-2">
              <GoogleSignInButton onCredential={handleGoogleCredential} />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link
                href="/register"
                className="block w-full text-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"
              >
                Create account with password
              </Link>
              <Link
                href="/login"
                className="block w-full text-center rounded-lg border border-outline-variant/50 px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h1 className="text-lg font-bold text-on-surface">Set your login password</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                Create a password or sign in with Google to complete your account setup.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
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

            <div className="relative my-4 text-center">
              <span className="bg-surface-container-lowest px-2 text-xs text-on-surface-variant">or join with Google</span>
            </div>

            <GoogleSignInButton onCredential={handleGoogleCredential} />
          </div>
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
