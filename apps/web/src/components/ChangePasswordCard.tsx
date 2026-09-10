'use client';
import React, { useState } from 'react';
import { fetchApi, saveAuthToken, getAuthToken, ApiError } from '../lib/api';

const MIN_PASSWORD = 12;

/**
 * Self-service "change password" form. On success the API returns a fresh token
 * for this session (every other session is signed out); we swap it in place.
 * `variant` picks light (member, Stitch tokens) or dark (admin slate) styling.
 */
export function ChangePasswordCard({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const dark = variant === 'dark';
  const input = dark
    ? 'w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none'
    : 'w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < MIN_PASSWORD) return setError(`New password must be at least ${MIN_PASSWORD} characters.`);
    if (next !== confirm) return setError('New passwords do not match.');
    if (next === current) return setError('Choose a password you have not used before.');
    setBusy(true);
    try {
      const res = await fetchApi<{ accessToken: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      // Preserve where the token was stored (local vs session).
      const remembered = typeof window !== 'undefined' && !!localStorage.getItem('tfhc_token');
      saveAuthToken(res.accessToken, remembered);
      void getAuthToken();
      setDone(true);
      setOpen(false);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your password.');
    } finally {
      setBusy(false);
    }
  };

  const wrap = dark
    ? 'rounded-xl border border-slate-800 bg-slate-900/60 p-4'
    : 'bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] overflow-hidden';
  const heading = dark
    ? 'text-sm font-semibold text-slate-200'
    : 'font-label-md text-label-md text-on-surface-variant uppercase';

  return (
    <section className={wrap}>
      <div className={dark ? 'flex items-center justify-between' : 'flex items-center justify-between px-4 py-3 bg-surface-container-low border-b border-outline-variant/30'}>
        <h3 className={heading}>Password</h3>
        {!open && (
          <button
            onClick={() => { setOpen(true); setDone(false); }}
            className={dark ? 'text-sm font-semibold text-indigo-300 hover:underline' : 'text-sm font-semibold text-primary hover:underline'}
          >
            Change password
          </button>
        )}
      </div>
      <div className={dark ? 'pt-3' : 'p-4'}>
        {done && <p className={dark ? 'text-sm text-emerald-400' : 'text-sm text-[#137333]'}>Password updated. Other devices have been signed out.</p>}
        {!open && !done && (
          <p className={dark ? 'text-sm text-slate-400' : 'text-sm text-on-surface-variant'}>Update the password you use to sign in.</p>
        )}
        {open && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input className={input} type={show ? 'text' : 'password'} placeholder="Current password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <input className={input} type={show ? 'text' : 'password'} placeholder={`New password (${MIN_PASSWORD}+ characters)`} required minLength={MIN_PASSWORD} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <input className={input} type={show ? 'text' : 'password'} placeholder="Confirm new password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            <label className={dark ? 'flex items-center gap-2 text-xs text-slate-400' : 'flex items-center gap-2 text-xs text-on-surface-variant'}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
            </label>
            {error && <p role="alert" className={dark ? 'text-sm text-rose-400' : 'text-sm text-error'}>{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={dark ? 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50' : 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50'}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
              <button type="button" onClick={() => { setOpen(false); setError(''); }} className={dark ? 'rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200' : 'rounded-lg border border-outline-variant px-4 py-2 text-sm text-on-surface'}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
