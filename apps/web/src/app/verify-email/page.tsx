'use client';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchApi, saveAuthToken } from '../../lib/api';
import { AuthShell, AuthError, AuthNotice } from '../../components/AuthShell';

function VerifyEmail() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token || token.length < 20) {
      setState('error');
      setMessage('This verification link is incomplete. Open the link from your email again.');
      return;
    }
    fetchApi<{ accessToken: string; user: { role: string } }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then((res) => {
        saveAuthToken(res.accessToken, true);
        setState('ok');
        setTimeout(() => router.replace(['ADMIN', 'LEADER'].includes(res.user.role) ? '/admin' : '/member'), 900);
      })
      .catch((err) => {
        setState('error');
        setMessage(err instanceof Error ? err.message : 'This verification link is invalid or has expired.');
      });
  }, [token, router]);

  return (
    <AuthShell title="Email verification" subtitle={state === 'working' ? 'Confirming your address…' : undefined}>
      {state === 'working' && <p className="text-center text-on-surface-variant">Just a moment…</p>}
      {state === 'ok' && <AuthNotice>Your email is confirmed. Taking you to your dashboard…</AuthNotice>}
      {state === 'error' && (
        <>
          <AuthError>{message}</AuthError>
          <div className="text-center text-sm text-on-surface-variant">
            <Link href="/login" className="text-primary underline">Go to sign in</Link> to request a new link.
          </div>
        </>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Email verification"><p className="text-center text-on-surface-variant">Loading…</p></AuthShell>}>
      <VerifyEmail />
    </Suspense>
  );
}
