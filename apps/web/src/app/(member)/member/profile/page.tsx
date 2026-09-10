'use client';
import { AuthTransition } from '../../../../components/AuthTransition';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ProfilePhoto } from '../../../../components/ProfilePhoto';
import { useRouter } from 'next/navigation';
import { fetchApi, logout, ApiError } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';
import { ChangePasswordCard } from '../../../../components/ChangePasswordCard';

type Profile = {
  id: string;
  memberCode: string;
  profilePhotoUrl: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  phoneNumber: string | null;
  alternatePhoneNumber: string | null;
  address: string | null;
  profession: string | null;
  gender: string | null;
  birthday: string | null;
  dateOfBirth: string | null;
  dateJoined: string | null;
  status: string;
  subTeam?: { name: string } | null;
  user?: { email: string | null } | null;
};

type FormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  phoneNumber: string;
  alternatePhoneNumber: string;
  address: string;
  profession: string;
  gender: string;
  birthday: string;
  dateOfBirth: string;
};

const toForm = (p: Profile): FormState => ({
  firstName: p.firstName ?? '',
  middleName: p.middleName ?? '',
  lastName: p.lastName ?? '',
  preferredName: p.preferredName ?? '',
  phoneNumber: p.phoneNumber ?? '',
  alternatePhoneNumber: p.alternatePhoneNumber ?? '',
  address: p.address ?? '',
  profession: p.profession ?? '',
  gender: p.gender ?? '',
  birthday: p.birthday ?? '',
  dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
});

export default function MemberProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<Profile>('/members/me/profile');
      setProfile(data);
      setForm(toForm(data));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [signingOut, setSigningOut] = useState(false);
  const handleLogout = () => {
    setSigningOut(true);
    void logout().finally(() => requestAnimationFrame(() => requestAnimationFrame(() => router.replace('/login'))));
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
      const updated = await fetchApi<Profile>('/members/me/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setProfile(updated);
      setForm(toForm(updated));
      setEditing(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : '';
  const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : '—');

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md pb-[90px]">
      {signingOut && <AuthTransition action="out" />}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background top-0 z-40 sticky border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-high border border-outline-variant flex-shrink-0">
            <LogoIcon alt="User profile" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary tracking-tight">My Profile</h1>
        </div>
        <Link href="/member/notifications" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors text-primary">
          <span className="material-symbols-outlined">notifications</span>
        </Link>
      </header>

      <main className="flex-1 px-edge-margin py-stack-md flex flex-col gap-section-gap w-full max-w-3xl mx-auto">
        {loading ? (
          <p role="status" className="text-center py-16 text-on-surface-variant">Loading your profile…</p>
        ) : !profile ? (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <p role="alert" className="text-error">{error}</p>
            <button onClick={load} className="px-4 py-2 rounded-lg bg-surface-container font-semibold">Try again</button>
          </div>
        ) : (
          <>
            <section className="flex flex-col items-center pt-stack-md pb-stack-lg gap-stack-md">
              <ProfilePhoto value={profile.profilePhotoUrl} endpoint="/members/me/photo" onChange={url => setProfile(p => p ? { ...p, profilePhotoUrl: url } : p)} />
              <div className="text-center flex flex-col gap-1">
                <h2 className="font-headline-sm text-headline-sm text-primary">{displayName}</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {profile.preferredName ? `“${profile.preferredName}” · ` : ''}{profile.subTeam?.name || 'No sub-team'}
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="font-label-sm text-label-sm bg-surface-container px-2 py-1 rounded text-on-surface-variant border border-outline-variant">
                    ID: {profile.memberCode}
                  </span>
                  <span className="font-label-sm text-label-sm bg-[#e6f4ea] text-[#137333] px-2 py-1 rounded font-semibold flex items-center gap-1 border border-[#ceead6]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#137333]"></span> {profile.status}
                  </span>
                </div>
              </div>
              {!editing && (
                <button
                  onClick={() => { setEditing(true); setSavedAt(null); setForm(toForm(profile)); }}
                  className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold hover:opacity-90 active:scale-[0.98] transition"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span> Edit profile
                </button>
              )}
              {savedAt && !editing && (
                <p className="font-label-sm text-label-sm text-[#137333]">Profile updated.</p>
              )}
            </section>

            {error && <p role="alert" className="text-error text-center -mt-4">{error}</p>}

            {editing ? (
              <form onSubmit={save} className="bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-4">
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase">Edit personal information</h3>
                {([
                  ['firstName', 'First name', 'text'],
                  ['middleName', 'Middle name', 'text'],
                  ['lastName', 'Last name', 'text'],
                  ['preferredName', 'Preferred name', 'text'],
                  ['phoneNumber', 'Phone number', 'tel'],
                  ['alternatePhoneNumber', 'Alternate phone', 'tel'],
                  ['address', 'Address', 'text'],
                  ['profession', 'Profession', 'text'],
                  ['gender', 'Gender', 'text'],
                  ['birthday', 'Birthday (MM-DD)', 'text'],
                  ['dateOfBirth', 'Date of birth', 'date'],
                ] as [keyof FormState, string, string][]).map(([key, label, type]) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
                    <input
                      type={type}
                      required={['firstName', 'lastName', 'phoneNumber'].includes(key)}
                      pattern={key === 'birthday' ? '[0-9]{2}-[0-9]{2}' : undefined}
                      placeholder={key === 'birthday' ? '03-14' : undefined}
                      value={form?.[key] ?? ''}
                      onChange={set(key)}
                      max={type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
                      className="h-11 px-3 rounded-lg border border-outline-variant bg-surface focus:border-primary focus:ring-1 focus:ring-primary text-on-surface"
                    />
                  </label>
                ))}
                <p className="text-sm text-on-surface-variant">Email: {profile.user?.email}. Your sign-in email cannot be changed.</p>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold disabled:opacity-60">
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" disabled={saving} onClick={() => { setEditing(false); setError(''); setForm(toForm(profile)); }} className="h-11 px-4 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <section className="bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase px-4 py-3 bg-surface-container-low border-b border-outline-variant/30">
                  Personal Information
                </h3>
                <div className="flex flex-col">
                  {([
                    ['phone', 'Phone', profile.phoneNumber || '—'],
                    ['phone_iphone', 'Alternate phone', profile.alternatePhoneNumber || '—'],
                    ['mail', 'Email', profile.user?.email || '—'],
                    ['home', 'Address', profile.address || '—'],
                    ['work', 'Profession', profile.profession || '—'],
                    ['person', 'Gender', profile.gender || '—'],
                    ['cake', 'Birthday', profile.birthday ? new Date(`2000-${profile.birthday}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' }) : '—'],
                    ['cake', 'Date of birth', fmtDate(profile.dateOfBirth)],
                    ['event', 'Joined', fmtDate(profile.dateJoined)],
                  ] as [string, string, string][]).map(([icon, label, value], i, arr) => (
                    <div key={label} className={`flex items-center gap-3 p-4 ${i < arr.length - 1 ? 'border-b border-outline-variant/30' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                        <span className="material-symbols-outlined text-[18px]">{icon}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
                        <span className="font-body-md text-body-md text-primary break-words">{value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
              <h3 className="font-label-md text-label-md text-on-surface-variant uppercase px-4 py-3 bg-surface-container-low border-b border-outline-variant/30">
                Settings &amp; Preferences
              </h3>
              <Link href="/member/availability" className="flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px]">event_available</span>
                  </div>
                  <span className="font-body-md text-body-md text-primary font-medium">Weekly Availability</span>
                </div>
                <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
              </Link>
            </section>

            <div className="uppercase font-label-md text-label-md text-on-surface-variant px-1">Account &amp; security</div>
            <ChangePasswordCard variant="light" />

            <section className="pb-stack-lg">
              <button
                onClick={handleLogout}
                className="w-full bg-surface-container-lowest border border-error/30 text-error font-body-md text-body-md font-medium py-3 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] hover:bg-error-container/20 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                Log Out
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
