'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { fetchApi, ApiError } from '../../lib/api';
import { AuthShell, AuthError, AuthNotice, AuthSubmit, authInputClass } from '../../components/AuthShell';

const MIN_PASSWORD = 12;

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [devUrl, setDevUrl] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < MIN_PASSWORD) return setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const res = await fetchApi<{ pendingVerification: boolean; verifyUrl?: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
        }),
      });
      setDevUrl(res.verifyUrl);
      setDone(true);
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

  const resend = async () => {
    setResent(false);
    try {
      const res = await fetchApi<{ ok: boolean; devUrl?: string }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: form.email.trim() }) });
      setDevUrl(res.devUrl ?? devUrl);
      setResent(true);
    } catch {
      setResent(true);
    }
  };

  if (done) {
    return (
      <AuthShell title="Check your inbox" subtitle="One more step">
        <AuthNotice>
          We sent a confirmation link to <strong>{form.email.trim()}</strong>. Open it to activate your account and sign in.
        </AuthNotice>
        {devUrl && (
          <p className="text-xs text-on-surface-variant break-all">
            Dev: <a className="text-primary underline" href={devUrl}>{devUrl}</a>
          </p>
        )}
        <button onClick={resend} className="text-sm text-primary underline self-center">Resend confirmation email</button>
        {resent && <p className="text-xs text-center text-on-surface-variant">If that address needs a link, another one is on its way.</p>}
        <div className="text-center text-sm text-on-surface-variant">
          <Link href="/login" className="text-primary underline">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

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
            Your details will automatically link from the member directory.
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
        <div className="relative flex items-center">
          <input
            className={authInputClass}
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            required
            minLength={MIN_PASSWORD}
            value={form.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
          />
          <button
            type="button"
            aria-label="Toggle confirm password visibility"
            onClick={() => setShowConfirmPassword((v) => !v)}
            className="absolute right-3 text-outline hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-xl">{showConfirmPassword ? 'visibility' : 'visibility_off'}</span>
          </button>
        </div>
        <AuthSubmit loading={loading}>
          <span>{loading ? 'Creating account…' : 'Create account'}</span>
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
