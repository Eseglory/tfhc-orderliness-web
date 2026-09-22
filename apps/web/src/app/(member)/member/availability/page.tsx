'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi, ApiError } from '../../../../lib/api';
import { LogoIcon } from '../../../../components/LogoIcon';

type AvailabilityMeeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  locationName: string;
};

type AvailabilityResponse = {
  cycle: {
    id: string;
    state: string;
    opensAt: string;
    closesAt: string;
    isOpen?: boolean;
    isRecovery?: boolean;
    nextOpensAt?: string;
  };
  meetings: AvailabilityMeeting[];
  selectedMeetingIds: string[];
  submitted: boolean;
  submittedAt?: string | null;
};

export default function MemberAvailabilityPage() {
  const router = useRouter();
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchApi<AvailabilityResponse>('/availability/current');
      setData(response);
      setSelected(response.selectedMeetingIds || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Weekly availability has not opened yet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await fetchApi('/availability/current', {
        method: 'PUT',
        body: JSON.stringify({ meetingIds: selected }),
      });
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your availability.');
    } finally {
      setSaving(false);
    }
  };

  const isOpen = data
    ? Boolean(
        data.cycle.isOpen ??
          (data.cycle.state === 'OPEN' && new Date(data.cycle.closesAt) > new Date() && new Date(data.cycle.opensAt) <= new Date()),
      )
    : false;

  const isRecovery = Boolean(data?.cycle?.isRecovery);
  const isSubmitted = Boolean(data?.submitted);

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen pb-safe">
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center transition-all duration-200 active:scale-95 hover:opacity-80"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <div>
            <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Weekly Availability</h1>
            <p className="text-[11px] font-semibold text-on-surface-variant">
              {isRecovery ? 'Tuesday Recovery Window (Closes 11:59 PM WAT)' : 'Open: Monday 12:00 AM – 12:00 PM WAT'}
            </p>
          </div>
        </div>
      </header>

      <main className="px-edge-margin pb-32 max-w-3xl mx-auto pt-stack-md">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
            <p className="font-body-md text-body-md">Loading this week&apos;s schedule…</p>
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <span className="material-symbols-outlined text-4xl text-outline-variant">event_busy</span>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">{error}</p>
            <button
              onClick={load}
              className="mt-2 px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container-high transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Status & Deadline Banner */}
            {isSubmitted ? (
              <div className="rounded-2xl p-5 mb-stack-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl shrink-0 mt-0.5">
                    verified
                  </span>
                  <div className="space-y-1">
                    <h2 className="font-headline-sm text-base font-extrabold text-emerald-900 dark:text-emerald-100">
                      Availability Submitted
                    </h2>
                    <p className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed">
                      You have submitted your availability for this week&apos;s service. No additional check-in is required.
                    </p>
                    {isOpen ? (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 pt-1 font-semibold">
                        {isRecovery
                          ? 'Tuesday recovery window remains open until 11:59 PM WAT. You may update your service selection below.'
                          : 'Window remains open until Monday at 12:00 PM WAT. You may update your service selection below.'}
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 pt-1">
                        Response recorded. See you at your scheduled service!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : !isOpen ? (
              <div className="rounded-2xl p-5 mb-stack-md border border-amber-300 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-2xl shrink-0 mt-0.5">
                    lock_clock
                  </span>
                  <div className="space-y-1">
                    <h2 className="font-headline-sm text-base font-extrabold text-amber-900 dark:text-amber-100">
                      Availability Closed
                    </h2>
                    <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                      The weekly availability window closed.
                    </p>
                    <p className="text-xs text-amber-900 dark:text-amber-200 font-bold pt-1">
                      Next regular window: Monday at 12:00 AM WAT.
                    </p>
                  </div>
                </div>
              </div>
            ) : isRecovery ? (
              <div className="rounded-2xl p-5 mb-stack-md border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/40 text-slate-900 dark:text-white shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-2xl shrink-0 mt-0.5">
                    published_with_changes
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-black uppercase">
                        Tuesday Recovery Window
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
                        Closes Tonight at 11:59 PM WAT
                      </span>
                    </div>
                    <h2 className="font-headline-sm text-base font-extrabold text-amber-950 dark:text-amber-100 mt-1">
                      Submit This Week&apos;s Availability
                    </h2>
                    <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium leading-relaxed">
                      Following Monday&apos;s missed window, availability has been reopened today for this week only. Please select the services you expect to attend below.
                    </p>
                    <p className="text-[11px] text-on-surface-variant font-medium pt-1">
                      Standard schedule remains every Monday 12:00 AM – 12:00 PM WAT.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-5 mb-stack-md border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/40 text-slate-900 dark:text-white shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-2xl shrink-0 mt-0.5">
                    event_available
                  </span>
                  <div className="space-y-1">
                    <h2 className="font-headline-sm text-base font-extrabold text-blue-950 dark:text-blue-100">
                      Weekly Availability Open
                    </h2>
                    <p className="text-xs sm:text-sm text-blue-900 dark:text-blue-200 font-medium leading-relaxed">
                      Let us know which services you will attend this week. Submitting your availability serves as your attendance confirmation.
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-300 font-bold pt-1">
                      Deadline: Monday at 12:00 PM WAT
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error ? <p role="alert" className="font-body-md text-sm font-bold text-error mb-stack-sm">{error}</p> : null}

            {data.meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-3xl text-outline-variant">event_available</span>
                <p className="font-body-md text-body-md">No eligible services are scheduled this week.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    This Week&apos;s Gatherings
                  </h3>
                  {isOpen ? (
                    <span className="text-xs font-semibold text-primary">Select all that apply</span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">View only</span>
                  )}
                </div>

                {data.meetings.map((m) => {
                  const isSelected = selected.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!isOpen}
                      onClick={() => toggle(m.id)}
                      className={`w-full text-left bg-surface-container-lowest p-4 sm:p-5 rounded-2xl shadow-xs border flex items-center justify-between gap-4 transition-all duration-150 ${
                        !isOpen ? 'opacity-80 cursor-default' : 'hover:border-primary/50 active:scale-[0.99]'
                      } ${
                        isSelected
                          ? 'border-primary ring-1 ring-primary/30 bg-primary/5 dark:bg-primary/10'
                          : 'border-outline-variant/20'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-headline-sm text-base sm:text-lg text-primary font-bold truncate">
                            {m.title}
                          </h4>
                          {isSelected && isSubmitted && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold">
                              Confirmed
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-on-surface-variant text-xs sm:text-sm font-medium">
                          <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
                          <span>
                            {new Date(m.startTime).toLocaleString('en-GB', {
                              timeZone: 'Africa/Lagos',
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })} WAT
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-on-surface-variant text-xs sm:text-sm font-medium">
                          <span className="material-symbols-outlined text-[16px] text-primary">location_on</span>
                          <span className="truncate">{m.locationName || "The Father's House Church"}</span>
                        </div>
                      </div>

                      <span
                        className={`material-symbols-outlined text-2xl sm:text-3xl shrink-0 transition-colors ${
                          isSelected ? 'text-primary' : 'text-outline-variant'
                        }`}
                      >
                        {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {isOpen && data.meetings.length > 0 ? (
              <div className="mt-8 space-y-2">
                <button
                  onClick={submit}
                  disabled={saving}
                  className="w-full bg-primary hover:bg-primary/90 text-on-primary font-label-md text-base py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform duration-200 active:scale-[0.98] font-bold disabled:opacity-60 shadow-md"
                >
                  <span className="material-symbols-outlined text-xl">
                    {isSubmitted ? 'update' : 'send'}
                  </span>
                  <span>
                    {saving
                      ? 'Saving…'
                      : isSubmitted
                      ? 'Update Availability'
                      : 'Submit Availability'}
                  </span>
                </button>
                {savedAt ? (
                  <p className="text-center font-label-sm text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-sm">check</span>
                    <span>Availability recorded successfully! No additional check-in is required.</span>
                  </p>
                ) : (
                  <p className="text-center text-[11px] text-on-surface-variant">
                    You can update this until Monday at 12:00 PM WAT.
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

