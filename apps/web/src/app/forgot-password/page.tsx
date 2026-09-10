'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../lib/api';
import { AuthShell, AuthError, AuthNotice, AuthSubmit, authInputClass } from '../../components/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetchApi<{ ok: boolean; devUrl?: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setDevUrl(res.devUrl);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset link. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle={sent ? undefined : 'We’ll email you a link to choose a new one'}
      footer={<><Link href="/login" className="text-primary underline">Back to sign in</Link></>}
    >
      {sent ? (
        <>
          <AuthNotice>
            If <strong>{email.trim()}</strong> has an account, a password reset link is on its way. It expires in 1 hour.
          </AuthNotice>
          {devUrl && (
            <p className="text-xs text-on-surface-variant break-all">
              Dev: <a className="text-primary underline" href={devUrl}>{devUrl}</a>
            </p>
          )}
        </>
      ) : (
        <>
          <AuthError>{error}</AuthError>
          <form className="flex flex-col gap-stack-sm" onSubmit={submit}>
            <input className={authInputClass} type="email" placeholder="Your email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <AuthSubmit loading={loading}>
              <span>{loading ? 'Sending…' : 'Send reset link'}</span>
            </AuthSubmit>
          </form>
        </>
      )}
    </AuthShell>
  );
}
