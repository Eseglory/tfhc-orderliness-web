'use client';
import { AuthTransition } from '../../components/AuthTransition';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi, saveAuthToken, ApiError } from '../../lib/api';
import { LogoIcon } from '../../components/LogoIcon';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

export default function LoginPage() {
  const router = useRouter();
  const [leftVenue, setLeftVenue] = useState(false);
  useEffect(() => { setLeftVenue(new URLSearchParams(window.location.search).get('reason') === 'left-venue'); }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNeedsVerification(false);
    setResent('');

    try {
      const data = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      saveAuthToken(data.accessToken, rememberMe);

      if (data.user.role === 'ADMIN' || data.user.role === 'LEADER') {
        router.push('/admin');
      } else {
        router.push('/member');
      }
    } catch (err: any) {
      if (err instanceof ApiError && /confirm your email/i.test(err.message)) {
        setNeedsVerification(true);
        setError(err.message);
      } else {
        setError(err.message || 'Sign in failed. Please check credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setResent('');
    try {
      await fetchApi('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
    } catch {
      /* uniform response regardless */
    }
    setResent('If that account still needs confirming, a new link is on its way.');
  };

  const handleGoogleCredential = async (idToken: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchApi('/auth/google/member', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      saveAuthToken(data.accessToken, rememberMe);
      router.push('/member');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center p-edge-margin font-body-md antialiased selection:bg-primary-fixed selection:text-on-primary-fixed">
      {loading && <AuthTransition action="in" />}
      {/* Main Authentication Container matching Stitch Screen 2 */}
      <main className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] p-stack-lg border border-outline-variant/30 flex flex-col gap-stack-lg relative overflow-hidden">
        {/* Subtle decorative top accent */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>

        {leftVenue && <p role="status" className="rounded-lg bg-secondary/10 p-3 text-sm">You were signed out after your location was confirmed outside the venue.</p>}
        {/* Header / Brand Section */}
        <header className="flex flex-col items-center text-center gap-stack-sm pt-stack-sm">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-2 shadow-sm border border-outline-variant/20 text-primary relative p-2">
            <LogoIcon alt="TFHC Logo" className="w-full h-full object-contain" />
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-secondary rounded-full border-2 border-surface-container-lowest"></div>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">TFHC Orderliness</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Attendance &amp; Participation Tracker</p>
        </header>

        {error && (
          <div className="p-3 rounded-lg bg-error-container text-on-error-container font-body-md text-sm border border-error/20 text-center space-y-2">
            <p>{error}</p>
            {needsVerification && (
              <button type="button" onClick={resendVerification} className="text-sm font-semibold underline">
                Resend confirmation email
              </button>
            )}
          </div>
        )}
        {resent && (
          <p role="status" className="text-xs text-center text-on-surface-variant">{resent}</p>
        )}

        {/* Form Section */}
        <form className="flex flex-col gap-stack-md mt-4" onSubmit={handleLogin}>
          {/* Member ID / Email Input */}
          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-label-sm text-on-surface-variant ml-1" htmlFor="memberId">
              Member ID / Email
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-outline flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-xl">badge</span>
              </div>
              <input
                id="memberId"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface h-12 pl-10 pr-4 rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary transition-colors text-on-surface font-body-md placeholder-outline-variant"
                placeholder="your.email@example.com"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-label-sm text-on-surface-variant ml-1" htmlFor="password">
              Password
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-outline flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-xl">lock</span>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface h-12 pl-10 pr-12 rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary transition-colors text-on-surface font-body-md placeholder-outline-variant"
                placeholder="Enter your password"
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-outline hover:text-on-surface transition-colors flex items-center justify-center p-1 rounded-full focus:outline-none"
              >
                <span className="material-symbols-outlined text-xl">
                  {showPassword ? 'visibility' : 'visibility_off'}
                </span>
              </button>
            </div>
          </div>

          {/* Session persistence */}
          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-outline-variant bg-surface" />
              <span className="font-label-sm text-label-sm text-on-surface-variant group-hover:text-on-surface transition-colors">Remember Me</span>
            </label>
            <Link href="/forgot-password" className="font-label-sm text-label-sm text-primary hover:underline">Forgot password?</Link>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-primary text-on-primary font-label-md text-label-md rounded-lg mt-stack-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <span>{loading ? 'Signing In...' : 'Sign In'}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </form>

        {/* Members may also sign in with Google (see /auth/google/member) */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-outline-variant" />
          <span className="font-label-sm text-label-sm text-on-surface-variant">or</span>
          <div className="flex-1 h-px bg-outline-variant" />
        </div>
        <GoogleSignInButton onCredential={handleGoogleCredential} />

        <p className="text-center font-body-md text-body-md text-on-surface-variant">
          New here?{' '}
          <Link href="/register" className="text-primary font-semibold hover:underline">Create an account</Link>
        </p>
      </main>

      <footer className="mt-stack-lg text-center">
        <span className="font-body-md text-body-md text-outline flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[18px]">help</span>
          Registration is open to approved members only
        </span>
      </footer>
    </div>
  );
}
