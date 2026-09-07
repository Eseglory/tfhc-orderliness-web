'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  cycle: { id: string; state: string; opensAt: string; closesAt: string };
  meetings: AvailabilityMeeting[];
  selectedMeetingIds: string[];
  submitted: boolean;
};

export default function MemberAvailabilityPage() {
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
      setSelected(response.selectedMeetingIds);
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

  const closed = data ? data.cycle.state !== 'OPEN' || new Date(data.cycle.closesAt) <= new Date() : false;

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen pb-safe">
      <header className="bg-background flex justify-between items-center w-full px-edge-margin h-16 sticky top-0 z-40 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container flex-shrink-0 p-1">
            <LogoIcon alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-primary">Weekly Availability</h1>
        </div>
      </header>

      <main className="px-edge-margin pb-32 max-w-3xl mx-auto pt-stack-md">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
            <p className="font-body-md text-body-md">Loading this week&apos;s services…</p>
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
            <div
              className={`rounded-xl p-4 mb-stack-md border ${
                closed ? 'bg-surface-container-low border-outline-variant/30' : 'bg-surface-variant/50 border-surface-variant'
              }`}
            >
              <p className="font-label-md text-label-md font-semibold text-on-surface">
                {closed ? 'Availability window closed' : 'Let us know which services you plan to attend'}
              </p>
              <p className="font-body-md text-[13px] text-on-surface-variant mt-1">
                {closed
                  ? "This week's responses are no longer accepted."
                  : `Respond before ${new Date(data.cycle.closesAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>

            {error ? (
              <p className="font-body-md text-body-md text-error mb-stack-sm">{error}</p>
            ) : null}

            {data.meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-3xl text-outline-variant">event_available</span>
                <p className="font-body-md text-body-md">No eligible services are scheduled this week.</p>
              </div>
            ) : (
              <div className="space-y-gutter">
                {data.meetings.map((m) => {
                  const isSelected = selected.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={closed}
                      onClick={() => toggle(m.id)}
                      className={`w-full text-left bg-surface-container-lowest p-stack-md rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border flex items-center justify-between gap-stack-md transition-colors disabled:opacity-60 ${
                        isSelected ? 'border-primary' : 'border-surface-container-low'
                      }`}
                    >
                      <div>
                        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">{m.title}</h3>
                        <div className="mt-1 flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                          <span className="material-symbols-outlined text-[16px]">schedule</span>
                          <span>{new Date(m.startTime).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-on-surface-variant font-body-md text-body-md">
                          <span className="material-symbols-outlined text-[16px]">location_on</span>
                          <span>{m.locationName}</span>
                        </div>
                      </div>
                      <span
                        className={`material-symbols-outlined text-2xl shrink-0 ${
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

            {!closed && data.meetings.length > 0 ? (
              <div className="mt-section-gap">
                <button
                  onClick={submit}
                  disabled={saving}
                  className="w-full bg-primary hover:opacity-90 text-on-primary font-label-md text-label-md py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-transform duration-200 active:scale-[0.98] font-bold disabled:opacity-60 shadow-[0px_4px_12px_rgba(0,0,0,0.15)]"
                >
                  {saving ? 'Saving…' : 'Submit availability'}
                </button>
                {savedAt ? (
                  <p className="text-center font-label-sm text-label-sm text-on-tertiary-container mt-2">
                    Saved — you can update this until the window closes.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
