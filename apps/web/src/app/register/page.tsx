'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi, saveAuthToken, saveAuthUser, ApiError } from '../../lib/api';
import { AuthShell, AuthError, AuthSubmit, authInputClass } from '../../components/AuthShell';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { safeDestination } from '../../lib/pwa/deep-link';

const MIN_PASSWORD = 12;

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
      const isPrivileged = data.user?.role === 'ADMIN' || data.user?.role === 'LEADER' || Boolean(data.user?.isSuperAdmin);
      router.push(safeDestination(new URLSearchParams(window.location.search).get('next'), isPrivileged));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < MIN_PASSWORD) return setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    setLoading(true);
    try {
      const res = await fetchApi<any>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
        }),
      });
      handleSuccessfulAuth(res);
    } catch (err: any) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Could not create your account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchApi<any>('/auth/google/member', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      handleSuccessfulAuth(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="For approved members of TFHC Orderliness"
      footer={<>Already have an account? <Link href="/login" className="text-primary underline">Sign in</Link></>}
    >
      <AuthError>{error}</AuthError>
      <form className="flex flex-col gap-stack-sm" onSubmit={submit}>
        <div>
          <input
            className={authInputClass}
            type="email"
            placeholder="Church member email address"
            required
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
          />
          <p className="text-[11px] text-on-surface-variant mt-1 px-1">
            Your details will automatically link from the member lookup table.
          </p>
        </div>
        <div className="relative flex items-center">
          <input
            className={authInputClass}
            type={showPassword ? 'text' : 'password'}
            placeholder={`Password (${MIN_PASSWORD}+ characters)`}
            required
            minLength={MIN_PASSWORD}
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
          <button
            type="button"
            aria-label="Toggle password visibility"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 text-outline hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility' : 'visibility_off'}</span>
          </button>
        </div>
        <AuthSubmit loading={loading}>
          <span>{loading ? 'Creating account…' : 'Create account & Sign in'}</span>
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </AuthSubmit>
      </form>

      <div className="relative my-2 flex items-center justify-center">
        <div className="w-full border-t border-outline-variant/30" />
        <span className="absolute bg-surface-container-lowest px-3 font-label-sm text-label-sm text-on-surface-variant">
          or
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <GoogleSignInButton onCredential={handleGoogleCredential} />
      </div>
    </AuthShell>
  );
}
