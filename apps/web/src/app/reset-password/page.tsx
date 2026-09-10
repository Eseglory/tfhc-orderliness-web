'use client';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchApi, saveAuthToken } from '../../lib/api';
import { AuthShell, AuthError, AuthSubmit, authInputClass } from '../../components/AuthShell';

const MIN_PASSWORD = 12;

function ResetPassword() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const missingToken = !token || token.length < 20;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) return setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const res = await fetchApi<{ accessToken: string; user: { role: string } }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      saveAuthToken(res.accessToken, true);
      router.replace(['ADMIN', 'LEADER'].includes(res.user.role) ? '/admin' : '/member');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This reset link is invalid or has expired.');
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" footer={<><Link href="/login" className="text-primary underline">Back to sign in</Link></>}>
      {missingToken ? (
        <AuthError>This reset link is incomplete. Open the link from your email again, or request a new one.</AuthError>
      ) : (
        <>
          <AuthError>{error}</AuthError>
          <form className="flex flex-col gap-stack-sm" onSubmit={submit}>
            <div className="relative flex items-center">
              <input className={authInputClass} type={showPassword ? 'text' : 'password'} placeholder={`New password (${MIN_PASSWORD}+ characters)`} required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility' : 'visibility_off'}</span>
              </button>
            </div>
            <input className={authInputClass} type={showPassword ? 'text' : 'password'} placeholder="Confirm new password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            <AuthSubmit loading={loading}>
              <span>{loading ? 'Updating…' : 'Update password'}</span>
            </AuthSubmit>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Choose a new password"><p className="text-center text-on-surface-variant">Loading…</p></AuthShell>}>
      <ResetPassword />
    </Suspense>
  );
}
