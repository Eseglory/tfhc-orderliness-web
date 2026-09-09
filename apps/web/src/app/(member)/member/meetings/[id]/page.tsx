'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { fetchApi } from '../../../../../lib/api';

export default function MeetingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params?.id;

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [meeting, setMeeting] = useState<any>(null);

  useEffect(() => {
    if (meetingId) {
      fetchApi(`/meetings/${meetingId}`)
        .then((data) => setMeeting(data))
        .catch((err) => setError(err.message));
    }
  }, [meetingId]);

  const respond = async (attending: boolean) => {
    setSaving(true); setError('');
    try {
      const response = await fetchApi(`/meetings/${meetingId}/response`, { method: 'PUT', body: JSON.stringify({ attending }) });
      setMeeting((current: any) => ({ ...current, eventResponses: [response] }));
    } catch (err: any) { setError(err.message || 'Could not save your response'); }
    finally { setSaving(false); }
  };
  if (!meeting) return <main className="p-6"><p role={error ? 'alert' : 'status'}>{error || 'Loading event…'}</p></main>;
  const response = meeting.eventResponses?.[0];
  const responseOpen = ['SCHEDULED', 'ACTIVE'].includes(meeting.status) && new Date(meeting.startTime) > new Date();

  const title = meeting?.title || 'Sunday Service';
  const categoryName = meeting?.category?.name || 'Spiritual Gathering';
  const locationName = meeting?.locationName || 'Church Auditorium';
  const description = meeting?.description || 'No additional details provided.';

  const opensTime = meeting?.attendanceOpenTime ? new Date(meeting.attendanceOpenTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '8:15 AM';
  const expectedTime = meeting?.expectedArrivalTime ? new Date(meeting.expectedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '8:45 AM';
  const graceTime = meeting?.gracePeriodEndTime ? new Date(meeting.gracePeriodEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '9:10 AM';
  const closesTime = meeting?.attendanceCloseTime ? new Date(meeting.attendanceCloseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM';

  return (
    <div className="bg-background min-h-screen text-on-background pb-32 font-body-md">
      {/* Header matching Stitch Screen 7 */}
      <header className="flex justify-between items-center w-full px-edge-margin h-16 bg-background sticky top-0 z-40 border-b border-outline-variant/10">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="w-10 h-10 flex items-center justify-start text-primary transition-all duration-200 active:scale-95"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="font-headline-sm text-headline-sm font-bold text-primary tracking-tight">Meeting Details</h1>
        <div className="w-10 h-10 flex items-center justify-end"></div>
      </header>

      <main className="px-edge-margin mt-stack-md space-y-stack-lg max-w-2xl mx-auto">
        {/* Hero Section matching Stitch Screen 7 */}
        <section className="flex flex-col gap-stack-sm">
          <h2 className="font-headline-lg text-headline-lg text-primary font-bold">{title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-md text-label-md">
              {categoryName}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-error-container text-on-error-container font-label-md text-label-md">
              <span className="material-symbols-outlined text-[14px] mr-1">info</span>
              {meeting.isCompulsory ? 'Compulsory' : 'Optional'}
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            {description}
          </p>
        </section>

        <section className="rounded-xl bg-surface-container p-4 space-y-3">
          <h3 className="font-bold">Will you attend?</h3>
          <Link className="block underline" href="/member/submit-excuse">Request absence approval</Link>
          <p>{new Date(meeting.startTime).toLocaleString()}</p>
          <p role="status">{response ? (response.attending ? 'Your response: Attending' : 'Your response: Not attending') : 'You have not responded yet.'}</p>
          {error && <p role="alert" className="text-error">{error}</p>}
          {responseOpen ? <div className="flex gap-3">
            <button disabled={saving} aria-pressed={response?.attending === true} onClick={() => respond(true)} className="rounded-lg bg-primary text-on-primary px-4 py-3">Attending</button>
            <button disabled={saving} aria-pressed={response?.attending === false} onClick={() => respond(false)} className="rounded-lg border border-outline px-4 py-3">Not attending</button>
          </div> : <p>Responses are closed.</p>}
          <p className="text-sm">Your response can be changed until the event starts. Check in at the venue to record attendance.</p>
        </section>

        {/* Time Grid (2x2) matching Stitch Screen 7 */}
        <section>
          <h3 className="font-headline-sm text-headline-sm text-primary mb-stack-md font-bold">Attendance Window</h3>
          <div className="grid grid-cols-2 gap-gutter">
            {/* Grid Item 1 */}
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/20 flex flex-col items-start">
              <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary mb-3">
                <span className="material-symbols-outlined text-[18px]">lock_open</span>
              </div>
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">Opens</span>
              <span className="font-headline-md text-headline-md text-primary font-bold">{opensTime}</span>
            </div>

            {/* Grid Item 2 */}
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/20 flex flex-col items-start">
              <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary mb-3">
                <span className="material-symbols-outlined text-[18px]">schedule</span>
              </div>
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">Expected</span>
              <span className="font-headline-md text-headline-md text-primary font-bold">{expectedTime}</span>
            </div>

            {/* Grid Item 3 */}
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/20 flex flex-col items-start relative overflow-hidden">
              <div className="absolute top-0 right-0 w-2 h-full bg-secondary-container"></div>
              <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary mb-3">
                <span className="material-symbols-outlined text-[18px]">hourglass_bottom</span>
              </div>
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">Grace Period Ends</span>
              <span className="font-headline-md text-headline-md text-primary font-bold">{graceTime}</span>
            </div>

            {/* Grid Item 4 */}
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/20 flex flex-col items-start">
              <div className="w-8 h-8 rounded-full bg-error-container flex items-center justify-center text-on-error-container mb-3">
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </div>
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">Window Closes</span>
              <span className="font-headline-md text-headline-md text-primary font-bold">{closesTime}</span>
            </div>
          </div>
        </section>

        {/* Venue Map Card matching Stitch Screen 7 */}
        <section>
          <h3 className="font-headline-sm text-headline-sm text-primary mb-stack-md font-bold">Location Details</h3>
          <div className="bg-surface-container-lowest rounded-xl shadow-[0px_2px_8px_rgba(0,0,0,0.05)] border border-outline-variant/20 overflow-hidden">
            <div className="relative w-full h-40 bg-slate-900 flex items-center justify-center">
              <span className="material-symbols-outlined text-[48px] text-secondary animate-pulse">location_on</span>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-24 h-24 rounded-full border-2 border-secondary-container bg-secondary-container/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-secondary"></div>
                </div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-outline mt-0.5">location_on</span>
                <div>
                  <p className="font-headline-sm text-headline-sm text-primary font-bold">{locationName}</p>
                  <p className="font-body-md text-body-md text-on-surface-variant">Allowed check-in radius: {meeting?.geofenceRadiusMeters ?? 100} metres</p>
                </div>
              </div>
              <div className="w-full h-px bg-outline-variant/30 my-1"></div>
              <div className="flex items-center gap-3 bg-surface p-3 rounded-lg border border-outline-variant/20">
                <span className="material-symbols-outlined text-on-tertiary-container">check_circle</span>
                <p className="font-body-md text-body-md text-on-surface">
                  Your distance will be measured when you allow location access during check-in.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Floating Action Button Area matching Stitch Screen 7 */}
      <div className="fixed bottom-0 w-full px-edge-margin pb-safe pt-4 bg-gradient-to-t from-background via-background to-transparent z-50">
        <div className="max-w-2xl mx-auto pb-4">
          <button
            onClick={() => router.push(`/member/check-in?meetingId=${meetingId}`)}
            className="w-full bg-primary text-on-primary font-headline-sm text-headline-sm py-4 rounded-xl shadow-[0px_4px_12px_rgba(0,0,0,0.15)] flex justify-center items-center gap-2 transition-transform duration-200 active:scale-[0.98] hover:bg-primary/90"
          >
            <span className="material-symbols-outlined">location_on</span>
            Check-In Now
          </button>
        </div>
      </div>
    </div>
  );
}
